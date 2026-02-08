# Next Edit Safe Path Audit — Option B Chat Unification

**Purpose:** Confirm the exact safest "next edit" for Option B chat unification in a way that cannot break the app (no white screens).

**Scope:** SupabaseLiveChat.jsx, liveChat.ts (only functions used by SupabaseLiveChat), LiveShow.jsx and HostConsole.jsx (mount expectations only).

**Audit Type:** Read-only. No code modifications.

---

## 1. Realtime Presence Check

**Search performed:** `supabase.channel(`, `.on('postgres_changes'`, `subscribe(`, `removeChannel(` in `SupabaseLiveChat.jsx`

**Result:** No matches found.

**Verdict:** No realtime subscription exists in SupabaseLiveChat.jsx. The component is 100% polling-based.

---

## 2. Polling Driver Map (Hard Facts)

### 2.1 pollMessages Definition and Polling useEffect

| Location | Description |
|----------|-------------|
| `SupabaseLiveChat.jsx:211-254` | `pollMessages` useCallback definition |
| `SupabaseLiveChat.jsx:256-271` | Polling useEffect: initial `pollMessages()` + `setInterval(pollMessages, 2500)` |
| `SupabaseLiveChat.jsx:264` | `pollingIntervalRef.current = setInterval(pollMessages, POLL_INTERVAL)` |
| `SupabaseLiveChat.jsx:96` | `POLL_INTERVAL = 2500` |

### 2.2 Side Effects pollMessages Triggers (Exact Line References)

| Side Effect | File:Line | What It Does |
|-------------|-----------|--------------|
| **Message insertion / merging** | `237-241` | `setMessages((prev) => [...prev, ...onlyNew])` with 100-msg cap via `merged.slice(-100)` |
| **knownMessageIdsRef updates** | `224`, `227`, `231-235` | Filter `onlyNew` with `!knownMessageIdsRef.current.has(m.id)`; add IDs; trim if size > 150 |
| **fetchBuyerNames** | `246` | `fetchBuyerNames(onlyNew)` — hydrates sender names for viewer-role messages via `buyer_profiles` |
| **checkAvailability** | `251` | `await checkAvailability()` — sets `isChatAvailable` and `showEnded` when show no longer live |
| **resetFadeTimer** | `247` | Resets overlay fade; sets `fadeMessages` false, then true after 5s (lines 284-296) |

### 2.3 UI Dependencies on checkAvailability

| State | Set By | UI Impact |
|-------|--------|-----------|
| `isChatAvailable` | `checkAvailability` → `setIsChatAvailable(available)` | Line 74 init `true`; 335, 398, 403, 416, 423 disable input / show "Chat ended" |
| `showEnded` | `checkAvailability` when `!available` → `setShowEnded(true)` | Line 384: early return "Show has ended" UI with "Message Seller" CTA |

### 2.4 Bullet List (file:line)

- `211-254`: pollMessages definition
- `213-215`: getLiveShowMessages(showId, { limit: 100 })
- `217-222`: lastMessageIdRef comparison; early exit if no new messages
- `224`: onlyNew = filter by !knownMessageIdsRef.has(m.id)
- `227`: knownMessageIdsRef.add for each onlyNew
- `231-235`: trim knownMessageIdsRef if size > 150
- `237-241`: setMessages merged + slice(-100)
- `246`: fetchBuyerNames(onlyNew)
- `247`: resetFadeTimer()
- `251`: await checkAvailability()
- `256-271`: useEffect — pollMessages() initial, setInterval, clearInterval cleanup

---

## 3. Message Lifecycle Map

### 3.1 Path A: Polling

| Step | Location | Dedupe | Hydration | Timers |
|------|----------|--------|-----------|--------|
| Fetch | 213-215 | — | — | — |
| Filter new | 224 | `knownMessageIdsRef.has(m.id)` | — | — |
| Add IDs | 227 | — | — | — |
| Append state | 237-241 | — | — | — |
| Hydrate names | 246 | — | `fetchBuyerNames(onlyNew)` | — |
| Reset fade | 247 | — | — | `resetFadeTimer()` |

### 3.2 Path B: Optimistic Send

| Step | Location | Dedupe | Hydration | Timers |
|------|----------|--------|-----------|--------|
| Send API | 342-346 | — | — | — |
| Append state | 355 | — | — | — |
| Add ID | 356 | `knownMessageIdsRef.add(message.id)` | — | — |
| Hydrate names | 359-361 | — | `fetchBuyerNames([message])` if viewer | — |
| Reset fade | 358 | — | — | `resetFadeTimer()` |

