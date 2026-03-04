# Givey Winner Selection Realtime vs Polling Audit Report

**Date:** 2025-02-07  
**Goal:** Identify why Givey winner selection is not reflected in the buyer UI within seconds (realtime vs polling fallback).  
**Scope:** LiveShow, HostConsole, BuyerOrders, Supabase realtime config, DB-side signals.

---

## 1. FULL TERMINAL OUTPUT

*Note: `rg` (ripgrep) was not available on Windows; Python scripts ran with partial success (LiveShow OK; HostConsole/BuyerOrders/reference had UnicodeEncodeError or syntax issues on Windows cp1252). Grep-equivalent searches and direct file reads were used to produce this report.*

### rg equivalent (Grep tool output):

```
src/api/shows.ts:304:// Fetches viewer counts from show_realtime_stats...
src/api/shows.ts:335:      .from("show_realtime_stats")
src/pages/BuyerOrders.jsx:145:  const loadGiveyWins = async () => {
src/pages/BuyerOrders.jsx:158:  const loadWonGiveys = async () => {
src/pages/BuyerOrders.jsx:203:    loadGiveyWins();
src/pages/BuyerOrders.jsx:204:    loadWonGiveys();
src/pages/BuyerOrders.jsx:207:    const interval = setInterval(() => {
src/pages/BuyerOrders.jsx:209:      loadGiveyWins();
src/pages/BuyerOrders.jsx:210:      loadWonGiveys();
src/Layout.jsx:428:    // Create realtime channel for account status changes
src/Layout.jsx:430:      .channel(`account_status_${user.id}`)
src/Layout.jsx:432:        'postgres_changes',
src/Layout.jsx:445:      .subscribe((status) => {
src/Layout.jsx:448:          console.warn('[Layout] Realtime subscription error - falling back to polling');
src/Layout.jsx:458:  // Realtime subscription for viewer_bans (chat mute enforcement)
src/Layout.jsx:463:      .channel('viewer_bans_realtime')
src/Layout.jsx:465:        'postgres_changes',
src/Layout.jsx:579:  // OPTION 2: Polling fallback (every 5 seconds) - ensures enforcement even if realtime fails
src/pages/HostConsole.jsx:379:  const syncActiveGiveyFromDb = useCallback(async () => {
src/pages/HostConsole.jsx:422:    const interval = setInterval(() => {
src/pages/HostConsole.jsx:454:      .channel(channelName)
src/pages/HostConsole.jsx:456:        "postgres_changes",
src/pages/HostConsole.jsx:464:          console.log("🔥 GIVEY REALTIME UPDATE RECEIVED:", payload);
src/pages/HostConsole.jsx:465:          syncActiveGiveyFromDb();
src/pages/LiveShow.jsx:310:    const interval = setInterval(() => {
src/pages/LiveShow.jsx:340:  const syncActiveGiveyFromDb = useCallback(async () => {
src/pages/LiveShow.jsx:366:  const syncLatestGiveyFromDb = useCallback(async () => {
src/pages/LiveShow.jsx:408:    const interval = setInterval(() => syncActiveGiveyFromDb(), 5000);
src/pages/LiveShow.jsx:420:      .channel("buyer-givey-" + show.id)
src/pages/LiveShow.jsx:422:        "postgres_changes",
src/pages/LiveShow.jsx:430:          console.log("BUYER GIVEY REALTIME PAYLOAD:", payload);
src/pages/LiveShow.jsx:434:          syncActiveGiveyFromDb();
src/pages/LiveShow.jsx:435:          syncLatestGiveyFromDb();
src/components/chat/SupabaseLiveChat.jsx:338:      .channel(`live_show_messages:${showId}`)
src/components/chat/SupabaseLiveChat.jsx:340:        "postgres_changes",
```

### Python LiveShow block output (successful):

```
--- LiveShow.jsx context around line 420 ---
380:    }
...
416:  useEffect(() => {
417:    if (!show?.id) return;
418:
419:    const channel = supabase
420:      .channel("buyer-givey-" + show.id)
421:      .on(
422:        "postgres_changes",
423:        {
424:          event: "*",
425:          schema: "public",
426:          table: "givey_events",
427:          filter: `show_id=eq.${show.id}`,
428:        },
429:        (payload) => {
430:          console.log("BUYER GIVEY REALTIME PAYLOAD:", payload);
431:          if (payload.new && payload.new.status !== "active") {
432:            setActiveGivey(null);
433:          }
434:          syncActiveGiveyFromDb();
435:          syncLatestGiveyFromDb();
436:        }
437:      )
438:      .subscribe();
...
```

