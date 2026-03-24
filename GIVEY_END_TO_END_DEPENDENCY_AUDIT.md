# GIVEY END-TO-END DEPENDENCY AUDIT
## Strict Read-Only — Facts Only

---

## SECTION 1 — END-TO-END GIVEY LIFECYCLE MAP

| Stage | FILE | LINE | FUNCTION / COMPONENT | STATE / VARIABLE USED | CALL / DEPENDENCY | NEXT STAGE IT TRIGGERS |
|-------|------|------|---------------------|------------------------|-------------------|------------------------|
| Start button | HostConsole.jsx | 2186-2194 | Button onClick | show, currentSeller, nextGiveyNumber | handleStartGivey | start_givey_event RPC |
| Creation RPC | HostConsole.jsx | 673-676 | handleStartGivey | show.id, currentSeller.id | supabase.rpc("start_givey_event", {...}) | DB row creation |
| DB row creation | — | — | start_givey_event RPC (not in repo) | — | INSERT givey_events | Realtime INSERT (if subscribed) |
| Active givey state (host) | HostConsole.jsx | 691-696 | handleStartGivey success | data from RPC | setActiveGivey(data), giveyLifecycleRef.current, setGiveyLifecycleSignal | Lifecycle ref sync, watcher start |
| Active givey state (buyer) | LiveShow.jsx | 427-428 | Realtime handler | payload.new | setActiveGivey(payload.new) | GiveyEntryBanner, countdown |
| Countdown / timers (host) | HostConsole.jsx | 563-610 | Watcher interval | giveyLifecycleRef.current.endsAt | Date.now() vs endTime | finalize RPC when now >= endTime |
| Countdown / timers (buyer) | LiveShow.jsx | 483-491 | Countdown interval | activeGivey.ends_at | setGiveyTimeLeft(diff) | GiveyEntryBanner time display |
| Finalization trigger (UI) | HostConsole.jsx | 582-608 | Watcher interval | giveyId, endsAt | supabase.rpc("finalize_givey_event", {...}) | DB UPDATE |
| Finalization trigger (server) | finalize-expired-giveys/index.ts | 24-44 | processExpiredGiveys | givey_events query | supabase.rpc("finalize_givey_event", {...}) | DB UPDATE |
| DB update | — | — | finalize_givey_event RPC (not in repo) | — | UPDATE givey_events status | Realtime broadcast |
| Realtime update | HostConsole.jsx, LiveShow.jsx | 480-513, 422-436 | postgres_changes handler | payload.new | setActiveGivey(null), setLatestGivey, setWinnerDisplayName | UI updates |
| UI updates (host) | HostConsole.jsx | 2181-2182 | Sidebar render | activeGivey | "Givey #X is Active" or "Next Givey: #X" | — |
| UI updates (buyer) | LiveShow.jsx | 1090-1140 | WinnerBanner, GiveyEntryBanner | latestGivey, winnerDisplayName, activeGivey | Banner render | — |
| Winner banner | LiveShow.jsx | 1090-1095, 1186 | WinnerBanner | latestGivey?.status === "winner_selected", winnerDisplayName | Fixed div "Winner: {name}" | — |
| Expired state | LiveShow.jsx | 433-435 | Realtime handler | payload.new | setActiveGivey(null), setLatestGivey(payload.new) | GiveyEntryBanner hides |

---

## SECTION 2 — CURRENT UI-DRIVEN FINALIZATION PATH

### Watcher useEffect

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINE | 553-621 |
| DEPENDENCY ARRAY | `[show?.id, giveyLifecycleSignal]` |
| GUARDS | `if (!show?.id) return`; inside interval: `if (!giveyLifecycleRef.current) return`, `if (!giveyId \|\| !endsAt) return` |
| REFS | giveyLifecycleRef |
| CALLS | supabase.rpc("finalize_givey_event", { p_givey_event_id: giveyId }) |
| DEPENDS ON | giveyLifecycleRef populated by handleStartGivey, realtime active, or lifecycle ref sync effect |

```javascript
  useEffect(() => {
    if (!show?.id) return;

    console.log("[GIVEY AUDIT][WATCHER_STARTED]", {...});
    const interval = setInterval(async () => {
      if (!giveyLifecycleRef.current) return;
      const { id: giveyId, endsAt } = giveyLifecycleRef.current;
      if (!giveyId || !endsAt) return;
      const endTime = new Date(endsAt).getTime();
      const now = Date.now();
      // ... tick logs ...
      if (now >= endTime) {
        const rpcResult = await supabase.rpc("finalize_givey_event", { p_givey_event_id: giveyId });
        giveyLifecycleRef.current = null;
      }
    }, 500);
    return () => { console.log("[GIVEY AUDIT][WATCHER_CLEANUP]", {...}); clearInterval(interval); };
  }, [show?.id, giveyLifecycleSignal]);
```

