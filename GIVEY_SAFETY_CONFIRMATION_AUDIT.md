# GIVEY SAFETY CONFIRMATION AUDIT
## Strict Read-Only — Facts Only

---

## SECTION 1 — WATCHER-SPECIFIC CODE THAT WOULD STOP RUNNING

### 1.1 Watcher useEffect

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 553-621 |
| EVENT/STATE | Runs when show?.id and giveyLifecycleSignal change; 500ms interval reads giveyLifecycleRef, calls finalize_givey_event when now >= endTime |
| WOULD NO LONGER HAPPEN | Host-side finalize RPC call; giveyLifecycleRef.current = null after success; WATCHER_* logs |

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
      if (msRemaining <= 3000 && msRemaining > 0) {
        console.log("[GIVEY AUDIT][WATCHER_TICK_LAST_3S]", {...});
      }
      if (now >= endTime) {
        console.log("[GIVEY AUDIT][WATCHER_FINALIZE_ATTEMPT]", {...});
        const rpcResult = await supabase.rpc("finalize_givey_event", { p_givey_event_id: giveyId });
        giveyLifecycleRef.current = null;
        console.log("[GIVEY AUDIT][WATCHER_FINALIZE_RESOLVED]", {...});
      }
    }, 500);
    return () => {
      console.log("[GIVEY AUDIT][WATCHER_CLEANUP]", {...});
      clearInterval(interval);
    };
  }, [show?.id, giveyLifecycleSignal]);
```

### 1.2 Lifecycle ref sync effect

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 438-444 |
| EVENT/STATE | Runs when activeGivey?.id or activeGivey?.ends_at change; sets giveyLifecycleRef and bumps giveyLifecycleSignal |
| WOULD NO LONGER HAPPEN | giveyLifecycleRef and giveyLifecycleSignal would still be written, but no consumer would read giveyLifecycleRef for finalization; giveyLifecycleSignal would have no effect (watcher would not re-run) |

```javascript
  useEffect(() => {
    if (activeGivey?.id && activeGivey?.ends_at) {
      giveyLifecycleRef.current = { id: activeGivey.id, endsAt: activeGivey.ends_at };
      setGiveyLifecycleSignal((n) => n + 1);
    }
  }, [activeGivey?.id, activeGivey?.ends_at]);
```

### 1.3 giveyLifecycleSignal state

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 116 |
| EVENT/STATE | useState(0); bumped by handleStartGivey, realtime active, lifecycle ref sync |
| WOULD NO LONGER HAPPEN | Watcher would not re-run on signal change; signal would be dead state |

### 1.4 giveyLifecycleRef

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 121 |
| EVENT/STATE | useRef(null); written by handleStartGivey (693-695), realtime active (496-498), lifecycle sync (441); read and cleared by watcher (564-566, 595) |
| WOULD NO LONGER HAPPEN | Ref would be written but never read for finalization; never cleared |

### 1.5 setGiveyLifecycleSignal in handleStartGivey

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 697 |
| EVENT/STATE | After giveyLifecycleRef.current = {...}; triggers watcher useEffect |
| WOULD NO LONGER HAPPEN | Signal bump would have no effect |

### 1.6 setGiveyLifecycleSignal in realtime handler (status active)

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 499 |
| EVENT/STATE | After giveyLifecycleRef.current = {...}; triggers watcher useEffect |
| WOULD NO LONGER HAPPEN | Signal bump would have no effect |

### 1.7 Watcher logs

| FILE | LINES | LOG |
|------|-------|-----|
| HostConsole.jsx | 557-561 | [GIVEY AUDIT][WATCHER_STARTED] |
| HostConsole.jsx | 574-580 | [GIVEY AUDIT][WATCHER_TICK_LAST_3S] |
| HostConsole.jsx | 584-587 | [GIVEY AUDIT][WATCHER_FINALIZE_ATTEMPT] |
| HostConsole.jsx | 589 | [GIVEY FINALIZED BY HOST] |
| HostConsole.jsx | 596-599 | [GIVEY AUDIT][WATCHER_FINALIZE_RESOLVED] |
| HostConsole.jsx | 602-605 | [GIVEY AUDIT][WATCHER_FINALIZE_ERROR] |
| HostConsole.jsx | 612 | [GIVEY WATCHER ACTIVE] |
| HostConsole.jsx | 614-618 | [GIVEY AUDIT][WATCHER_CLEANUP] |

### 1.8 Watcher finalize RPC call

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 591-593 |
| EVENT/STATE | supabase.rpc("finalize_givey_event", { p_givey_event_id: giveyId }) |
| WOULD NO LONGER HAPPEN | Host would not call finalize RPC |

### 1.9 giveyLifecycleRef.current = null (watcher success)

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 595 |
| EVENT/STATE | Clears ref after successful RPC |
| WOULD NO LONGER HAPPEN | Ref would never be cleared (no consumer) |

---

## SECTION 2 — REALTIME / DB-DRIVEN CODE THAT WOULD STILL RUN

### 2.1 HostConsole realtime handler

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 480-513 |
| STATE UPDATED | setActiveGivey(payload.new) or setActiveGivey(null), giveyLifecycleRef.current, setGiveyLifecycleSignal |
| UI DRIVEN | Sidebar "Givey #X is Active", Start Givey button visibility |

```javascript
        (payload) => {
          giveyLastPayloadAtRef.current = Date.now();
          if (!payload.new) return;
          const status = payload.new.status;
          if (status === "active") {
            setActiveGivey(payload.new);
            giveyLifecycleRef.current = {...};
            setGiveyLifecycleSignal((n) => n + 1);
          }
          if (status === "winner_selected" || status === "expired") {
            setActiveGivey(null);
          }
        }