### 3.3 Path C: Realtime

**Does not exist.** No realtime subscription in SupabaseLiveChat.jsx.

### 3.4 Summary Table

| Path | Dedupe | Hydration | Timers |
|------|--------|-----------|--------|
| Polling | knownMessageIdsRef filter | fetchBuyerNames(onlyNew) | resetFadeTimer |
| Optimistic | knownMessageIdsRef.add | fetchBuyerNames([message]) | resetFadeTimer |
| Realtime | — | — | — |

---

## 4. "Safe to Gate?" Verdict

### NOT SAFE to gate polling today

**Reason:** No realtime path exists. Gating polling would remove the only mechanism for:
- Receiving messages from other users
- Buyer name hydration for other viewers
- Availability checks (show end detection)
- Fade timer reset on others' messages

### What Realtime Must Do First (Parity Requirements)

Before polling can be gated, realtime must:

1. **Deliver new messages** — Subscribe to `INSERT` on `live_show_messages` filtered by `show_id`
2. **Deduplicate** — Add each new message ID to `knownMessageIdsRef` before appending state
3. **Hydrate buyer names** — Call `fetchBuyerNames([message])` for each new viewer message
4. **Reset fade timer** — Call `resetFadeTimer()` when new messages arrive
5. **Cover initial load** — Either realtime delivers initial backlog, or initial fetch remains ungated

### What Must Remain Ungated (or Be Handled Separately)

| Dependency | Recommendation |
|------------|----------------|
| **Availability check** | `checkAvailability` is only called from pollMessages. Options: (a) separate availability polling at longer interval, (b) show status realtime subscription, (c) parent passes show status down |
| **Initial message load** | If realtime connects after mount, need one-time fetch or realtime backlog; otherwise messages stay empty |

---

## 5. Parity Checklist

Exact side effects realtime must cover before polling can be gated:

| # | Side Effect | Current Location | Realtime Must |
|---|-------------|------------------|---------------|
| 1 | Append messages to state | 237-241 | Append new messages via setMessages, cap at 100 |
| 2 | Add message IDs to knownMessageIdsRef | 227 | knownMessageIdsRef.current.add(m.id) for each new |
| 3 | Trim knownMessageIdsRef if > 150 | 231-235 | Same logic when processing batches |
| 4 | Call fetchBuyerNames for viewer messages | 246 | fetchBuyerNames([message]) for each new viewer message |
| 5 | Call resetFadeTimer | 247 | resetFadeTimer() when new messages arrive |
| 6 | Run checkAvailability | 251 | Separate mechanism (see Step D below) |

---

## 6. Next Edit Specification (Plan Only)

### Step A: Implement Realtime INSERT Subscription

**Table:** `public.live_show_messages`  
**Event:** `INSERT`  
**Filter:** `show_id = eq.{showId}` (from props)

**Insertion point:** `SupabaseLiveChat.jsx` — new `useEffect` after the polling useEffect (after line 271), or immediately before the polling useEffect (around line 256). Use same `showId` guard as polling.

**Safest placement:** After line 271 (after polling useEffect), so existing polling behavior is untouched. The new effect subscribes when `showId` is set and unsubscribes on cleanup.

**Why safe:** Additive only. Polling continues to run. No existing logic is modified.

---

### Step B: Implement Shared Helper (e.g., applyIncomingMessages)

**Purpose:** Both polling and realtime use the same logic for: dedupe, append, hydrate, reset timer.

**Insertion point:** `SupabaseLiveChat.jsx` — new function (or `useCallback`) defined above `pollMessages` (e.g., after line 207, before `pollMessages` at 211).

**Signature (conceptual):**
```
applyIncomingMessages(incomingMessages: LiveChatMessage[])
```
- Filter to `onlyNew` using `knownMessageIdsRef.has(m.id)`
- If onlyNew.length === 0, return
- Add IDs to knownMessageIdsRef
- Trim ref if size > 150
- setMessages(prev => [...prev, ...onlyNew].slice(-100))
- fetchBuyerNames(onlyNew)
- resetFadeTimer()

**Refactor:** `pollMessages` (226-248) calls this helper instead of inline logic. Realtime handler also calls it.

**Why safe:** Pure extraction. Behavior unchanged. Single source of truth for append logic.