### Lifecycle ref

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINE | 121 |
| EXACT CODE | `const giveyLifecycleRef = useRef(null);` |
| SET BY | handleStartGivey (693-695), realtime active (496-498), lifecycle ref sync (441) |
| CLEARED BY | Watcher after successful finalize RPC (595) |

### Lifecycle signal

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINE | 116 |
| EXACT CODE | `const [giveyLifecycleSignal, setGiveyLifecycleSignal] = useState(0);` |
| BUMPED BY | handleStartGivey (697), realtime active (499), lifecycle ref sync (442) |
| PURPOSE | Triggers watcher useEffect re-run so watcher starts when lifecycle begins |

### handleStartGivey

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINE | 665-703 |
| CALLS | supabase.rpc("start_givey_event", { p_show_id, p_seller_id, p_require_follow }) |
| SETS | setActiveGivey(data), giveyLifecycleRef.current, setGiveyLifecycleSignal((n) => n + 1), setNextGiveyNumber |
| DEPENDS ON | show?.id, currentSeller?.id |

### Lifecycle ref sync effect

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINE | 438-444 |
| DEPENDENCY ARRAY | `[activeGivey?.id, activeGivey?.ends_at]` |
| SETS | giveyLifecycleRef.current, setGiveyLifecycleSignal((n) => n + 1) |
| DEPENDS ON | activeGivey from syncActiveGiveyFromDb or realtime |

### Stale reconciliation effect (host)

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINE | 527-552 |
| DEPENDENCY ARRAY | `[show?.id, activeGivey, syncActiveGiveyFromDb]` |
| GUARDS | giveyChannelStatusRef === "SUBSCRIBED", activeGivey truthy, lastPayload > 8s |
| CALLS | syncActiveGiveyFromDb() |
| DEPENDS ON | activeGivey — stops when activeGivey is null |

### Watcher cleanup

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINE | 613-619 |
| RUNS WHEN | Effect re-runs (show?.id or giveyLifecycleSignal change) or unmount |
| CALLS | clearInterval(interval), console.log WATCHER_CLEANUP |

### UI state tied to watcher timing

| State | FILE | LINE | Tied to watcher |
|-------|------|------|-----------------|
| activeGivey | HostConsole.jsx | 113 | Cleared by realtime when watcher/server finalizes; watcher does not set it |
| giveyLifecycleRef | HostConsole.jsx | 121 | Watcher reads it and clears it after finalize |
| Host sidebar "Givey #X is Active" | HostConsole.jsx | 2181-2182 | Renders activeGivey; activeGivey cleared by realtime, not watcher |

---

## SECTION 3 — CURRENT SERVER-SIDE FINALIZATION PATH

### Edge function processExpiredGiveys

| Property | Value |
|----------|-------|
| FILE | supabase/functions/finalize-expired-giveys/index.ts |
| LINE | 14-52 |
| FUNCTION NAME | processExpiredGiveys |
| TRIGGER SOURCE | HTTP request or pg_cron (README example; no cron in repo) |
| CALLS | supabase.from("givey_events").select(...).eq("status","active").lte("ends_at",now); supabase.rpc("finalize_givey_event", { p_givey_event_id: row.id }) |
| DEPENDS ON | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |

```typescript
async function processExpiredGiveys() {
  const supabase = createClient(...);
  const now = new Date().toISOString();
  const { data: expiredGiveys, error: fetchError } = await supabase
    .from("givey_events")
    .select("id")
    .eq("status", "active")
    .lte("ends_at", now)
    .order("ends_at", { ascending: true })
    .limit(200);
  for (const row of expiredGiveys) {
    const { error } = await supabase.rpc("finalize_givey_event", { p_givey_event_id: row.id });
  }
}
```

### serve handler

| Property | Value |
|----------|-------|
| FILE | supabase/functions/finalize-expired-giveys/index.ts |
| LINE | 54-61 |
| TRIGGER | HTTP POST to /functions/v1/finalize-expired-giveys |
| CALLS | processExpiredGiveys() |

### Manual expire script

| Property | Value |
|----------|-------|
| FILE | supabase/scripts/expire_givey.sql |
| LINE | 5-7 |
| TRIGGER | Manual execution in SQL Editor |
| CALLS | UPDATE givey_events SET status = 'expired' WHERE id = '<id>' |
| NOTE | Does not call finalize_givey_event; direct UPDATE |