### Python HostConsole block output (UnicodeEncodeError after partial output):

```
--- HostConsole.jsx context around line 454 ---
414:  // Initial sync + polling when active givey exists
...
440:  // Realtime subscription: sync from DB on givey_events UPDATE (DB-authoritative)
441:  useEffect(() => {
...
454:      .channel(channelName)
455:        "postgres_changes",
...
UnicodeEncodeError: 'charmap' codec can't encode character '\U0001faaa' in position 23
```

### Supabase client check:

```
src/lib/supabase/supabaseClient.ts:12:export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
```

No `realtime:` config in createClient options.

---

## 2. MAIN SEARCH RESULTS (fall back to polling, postgres_changes, channel, subscribe, realtime, givey sync, loaders, setInterval, viewer_bans)

```
src/api/shows.ts
  304:// Fetches viewer counts from show_realtime_stats and merges into Show objects.
  314: * Internal helper: Fetch stats for multiple shows from show_realtime_stats.
  335:      .from("show_realtime_stats")
  362: * Prefers show_realtime_stats.viewer_count, falls back to show.viewer_count, then 0.
  ...

src/components/seller/ModerationCenter.jsx
  42:        .from("viewer_bans")
  84:        .from("viewer_bans")
  98:      queryClient.invalidateQueries({ queryKey: ['viewer-ban-check'] });
  ...

src/components/chat/LiveChat.jsx
  48:    queryKey: ['viewer-ban-check', sellerId, user?.id],
  52:        .from('viewer_bans')
  ...

src/pages/SellerOrders.jsx
  321:    const interval = setInterval(() => {

src/pages/BuyerOrders.jsx
  145:  const loadGiveyWins = async () => {
  158:  const loadWonGiveys = async () => {
  203:    loadGiveyWins();
  204:    loadWonGiveys();
  207:    const interval = setInterval(() => {
  209:      loadGiveyWins();
  210:      loadWonGiveys();

src/Layout.jsx
  359:    const interval = setInterval(() => {
  428:    // Create realtime channel for account status changes
  430:      .channel(`account_status_${user.id}`)
  432:        'postgres_changes',
  445:      .subscribe((status) => {
  458:  // Realtime subscription for viewer_bans (chat mute enforcement)
  463:      .channel('viewer_bans_realtime')
  465:        'postgres_changes',
  ...
  579:  // OPTION 2: Polling fallback (every 5 seconds) - ensures enforcement even if realtime fails
  ...

src/pages/HostConsole.jsx
  379:  const syncActiveGiveyFromDb = useCallback(async () => {
  418:    syncActiveGiveyFromDb();
  422:    const interval = setInterval(() => {
  423:      syncActiveGiveyFromDb();
  454:      .channel(channelName)
  456:        "postgres_changes",
  464:          console.log("🔥 GIVEY REALTIME UPDATE RECEIVED:", payload);
  465:          syncActiveGiveyFromDb();
  ...

src/pages/LiveShow.jsx
  310:    const interval = setInterval(() => {
  326:    queryKey: ['viewer-ban-check', show?.seller_id, user?.id],
  330:        .from('viewer_bans')
  340:  const syncActiveGiveyFromDb = useCallback(async () => {
  366:  const syncLatestGiveyFromDb = useCallback(async () => {
  397:    syncActiveGiveyFromDb();
  398:    syncLatestGiveyFromDb();
  408:    const interval = setInterval(() => syncActiveGiveyFromDb(), 5000);
  420:      .channel("buyer-givey-" + show.id)
  422:        "postgres_changes",
  430:          console.log("BUYER GIVEY REALTIME PAYLOAD:", payload);
  434:          syncActiveGiveyFromDb();
  435:          syncLatestGiveyFromDb();
  ...
```

### 1.2 "fall back to polling" / "fallback to polling"

**Finding:** Only one occurrence of explicit fallback text:

- `src/Layout.jsx:448` — `console.warn('[Layout] Realtime subscription error - falling back to polling');` (for `account_status` channel, not givey)
- `src/Layout.jsx:579` — Comment: `// OPTION 2: Polling fallback (every 5 seconds) - ensures enforcement even if realtime fails` (for account status polling)

**No explicit "fall back to polling" logic for givey_events.** Givey realtime has no status callback that switches to polling on CHANNEL_ERROR.

---

## 2. LIVE SHOW SUBSCRIPTION BLOCK