---

### Step C: Keep Polling as Fallback — Do NOT Gate Until A+B Proven

**Action:** No gating in this step. Polling continues to run at full 2500ms interval.

**Insertion point:** None. This is a constraint: do not add conditional logic to skip or throttle polling until realtime is implemented and tested.

**Why safe:** Avoids regressions. Realtime and polling run in parallel initially. Dedupe via knownMessageIdsRef prevents duplicates.

---

### Step D: Separate Availability from Message Polling

**Current state:** `checkAvailability()` is called inside `pollMessages()` at line 251.

**Recommended approach:** Extract availability check to its own effect with a longer interval (e.g., 10–15 seconds). This allows:
- Availability to be checked even if message polling is eventually gated
- Reduced coupling between message delivery and show-end detection

**Insertion point (Option 1 — Minimal):** Add a second `useEffect` in `SupabaseLiveChat.jsx` (after line 271) that runs `checkAvailability()` on mount and every 10–15 seconds via `setInterval`. Leave the call inside `pollMessages` for now (redundant but safe).

**Insertion point (Option 2 — Clean):** Remove `checkAvailability` from inside `pollMessages` (delete line 251) and add a standalone availability useEffect. This requires the new effect to be in place first.

**Safest minimal approach:** Option 1 — add availability-only effect without removing from pollMessages. Redundant calls are harmless. Later, remove from pollMessages once gating is implemented.

---

## 7. Mount Expectations (LiveShow / HostConsole)

### LiveShow.jsx

| Location | Condition | SupabaseLiveChat Mount |
|----------|-----------|-------------------------|
| 976-982 | `useSupabaseChat` (mobile, full overlay) | `showId`, `sellerId`, `isSeller`, `user`, `isOverlay={true}` |
| 1453-1459 | `useSupabaseChat` (desktop) | `showId`, `sellerId`, `isSeller`, `user`, `isOverlay={false}` |

`useSupabaseChat` = `show?.stream_status === 'starting' || 'live' || show?.is_streaming === true || show?.status === 'live'`

### HostConsole.jsx

| Location | Condition | SupabaseLiveChat Mount |
|----------|-----------|-------------------------|
| 1237-1243 | `useSupabaseChat` (mobile) | `showId`, `sellerId`, `isSeller`, `user`, `isOverlay={true}` |
| 1730-1736 | `useSupabaseChat` (desktop) | `showId`, `sellerId`, `isSeller`, `user`, `isOverlay={false}` |

**Expectation:** SupabaseLiveChat receives `showId` and mounts when show is starting/live. No changes to mount logic required for Option B; chat unification is internal to SupabaseLiveChat.

---

## 8. Evidence Table

| File:Line | Finding |
|-----------|---------|
| SupabaseLiveChat.jsx | No realtime; grep for channel/postgres_changes/subscribe/removeChannel returned no matches |
| SupabaseLiveChat.jsx:211-254 | pollMessages definition |
| SupabaseLiveChat.jsx:224 | Dedupe via knownMessageIdsRef.has(m.id) |
| SupabaseLiveChat.jsx:227 | knownMessageIdsRef.add |
| SupabaseLiveChat.jsx:231-235 | Ref trim |
| SupabaseLiveChat.jsx:237-241 | setMessages merge + slice(-100) |
| SupabaseLiveChat.jsx:246 | fetchBuyerNames(onlyNew) |
| SupabaseLiveChat.jsx:247 | resetFadeTimer() |
| SupabaseLiveChat.jsx:251 | checkAvailability() |
| SupabaseLiveChat.jsx:256-271 | Polling useEffect |
| SupabaseLiveChat.jsx:355-361 | Optimistic send: setMessages, knownMessageIdsRef.add, fetchBuyerNames, resetFadeTimer |
| liveChat.ts:66-124 | getLiveShowMessages — used by pollMessages |
| liveChat.ts:219-241 | isLiveChatAvailable — used by checkAvailability |

---

## 9. Summary

| Section | Conclusion |
|---------|------|
| **Verdict** | NOT SAFE to gate polling today |
| **Parity checklist** | 6 side effects realtime must cover (see Section 5) |
| **Next edit order** | A (realtime) → B (helper) → C (no gating) → D (availability separation) |
| **Safest insertion** | Step A: new useEffect after 271; Step B: helper above 211, refactor 226-248; Step D: new availability useEffect after 271 |