### Cron reference (README only)

| Property | Value |
|----------|-------|
| FILE | supabase/functions/finalize-expired-giveys/README.md |
| LINE | 18-36 |
| CONTENT | Example pg_cron SQL to POST to edge function every 5 seconds |
| IN REPO | Example only; no migration defines this cron |

---

## SECTION 4 — ALL DEPENDENCIES ON FINALIZATION TIMING

| FILE | LINE | CODE BLOCK | FINALIZATION EVENT | UI PATH OR DB PATH |
|------|------|------------|--------------------|--------------------|
| LiveShow.jsx | 1090-1095 | WinnerBanner = latestGivey?.status === "winner_selected" && winnerDisplayName && (...) | DB update → realtime → setLatestGivey, setWinnerDisplayName | DB update path |
| LiveShow.jsx | 1097-1140 | GiveyEntryBanner = activeGivey && (...) | activeGivey cleared by realtime on winner_selected/expired | DB update path |
| LiveShow.jsx | 1123-1128 | Countdown: new Date(activeGivey.ends_at).getTime() - Date.now() | activeGivey.ends_at; no direct finalization dependency | Either |
| HostConsole.jsx | 2181-2182 | activeGivey ? "Givey #X is Active" : "Next Givey: #X" | activeGivey cleared by realtime | DB update path |
| LiveShow.jsx | 460-471 | Stale reconciliation: syncActiveGiveyFromDb, syncLatestGiveyFromDb when >8s | Depends on activeGivey; runs only when activeGivey truthy | UI path (activeGivey from watcher/realtime) |
| HostConsole.jsx | 531-548 | Stale reconciliation: syncActiveGiveyFromDb when >8s | Same | UI path |
| LiveShow.jsx | 388-395 | syncLatestGiveyFromDb: setWinnerDisplayName when data?.status === "winner_selected" | DB query returns winner_selected row | DB path |
| LiveShow.jsx | 426-435 | Realtime: status active → setActiveGivey only; winner_selected → setLatestGivey, setWinnerDisplayName | Realtime payload from DB UPDATE | DB path |
| LiveShow.jsx | 1091 | WinnerBanner condition: latestGivey?.status === "winner_selected" | latestGivey from realtime or syncLatestGiveyFromDb | DB path |

---

## SECTION 5 — ALL CALLERS / RECEIVERS OF winner_selected / expired

| FILE | LINE | CODE BLOCK | STATE SET | UI RENDERED | DEPENDS ON |
|------|------|------------|-----------|-------------|------------|
| LiveShow.jsx | 429-432 | else if (status === "winner_selected") { setActiveGivey(null); setLatestGivey(payload.new); setWinnerDisplayName(...) } | activeGivey=null, latestGivey, winnerDisplayName | WinnerBanner, GiveyEntryBanner hides | latestGivey, activeGivey |
| LiveShow.jsx | 433-435 | else if (status === "expired") { setActiveGivey(null); setLatestGivey(payload.new) } | activeGivey=null, latestGivey | GiveyEntryBanner hides; WinnerBanner does not show (status not winner_selected) | latestGivey, activeGivey |
| LiveShow.jsx | 388 | if (data?.status === "winner_selected" && data?.winner_user_id) { setWinnerDisplayName(...) } | winnerDisplayName | WinnerBanner | syncLatestGiveyFromDb |
| LiveShow.jsx | 1091 | latestGivey?.status === "winner_selected" && winnerDisplayName | — | WinnerBanner | latestGivey, winnerDisplayName |
| HostConsole.jsx | 504-511 | if (status === "winner_selected" \|\| "expired") { setActiveGivey(null) } | activeGivey=null | Sidebar "Next Givey" | activeGivey |
| BuyerOrders.jsx | 164 | .eq("status", "winner_selected") | — | My Giveys panel | loadWonGiveys query |
| SellerOrders.jsx | 608 | .eq("status", "winner_selected") | — | Pending giveys list | loadSellerGiveys query |
| GIVIHostPanel.jsx | 344, 711 | action: "winner_selected" (GIVI, not Givey) | — | GIVI analytics | GIVI system |

---

## SECTION 6 — REALTIME DEPENDENCY MAP

### HostConsole.jsx (lines 470-518)