**File:** `src/pages/LiveShow.jsx`  
**Lines:** 416–443

```jsx
  useEffect(() => {
    if (!show?.id) return;

    const channel = supabase
      .channel("buyer-givey-" + show.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "givey_events",
          filter: `show_id=eq.${show.id}`,
        },
        (payload) => {
          console.log("BUYER GIVEY REALTIME PAYLOAD:", payload);
          if (payload.new && payload.new.status !== "active") {
            setActiveGivey(null);
          }
          syncActiveGiveyFromDb();
          syncLatestGiveyFromDb();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [show?.id, syncActiveGiveyFromDb, syncLatestGiveyFromDb]);
```

**Findings:**
- Channel: `"buyer-givey-" + show.id`
- Event: `"*"` (INSERT, UPDATE, DELETE)
- Table: `givey_events`, schema `public`, filter `show_id=eq.${show.id}`
- Callback: logs payload, clears `activeGivey` if `payload.new.status !== "active"`, then calls `syncActiveGiveyFromDb()` and `syncLatestGiveyFromDb()`
- **No `.subscribe((status) => {...})` callback** — no handling of SUBSCRIBED/CHANNEL_ERROR
- Winner banner uses `latestGivey?.status === "winner_selected"` (line 1102), populated by `syncLatestGiveyFromDb()`

---

## 3. HOST CONSOLE SUBSCRIPTION BLOCK

**File:** `src/pages/HostConsole.jsx`  
**Lines:** 441–476

```jsx
  useEffect(() => {
    console.log("🟡 GIVEY EFFECT EVALUATED. show?.id:", show?.id);

    if (!show?.id) {
      console.log("⛔ GIVEY EFFECT EXITED — show.id missing");
      return;
    }

    console.log("🟢 GIVEY EFFECT RUNNING — attaching channel for show:", show.id);

    const channelName = "givey-events-" + show.id;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "givey_events",
          filter: `show_id=eq.${show.id}`,
        },
        (payload) => {
          console.log("🔥 GIVEY REALTIME UPDATE RECEIVED:", payload);
          syncActiveGiveyFromDb();
        }
      )
      .subscribe((status) => {
        console.log("📡 GIVEY CHANNEL STATUS:", status);
      });

    return () => {
      console.log("🔴 GIVEY CHANNEL CLEANUP:", channelName);
      supabase.removeChannel(channel);
    };
  }, [show?.id, syncActiveGiveyFromDb]);
```

**Findings:**
- Channel: `"givey-events-" + show.id`
- Event: `"UPDATE"` only (no INSERT/DELETE)
- Table: `givey_events`, schema `public`, filter `show_id=eq.${show.id}`
- Callback: logs payload, calls `syncActiveGiveyFromDb()` only (no `syncLatestGiveyFromDb`)
- Has `.subscribe((status) => {...})` but only logs status — **no fallback to polling on CHANNEL_ERROR**

---

## 4. BUYER ORDERS POLLING / LOADERS

**File:** `src/pages/BuyerOrders.jsx`

### 4.1 loadGiveyWins (lines 145–155)

```jsx
  const loadGiveyWins = async () => {
    if (!effectiveUserId) return;
    const { count, error } = await supabase
      .from("givey_events")
      .select("id", { count: "exact", head: true })
      .eq("winner_user_id", effectiveUserId)
      .is("claimed_at", null);
    if (!error) {
      setGiveyWins(count ?? 0);
    }
  };
```

### 4.2 loadWonGiveys (lines 158–177)

```jsx
  const loadWonGiveys = async () => {
    if (!effectiveUserId) return;
    const { data, error } = await supabase
      .from("givey_events")
      .select("id, givey_number, seller_id, claim_code, claim_expires_at, ended_at")
      .eq("winner_user_id", effectiveUserId)
      .eq("status", "winner_selected")
      .is("claimed_at", null)
      .order("ended_at", { ascending: false });
    if (!error) {
      setWonGiveys(data ?? []);
    }
    const { data: past } = await supabase
      .from("givey_events")
      .select("id, givey_number, seller_id, claimed_at")
      .eq("winner_user_id", effectiveUserId)
      .not("claimed_at", "is", null)
      .order("claimed_at", { ascending: false });
    setPastGiveys(past ?? []);
  };
```

### 4.3 Invocation and polling (lines 196–214)