```

### 2.2 LiveShow realtime handler

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 422-436 |
| STATE UPDATED | setActiveGivey, setLatestGivey, setWinnerDisplayName |
| UI DRIVEN | GiveyEntryBanner, WinnerBanner, countdown |

```javascript
        (payload) => {
          giveyLastPayloadAtRef.current = Date.now();
          if (!payload.new) return;
          const status = payload.new.status;
          if (status === "active") {
            setActiveGivey(payload.new);
          } else if (status === "winner_selected") {
            setActiveGivey(null);
            setLatestGivey(payload.new);
            setWinnerDisplayName(payload.new.winner_name ?? "Winner");
          } else if (status === "expired") {
            setActiveGivey(null);
            setLatestGivey(payload.new);
          }
        }
```

### 2.3 syncActiveGiveyFromDb (HostConsole)

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 383-431 |
| STATE UPDATED | setActiveGivey(row) or setActiveGivey(null) |
| UI DRIVEN | Sidebar, Start Givey button |

### 2.4 syncActiveGiveyFromDb (LiveShow)

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 344-368 |
| STATE UPDATED | setActiveGivey(data ?? null) |
| UI DRIVEN | GiveyEntryBanner, handleEnterGivey |

### 2.5 syncLatestGiveyFromDb (LiveShow)

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 370-397 |
| STATE UPDATED | setLatestGivey(data ?? null), setWinnerDisplayName |
| UI DRIVEN | WinnerBanner |

### 2.6 WinnerBanner render

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 1090-1095, 1186 |
| STATE USED | latestGivey?.status === "winner_selected", winnerDisplayName |
| SOURCE | Realtime or syncLatestGiveyFromDb |

### 2.7 GiveyEntryBanner render

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 1097-1140, 1187 |
| STATE USED | activeGivey |
| SOURCE | Realtime or syncActiveGiveyFromDb |

### 2.8 Host sidebar render

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 2181-2194 |
| STATE USED | activeGivey, nextGiveyNumber |
| SOURCE | Realtime or syncActiveGiveyFromDb |

### 2.9 Stale reconciliation (HostConsole)

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 527-552 |
| STATE UPDATED | Via syncActiveGiveyFromDb |
| TRIGGER | activeGivey truthy, realtime stale >8s |

### 2.10 Stale reconciliation (LiveShow)

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 457-475 |
| STATE UPDATED | Via syncActiveGiveyFromDb, syncLatestGiveyFromDb |
| TRIGGER | activeGivey truthy, realtime stale >8s |

### 2.11 BuyerOrders loadGiveyWins, loadWonGiveys

| Property | Value |
|----------|-------|
| FILE | src/pages/BuyerOrders.jsx |
| LINES | 145-177 |
| STATE UPDATED | setGiveyWins, setWonGiveys, setPastGiveys |
| SOURCE | Direct givey_events query |

### 2.12 SellerOrders loadSellerGiveys

| Property | Value |
|----------|-------|
| FILE | src/pages/SellerOrders.jsx |
| LINES | 601-620 |
| STATE UPDATED | setPendingGiveys, setPastGiveys |
| SOURCE | Direct givey_events query |

---

## SECTION 3 — STATE TRANSITIONS LOST IF WATCHER IS REMOVED

| FILE | LINE | CODE | STATE WRITTEN | SAME STATE VIA DB/REALTIME? |
|------|------|------|---------------|----------------------------|
| HostConsole.jsx | 592 | supabase.rpc("finalize_givey_event", {...}) | DB row update (RPC side effect) | Yes — server edge function calls same RPC |
| HostConsole.jsx | 595 | giveyLifecycleRef.current = null | Ref cleared | N/A — ref only read by watcher; no UI depends on ref value |
| HostConsole.jsx | 494, 511 | setActiveGivey(null) | activeGivey = null | Yes — realtime handler on winner_selected/expired |
| HostConsole.jsx | 494, 511 | (realtime, not watcher) | — | — |

**Fact:** The watcher does not write activeGivey. activeGivey is cleared by the realtime handler when status is winner_selected or expired. The DB update that triggers realtime is produced by finalize_givey_event RPC, which the server edge function also calls.

---

## SECTION 4 — UI / LOGIC THAT CURRENTLY ASSUMES WATCHER EXISTS

| FILE | LINE | CODE | DEPENDENCY TYPE | UI-ONLY OR LIFECYCLE-CRITICAL? |
|------|------|------|-----------------|--------------------------------|
| HostConsole.jsx | 557-561 | console.log("[GIVEY AUDIT][WATCHER_STARTED]", {...}) | Watcher log | UI-only (monitoring) |
| HostConsole.jsx | 574-580 | console.log("[GIVEY AUDIT][WATCHER_TICK_LAST_3S]", {...}) | Watcher log | UI-only (monitoring) |
| HostConsole.jsx | 584-587 | console.log("[GIVEY AUDIT][WATCHER_FINALIZE_ATTEMPT]", {...}) | Watcher log | UI-only (monitoring) |
| HostConsole.jsx | 596-599 | console.log("[GIVEY AUDIT][WATCHER_FINALIZE_RESOLVED]", {...}) | Watcher log | UI-only (monitoring) |
| HostConsole.jsx | 602-605 | console.log("[GIVEY AUDIT][WATCHER_FINALIZE_ERROR]", {...}) | Watcher log | UI-only (monitoring) |
| HostConsole.jsx | 612 | console.log("[GIVEY WATCHER ACTIVE]", {...}) | Watcher log | UI-only (monitoring) |
| HostConsole.jsx | 614-618 | console.log("[GIVEY AUDIT][WATCHER_CLEANUP]", {...}) | Watcher cleanup log | UI-only (monitoring) |
| HostConsole.jsx | 564 | if (!giveyLifecycleRef.current) return | Watcher guard | Lifecycle — watcher reads ref; no other code reads ref for logic |
| HostConsole.jsx | 621 | [show?.id, giveyLifecycleSignal] | Watcher deps | Lifecycle — signal triggers watcher; no other consumer |
| HostConsole.jsx | 2181-2182 | activeGivey ? "Givey #X is Active" : "Next Givey" | Sidebar render | Not watcher-dependent; activeGivey from realtime/sync |

**Fact:** No UI component reads giveyLifecycleRef or giveyLifecycleSignal. The sidebar reads activeGivey, which is updated by realtime and sync, not by the watcher.

---

## SECTION 5 — CROSS-CHECK AGAINST SERVER-SIDE PATH

| WATCHER RESPONSIBILITY | EXISTING NON-UI PATH? | FILE / LOCATION | EVIDENCE |
|------------------------|------------------------|-----------------|----------|
| Call finalize_givey_event RPC | Yes | supabase/functions/finalize-expired-giveys/index.ts:42-44 | `await supabase.rpc("finalize_givey_event", { p_givey_event_id: row.id })` |
| Detect expiration (ends_at <= now) | Yes | finalize-expired-giveys/index.ts:24-30 | `.eq("status","active").lte("ends_at", now)` |
| Update givey_events row | Yes (via RPC) | RPC implementation (not in repo) | RPC called by both watcher and edge function |
| Realtime propagation | Yes | Supabase Realtime | postgres_changes on givey_events UPDATE |
| Host activeGivey = null | Yes | HostConsole.jsx:504-511 | Realtime handler: `if (status === "winner_selected" \|\| "expired") setActiveGivey(null)` |
| Buyer activeGivey = null, latestGivey, winnerDisplayName | Yes | LiveShow.jsx:429-435 | Realtime handler |
| Host sidebar "Next Givey" | Yes | HostConsole.jsx:2181-2182 | Renders activeGivey; activeGivey cleared by realtime |
| Buyer WinnerBanner | Yes | LiveShow.jsx:1090-1095 | Renders latestGivey, winnerDisplayName; set by realtime |
| Buyer GiveyEntryBanner hide | Yes | LiveShow.jsx:1097 | Renders when activeGivey; activeGivey cleared by realtime |
| giveyLifecycleRef.current = null | No equivalent | — | Ref only used by watcher; no other code clears it |
| [GIVEY AUDIT] logs | No equivalent | — | Logs are watcher-specific |

---

## SECTION 6 — HIDDEN SIDE EFFECTS OF CUTTING OFF WATCHER

### 6.1 Host UI still showing active status

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| HostConsole.jsx | 504-511 | Realtime: setActiveGivey(null) on winner_selected/expired | When server finalizes, DB updates, realtime delivers; host receives and clears activeGivey. No watcher dependency. |

### 6.2 Givey start flow

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| HostConsole.jsx | 665-703 | handleStartGivey calls start_givey_event, sets activeGivey, giveyLifecycleRef, giveyLifecycleSignal | Start flow does not depend on watcher. If watcher removed, giveyLifecycleRef and giveyLifecycleSignal would be written but unused. |

### 6.3 Reconciliation guards

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| LiveShow.jsx | 462 | if (!activeGivey) return | Reconciliation stops when activeGivey is null. activeGivey is cleared by realtime on winner_selected/expired. Not watcher-specific. |
| HostConsole.jsx | 532 | if (!activeGivey) return | Same. |

### 6.4 Old winner persistence

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| LiveShow.jsx | 427-428 | status === "active" sets only setActiveGivey(payload.new); does NOT set setLatestGivey | When new givey starts, latestGivey can stay as previous winner_selected. Existing behavior; not introduced by watcher removal. |

### 6.5 latestGivey / activeGivey divergence

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| LiveShow.jsx | 427-435 | active updated on "active"; latestGivey updated on winner_selected/expired only | Same as 6.4. Not watcher-specific. |

### 6.6 Manual expire path

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| supabase/scripts/expire_givey.sql | 5-7 | UPDATE givey_events SET status = 'expired' | Direct UPDATE; triggers realtime. Does not call finalize_givey_event. Unchanged by watcher removal. |

### 6.7 Logs / monitoring visibility

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| HostConsole.jsx | 557, 574, 584, 589, 596, 602, 612, 614 | [GIVEY AUDIT][WATCHER_*], [GIVEY FINALIZED BY HOST] | These logs would stop. No equivalent in server path for host-side visibility. |

### 6.8 Server path invocation

| FILE | LINE | CODE | CLASSIFICATION |
|------|------|------|----------------|
| finalize-expired-giveys/README.md | 18-36 | pg_cron example | Cron must be configured externally. Not in migrations. If cron is not scheduled, no server finalization runs unless HTTP-triggered. |

---

## SECTION 7 — SAFETY SUMMARY TABLE

| COMPONENT | CURRENT TRIGGER | WATCHER-DEPENDENT? | HAS DB/REALTIME FALLBACK? | LIKELY SAFE IF WATCHER REMOVED? | NOTES |
|-----------|-----------------|--------------------|----------------------------|----------------------------------|------|
| finalize_givey_event RPC | Watcher (host) or edge function (server) | Host call only | Yes — edge function calls same RPC | Yes | Server path exists |
| activeGivey (host) | Realtime winner_selected/expired, syncActiveGiveyFromDb | No | Yes | Yes | Realtime clears; watcher does not write |
| activeGivey (buyer) | Realtime, syncActiveGiveyFromDb | No | Yes | Yes | Buyer has no watcher |
| latestGivey | Realtime winner_selected/expired, syncLatestGiveyFromDb | No | Yes | Yes | |
| winnerDisplayName | Realtime payload, syncLatestGiveyFromDb | No | Yes | Yes | |
| WinnerBanner | latestGivey, winnerDisplayName | No | Yes | Yes | |
| GiveyEntryBanner | activeGivey | No | Yes | Yes | |
| Host sidebar | activeGivey | No | Yes | Yes | |
| giveyLifecycleRef | Watcher reads; handleStartGivey, realtime, lifecycle sync write | Yes (read) | N/A | Yes | No UI reads ref; ref only used by watcher |
| giveyLifecycleSignal | Watcher deps | Yes | N/A | Yes | Only triggers watcher; no other consumer |
| Lifecycle ref sync effect | activeGivey | Feeds watcher | N/A | Yes | Would write dead ref/signal |
| Stale reconciliation | activeGivey, realtime stale >8s | No | Yes | Yes | Runs sync; not watcher-specific |
| handleStartGivey | Button click | No (start flow) | Yes | Yes | Start flow unchanged |
| [GIVEY AUDIT] logs | Watcher execution | Yes | No | Yes | Logs would stop; no functional impact |
| Server finalization | pg_cron or HTTP | No | — | Depends on deployment | Cron must be configured; not in repo |