| Property | Value |
|----------|-------|
| EVENT TYPE | UPDATE |
| TABLE | givey_events |
| FILTER | show_id=eq.${show.id} |
| STATE WRITTEN | setActiveGivey(payload.new) or setActiveGivey(null), giveyLifecycleRef.current, setGiveyLifecycleSignal |
| UI / LOGIC | Sidebar "Givey #X is Active", watcher lifecycle, Start Givey button visibility |
| CLASSIFICATION | host-only, lifecycle-sensitive |

### LiveShow.jsx (lines 412-455)

| Property | Value |
|----------|-------|
| EVENT TYPE | * (all) |
| TABLE | givey_events |
| FILTER | show_id=eq.${show.id} |
| STATE WRITTEN | setActiveGivey, setLatestGivey, setWinnerDisplayName |
| UI / LOGIC | GiveyEntryBanner, WinnerBanner, countdown, handleEnterGivey |
| CLASSIFICATION | buyer-only, lifecycle-sensitive |

### Shared pattern

Both subscribe to givey_events; host listens UPDATE only, buyer listens all events. Both drive UI from state written by realtime. State is host-only or buyer-only; no shared component consumes both.

---

## SECTION 7 — BLAST RADIUS OF SWITCHING TO NON-UI FINALIZATION

| FILE | LINE | DEPENDENCY TYPE | ATTACHED TO | WOULD NO LONGER BE TRIGGER |
|------|------|-----------------|-------------|----------------------------|
| HostConsole.jsx | 553-621 | Watcher useEffect | giveyLifecycleRef, giveyLifecycleSignal | Watcher would not run finalize RPC |
| HostConsole.jsx | 592 | finalize_givey_event RPC call | Watcher interval | RPC call from host |
| HostConsole.jsx | 595 | giveyLifecycleRef.current = null | Watcher success block | Ref clear after host finalize |
| HostConsole.jsx | 697 | setGiveyLifecycleSignal | handleStartGivey | Signal bump still needed for watcher start; if watcher removed, signal has no consumer |
| HostConsole.jsx | 499, 442 | setGiveyLifecycleSignal | Realtime active, lifecycle sync | Same |
| HostConsole.jsx | 116 | giveyLifecycleSignal state | Watcher deps | Watcher would not need it if watcher removed |
| HostConsole.jsx | 121 | giveyLifecycleRef | Watcher, realtime, handleStartGivey | Watcher reads/clears; if watcher removed, ref only written, never read for finalize |
| HostConsole.jsx | 557, 574, 584, 596, 602, 612, 614 | [GIVEY AUDIT] logs | Watcher execution | Logs would not fire |
| HostConsole.jsx | 531-548 | Stale reconciliation | activeGivey | Reconciliation would still run when activeGivey set by realtime (new givey from different host tab); not watcher-specific |
| HostConsole.jsx | 438-444 | Lifecycle ref sync | activeGivey | Feeds giveyLifecycleRef for watcher; if watcher removed, sync has no consumer for ref |

---

## SECTION 8 — ATTACHED CALL / CONNECTION MAP

| SOURCE | DESTINATION | FILE | LINE | TYPE |
|--------|-------------|------|------|------|
| handleStartGivey | start_givey_event RPC | HostConsole.jsx | 673 | RPC |
| start_givey_event RPC | givey_events row (INSERT) | — | — | DB |
| handleStartGivey success | setActiveGivey, giveyLifecycleRef, setGiveyLifecycleSignal | HostConsole.jsx | 691-697 | state |
| Watcher interval | finalize_givey_event RPC | HostConsole.jsx | 592 | RPC |
| processExpiredGiveys | finalize_givey_event RPC | finalize-expired-giveys/index.ts | 42 | RPC |
| finalize_givey_event RPC | givey_events UPDATE | — | — | DB |
| givey_events UPDATE | postgres_changes | Supabase | — | realtime |
| postgres_changes | Realtime handler (Host) | HostConsole.jsx | 480-513 | realtime |
| postgres_changes | Realtime handler (Buyer) | LiveShow.jsx | 422-436 | realtime |
| Realtime handler | setActiveGivey, setLatestGivey, setWinnerDisplayName | LiveShow.jsx | 427-435 | state |
| Realtime handler | setActiveGivey, giveyLifecycleRef, setGiveyLifecycleSignal | HostConsole.jsx | 494-499 | state |
| activeGivey | GiveyEntryBanner, countdown, handleEnterGivey | LiveShow.jsx | 1097, 483, 494 | render |
| latestGivey, winnerDisplayName | WinnerBanner | LiveShow.jsx | 1090-1095 | render |
| activeGivey | Sidebar, Start Givey button | HostConsole.jsx | 2181-2194 | render |
| Lifecycle ref sync | giveyLifecycleRef, setGiveyLifecycleSignal | HostConsole.jsx | 441-442 | state |
| giveyLifecycleSignal | Watcher useEffect deps | HostConsole.jsx | 621 | state |
| syncActiveGiveyFromDb | setActiveGivey | HostConsole.jsx, LiveShow.jsx | 407/367 | state |
| syncLatestGiveyFromDb | setLatestGivey, setWinnerDisplayName | LiveShow.jsx | 386, 388-395 | state |
| Stale reconciliation | syncActiveGiveyFromDb, syncLatestGiveyFromDb | HostConsole.jsx, LiveShow.jsx | 547, 469 | timer |