```jsx
  useEffect(() => {
    if (!effectiveUserId) return;

    // Initial load
    loadData();
    loadReferenceData();
    loadGiveyWins();
    loadWonGiveys();

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadData();
      loadGiveyWins();
      loadWonGiveys();
    }, 5000);

    return () => clearInterval(interval);
  }, [effectiveUserId]);
```

**Findings:**
- BuyerOrders has **no realtime subscription** for `givey_events`
- `loadGiveyWins` and `loadWonGiveys` run on mount and every 5 seconds
- `loadWonGiveys` loads unclaimed wins (`claimed_at IS NULL`) and past claimed (`claimed_at IS NOT NULL`)
- **Winner selection is reflected only after the next 5-second poll** when the buyer is on BuyerOrders
- BuyerOrders does not reload giveys specifically after seller verification; it relies on the same 5-second interval

---

## 5. KNOWN WORKING REALTIME REFERENCE (COMPARE)

### 5.1 Layout.jsx — viewer_bans (INSERT + DELETE)

**File:** `src/Layout.jsx`  
**Lines:** 458–576

```jsx
  const viewerBansChannel = supabase
    .channel('viewer_bans_realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'viewer_bans',
        filter: `viewer_id=eq.${user.id}`
      },
      async (payload) => {
        console.log('[Layout] Realtime: viewer_bans INSERT', payload);
        // ... invalidateQueries, refetchQueries for viewer-ban-check
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'viewer_bans',
        filter: `viewer_id=eq.${user.id}`
      },
      async (payload) => {
        console.log('[Layout] Realtime: viewer_bans DELETE', payload);
        // ... invalidateQueries, refetchQueries for viewer-ban-check
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Layout] Realtime subscription active for viewer_bans');
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[Layout] Realtime subscription error for viewer_bans');
      }
    });
```

### 5.2 Layout.jsx — account_status (UPDATE + fallback)

**File:** `src/Layout.jsx`  
**Lines:** 428–450

```jsx
  const channel = supabase
    .channel(`account_status_${user.id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${user.id}`
      },
      (payload) => {
        const newStatus = payload.new?.account_status;
        handleAccountStatusChange(newStatus);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Layout] Realtime subscription active for account_status');
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[Layout] Realtime subscription error - falling back to polling');
      }
    });
```

### 5.3 SupabaseLiveChat.jsx — live_show_messages (INSERT)

**File:** `src/components/chat/SupabaseLiveChat.jsx`  
**Lines:** 335–366

```jsx
  const channel = supabase
    .channel(`live_show_messages:${showId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "live_show_messages",
        filter: `show_id=eq.${showId}`,
      },
      async (payload) => {
        const row = payload?.new;
        if (!row?.id) return;
        await applyIncomingMessages([row]);
      }
    )
    .subscribe((status) => {
      realtimeActiveRef.current = status === "SUBSCRIBED";
    });
