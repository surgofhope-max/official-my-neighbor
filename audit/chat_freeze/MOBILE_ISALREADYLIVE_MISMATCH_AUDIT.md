# MOBILE `isAlreadyLive` MISMATCH AUDIT

**Date:** 2025-02-07  
**Scope:** `src/pages/HostConsole.jsx`  
**Goal:** Prove why `isAlreadyLive` is false on mobile HostConsole even when the host is actively live.

---

## 1. Definition of `isAlreadyLive`

**Exact line of code (HostConsole.jsx:674):**

```javascript
const isAlreadyLive = show?.stream_status === "live";
```

**Fields used:**
- `show.stream_status` (must be exactly `"live"`)

**Narrowness:** `isAlreadyLive` does **not** consider:
- `show?.stream_status === "starting"`
- `show?.is_streaming === true`
- `show?.status === "live"`

---

## 2. Other Derived Live Flags in HostConsole.jsx

| Flag | Location | Definition / Usage |
|------|----------|--------------------|
| **isShowLiveUI** | 289–295 | `show?.stream_status === 'starting' \|\| show?.stream_status === 'live' \|\| show?.is_streaming === true \|\| show?.status === 'live'` |
| **isShowLive** | 8 (import), 1683 | Imported from `@/api/streamSync`; used for GIVI drawer gate |
| **isBroadcastBlocked** | 671 | `show?.status === "ended" \|\| show?.status === "cancelled"` |
| **stream_status** | 291–292, 674, 693, 738, 818, 842 | Direct checks on `show.stream_status` |

**Critical distinction:** `isShowLiveUI` is broader than `isAlreadyLive` — it treats `"starting"`, `is_streaming`, and `status === 'live'` as live. `isAlreadyLive` only treats `stream_status === "live"`.

---

## 3. Source of `show` in HostConsole

**Hook:** `useQuery` (TanStack Query)

**Location:** HostConsole.jsx:249–269

```javascript
const { data: show, isLoading: showLoading, error: showError } = useQuery({
  queryKey: ['show', showId],
  queryFn: async () => {
    const fetchedShow = await getShowByIdWithStats(showId);
    // ...
    return fetchedShow;
  },
  enabled: !!showId,
  refetchInterval: 15000,
  staleTime: 10000
});
```

**API chain:**
- `getShowByIdWithStats(showId)` → `getShowById(showId)` + `fetchShowStats`
- `getShowById` selects `SHOWS_PUBLIC_FIELDS`, which includes `stream_status`

**Mobile vs desktop:** Same `useQuery` and `show` source for both layouts. No separate fetch for mobile.

---

## 4. Root Cause: Race After `startDailyBroadcast`

**Flow when host taps “Go Live”:**

1. **startDailyBroadcast** (679–763):
   - Calls `daily-create-room` Edge Function → gets `room_url`, `token`
   - Updates DB: `stream_status: "live"`, `status: "live"`
   - Sets local state: `dailyRoomUrl`, `dailyToken`, `isBroadcasting`
   - Calls `queryClient.invalidateQueries({ queryKey: ['show', showId] })`

2. **Query invalidation:**
   - Marks `['show', showId]` as stale
   - Triggers **async** refetch

3. **React render:**
   - `dailyRoomUrl` and `dailyToken` are set → `DailyBroadcaster` mounts
   - Host is live (room exists, DB updated)
   - Refetch may still be in flight
   - `show` can still hold **old** data (`stream_status` null or `"starting"`)

4. **Result:**
   - `isAlreadyLive = show?.stream_status === "live"` → **false**
   - Fulfillment button still visible (`!isAlreadyLive`)
   - Broadcast icon shows “Go Live” instead of “LIVE”

**Why it can look worse on mobile:**
- Same `show` source, but mobile often has slower network
- Longer refetch window → longer period where `isAlreadyLive` is false
- Mobile layout can visibly render the “wrong” UI during that window

---

## 5. Evidence Trail

| Evidence | Location |
|----------|----------|
| `isAlreadyLive` definition | 674 |
| `startDailyBroadcast` DB update | 732–739 |
| Query invalidation | 755 |
| No optimistic cache update | — |
| `DailyBroadcaster` gate | 1201: `dailyRoomUrl && dailyToken` (independent of `show`) |
| Mobile icon cluster uses `isAlreadyLive` | 1218–1221 (placeholder text), 1337 (Fulfillment), 1348–1368 (Broadcast) |

---

## 6. Proposed Temporary Console Log (AUDIT ONLY — do NOT commit)

**Purpose:** Confirm the race by logging `show` and derived flags right before the mobile top-right icon cluster.

**Placement:** Immediately before the mobile Host Controls / top-right icon cluster (before line 1294).

**Suggested log:**

```javascript
// TEMP AUDIT — remove before commit
console.log("[MOBILE_ISALREADYLIVE_AUDIT]", {
  stream_status: show?.stream_status,
  status: show?.status,
  is_streaming: show?.is_streaming,
  isAlreadyLive,
  isShowLiveUI,
  hasDailyRoom: !!(dailyRoomUrl && dailyToken),
  isBroadcasting,
  timestamp: new Date().toISOString()
});
```

**Interpretation:**
- If `hasDailyRoom: true` and `isBroadcasting: true` but `isAlreadyLive: false` → race confirmed.
- If `stream_status` is null, `"starting"`, or undefined → refetch not yet reflected.

---

## 7. Conclusion

**Root cause:** `isAlreadyLive` is false during the period between DB update + invalidation and completion of the show query refetch. Local state (`dailyRoomUrl`, `dailyToken`, `isBroadcasting`) is updated synchronously, but `show` comes from an async refetch. Until the refetch returns, `show.stream_status` remains stale.

**Recommendation (out of scope for this audit):** Consider an optimistic update of the show cache in `startDailyBroadcast` after the DB update, e.g. `queryClient.setQueryData(['show', showId], prev => ({ ...prev, stream_status: 'live', status: 'live' }))`, so `isAlreadyLive` is true immediately without waiting for the refetch.