---

## SECTION 9 — HIDDEN / NON-OBVIOUS DEPENDENCIES

### LiveShow realtime status === "active" does not set latestGivey

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| LiveShow.jsx | 427-428 | if (status === "active") { setActiveGivey(payload.new) } | When new givey starts, latestGivey stays previous winner_selected; WinnerBanner can persist |

### syncLatestGiveyFromDb never clears winnerDisplayName

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| LiveShow.jsx | 370-397 | setWinnerDisplayName only when data?.status === "winner_selected" | winnerDisplayName not cleared when latest is "active" |

### BuyerOrders 5s poll loads givey_events

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| BuyerOrders.jsx | 207-211 | setInterval(() => { loadGiveyWins(); loadWonGiveys(); }, 5000) | Non-live page; queries givey_events winner_selected |

### SellerOrders loadSellerGiveys

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| SellerOrders.jsx | 601-620 | loadSellerGiveys queries givey_events winner_selected | Non-live page; seller givey list |

### HostConsole realtime listens UPDATE only

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| HostConsole.jsx | 475 | event: "UPDATE" | New givey INSERT not received by host; host sets from handleStartGivey RPC response |

### Stale reconciliation requires activeGivey

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| LiveShow.jsx | 462 | if (!activeGivey) return | After winner_selected, reconciliation stops; recovery depends on last run before clear |

### Manual expire script bypasses RPC

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| expire_givey.sql | 5-7 | UPDATE givey_events SET status = 'expired' | Direct UPDATE; no winner selection; triggers realtime |

---

## SECTION 10 — FINAL FACTUAL SUMMARY TABLE

| STAGE | PRIMARY FILE | PRIMARY TRIGGER | ATTACHED STATE | ATTACHED UI | DEPENDENCIES | LIKELY IMPACTED IF NON-UI FINALIZATION BECOMES PRIMARY |
|-------|--------------|-----------------|----------------|-------------|--------------|--------------------------------------------------------|
| Start | HostConsole.jsx | handleStartGivey | activeGivey, giveyLifecycleRef, giveyLifecycleSignal | Start Givey button | start_givey_event RPC | None; start path unchanged |
| Active display | HostConsole.jsx, LiveShow.jsx | Realtime, sync | activeGivey | GiveyEntryBanner, sidebar | givey_events | None; state from realtime/sync |
| Countdown | HostConsole.jsx, LiveShow.jsx | activeGivey.ends_at | giveyTimeLeft, watcher | Countdown display | — | Watcher removed; countdown display unchanged (buyer) |
| Finalize (UI) | HostConsole.jsx | Watcher 500ms | giveyLifecycleRef | — | finalize_givey_event RPC | Watcher, lifecycle ref, lifecycle signal, audit logs |
| Finalize (server) | finalize-expired-giveys | HTTP/cron | — | — | finalize_givey_event RPC | None; already exists |
| DB update | — | RPC | — | — | givey_events | None |
| Realtime | HostConsole.jsx, LiveShow.jsx | postgres_changes | activeGivey, latestGivey, winnerDisplayName | All Givey UI | givey_events | None; realtime unchanged |
| Winner banner | LiveShow.jsx | latestGivey, winnerDisplayName | — | WinnerBanner | Realtime, syncLatestGiveyFromDb | None; fed by DB update path |
| Expired state | LiveShow.jsx | Realtime status expired | activeGivey=null, latestGivey | GiveyEntryBanner hide | Realtime | None |
| Reconciliation | HostConsole.jsx, LiveShow.jsx | 2s interval, activeGivey | — | — | syncActiveGiveyFromDb, syncLatestGiveyFromDb | Unchanged; still runs when activeGivey set |
| BuyerOrders/SellerOrders | BuyerOrders.jsx, SellerOrders.jsx | Poll, view switch | giveyWins, wonGiveys, pendingGiveys | My Giveys, seller giveys | givey_events queries | None; read-only |