```

**Pattern comparison:**
- Working subscriptions use `.subscribe((status) => {...})` and log/handle CHANNEL_ERROR
- account_status has explicit "falling back to polling" comment and a separate polling effect
- Givey LiveShow subscription uses `.subscribe()` with no status callback — no error handling or fallback

---

## 6. SUPABASE CLIENT / REALTIME CONFIG CHECK

**File:** `src/lib/supabase/supabaseClient.ts`

```ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      "X-Client-Info": "livemarket-web",
    },
  },
});
```

**Findings:**
- No `realtime` options passed to `createClient` — uses Supabase defaults
- Realtime is enabled by default; no explicit disable

---

## 7. DB-SIDE SIGNALS WHEN FINALIZE HAPPENS

### 7.1 finalize_givey_event RPC

- Invoked from:
  - `src/pages/HostConsole.jsx:497` — when host’s countdown expires
  - `supabase/functions/finalize-expired-giveys/index.ts:42` — edge function for expired giveys
- RPC updates `givey_events` (status → `winner_selected` or `expired`); exact SQL not in repo (assumed to perform UPDATE)

### 7.2 Manual expire script

**File:** `supabase/scripts/expire_givey.sql`

```sql
update public.givey_events
set status = 'expired'
where id = '<active_givey_id>';
```

Comment: "This triggers postgres_changes realtime; HostConsole will clear activeGivey UI."

### 7.3 Realtime publication

- No migration in repo that adds `givey_events` to `supabase_realtime` publication
- `viewer_bans`, `live_show_messages`, `users` are used for realtime; `givey_events` publication status is unknown without DB inspection

---

## 8. SUBSCRIPTION FILTER ANALYSIS

| Aspect | LiveShow (buyer) | HostConsole (seller) | viewer_bans (working) |
|--------|------------------|------------------------|------------------------|
| Event type | `"*"` (all) | `"UPDATE"` only | `INSERT`, `DELETE` |
| Table | `givey_events` | `givey_events` | `viewer_bans` |
| Schema | `public` | `public` | `public` |
| Filter | `show_id=eq.${show.id}` | `show_id=eq.${show.id}` | `viewer_id=eq.${user.id}` |
| payload.new | Used | Used | Used |
| payload.old | Not used | Not used | Used in DELETE |

**Findings:**
- LiveShow uses `event: "*"` — should receive INSERT, UPDATE, DELETE
- HostConsole uses `event: "UPDATE"` — correct for status changes (winner_selected, expired)
- Filter is row-level (`show_id=eq.${show.id}`); RLS may further restrict visibility
- If `givey_events` is not in the realtime publication, no events will be delivered regardless of filter

---

## 9. EXACT FINDINGS SUMMARY (copyable)

### F1. LiveShow.jsx — No realtime error handling

- **File:** `src/pages/LiveShow.jsx`
- **Lines:** 438
- **Finding:** `.subscribe()` has no status callback. No handling of CHANNEL_ERROR or fallback to polling when realtime fails.

### F2. HostConsole.jsx — Status callback does not trigger fallback

- **File:** `src/pages/HostConsole.jsx`
- **Lines:** 468–470
- **Finding:** `.subscribe((status) => {...})` only logs status. No fallback to polling on CHANNEL_ERROR.

### F3. BuyerOrders.jsx — No realtime; 5-second polling only

- **File:** `src/pages/BuyerOrders.jsx`
- **Lines:** 207–211
- **Finding:** `loadGiveyWins` and `loadWonGiveys` run every 5 seconds. No realtime subscription. Winner selection appears only on next poll.

### F4. BuyerOrders.jsx — No reload after seller verification

- **File:** `src/pages/BuyerOrders.jsx`
- **Finding:** No code that reloads giveys when seller verifies a claim. Relies on 5-second interval.

### F5. givey_events realtime publication unknown

- **Finding:** No migration in repo adds `givey_events` to Supabase realtime publication. If not published, postgres_changes will not fire.

### F6. LiveShow WinnerBanner depends on syncLatestGiveyFromDb

- **File:** `src/pages/LiveShow.jsx`
- **Lines:** 366–393 (syncLatestGiveyFromDb), 1102 (WinnerBanner)
- **Finding:** Winner banner uses `latestGivey?.status === "winner_selected"`. `latestGivey` is set by `syncLatestGiveyFromDb()`, which is called from the realtime callback. If realtime never fires, banner updates only via 5-second `syncActiveGiveyFromDb` — but that only fetches `status=active`, so it will not refresh `latestGivey` for winner_selected.

### F7. LiveShow polling fetches only active givey

- **File:** `src/pages/LiveShow.jsx`
- **Lines:** 343–350 (syncActiveGiveyFromDb), 408
- **Finding:** Polling calls `syncActiveGiveyFromDb()` which selects `.eq("status", "active")`. It never fetches `winner_selected` rows. Only `syncLatestGiveyFromDb()` (no status filter) gets the latest givey including winner. Realtime callback triggers both; polling triggers only `syncActiveGiveyFromDb`. So if realtime fails, winner banner will not update from polling.

### F8. Layout.jsx — Explicit fallback only for account_status

- **File:** `src/Layout.jsx`
- **Lines:** 448, 579–605
- **Finding:** "falling back to polling" exists only for `account_status`. No equivalent for givey_events.

---

## 10. RECOMMENDATIONS (for future implementation, not applied in this audit)

1. Add `givey_events` to Supabase realtime publication if not already present.
2. Add `.subscribe((status) => {...})` to LiveShow givey channel; on CHANNEL_ERROR, enable or increase polling for `syncLatestGiveyFromDb`.
3. Ensure LiveShow polling also calls `syncLatestGiveyFromDb()` when realtime is degraded, not only `syncActiveGiveyFromDb()`.
4. Consider adding a realtime subscription in BuyerOrders for `givey_events` where `winner_user_id=eq.${effectiveUserId}` and `status=eq.winner_selected`, or at least reduce polling interval when on "My Giveys" view.
5. Optionally trigger `loadWonGiveys` when returning to BuyerOrders from another route (e.g. after seller verification flow).

---

*End of audit report. No edits were made per audit scope.*
