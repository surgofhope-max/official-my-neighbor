# GIVEY WATCHER ARCHITECTURE AUDIT
## Factual Map — No Suggestions, No Recommendations

---

## SECTION 1 — WATCHER INTERVAL LOCATIONS

### Givey-related source files containing setInterval / watcher logic

| File Path | Folder Path | Line Numbers |
|-----------|-------------|--------------|
| src/pages/HostConsole.jsx | src/pages | 530, 563 |
| src/pages/LiveShow.jsx | src/pages | 314, 460, 483, 603, 645 |

### Other files with setInterval (non-Givey watcher)

| File Path | Line Numbers |
|-----------|--------------|
| src/components/chat/SupabaseLiveChat.jsx | 322 |
| src/components/fulfillment/BatchFulfillmentList.jsx | 54 |
| src/components/givi/GIVIHostPanel.jsx | 834 |
| src/components/givi/GIVIViewerOverlay.jsx | 207 |
| src/components/streaming/WebRTCViewer.jsx | 30, 140 |
| src/api/liveChat.ts | 306 |
| src/api/streamSync.ts | 283 |
| src/Layout.jsx | 359, 603, 1148, 1163 |
| src/pages/BuyerOrders.jsx | 207 |
| src/pages/Marketplace.jsx | 353 |
| src/pages/Notifications.jsx | 65 |
| src/pages/SellerOrders.jsx | 321 |

---

## SECTION 2 — WATCHER USEEFFECT DEPENDENCY MAP

### HostConsole.jsx — Stale reconciliation effect (lines 527–551)

| Property | Value |
|----------|-------|
| File | src/pages/HostConsole.jsx |
| Dependency array | `[show?.id, activeGivey, syncActiveGiveyFromDb]` |
| Guard conditions | `if (!show?.id) return` |
| Timer start | Line 530: `setInterval(async () => { ... }, 2000)` |
| Timer cleanup | Line 551: `return () => clearInterval(interval)` |
| Interval depends on | `giveyChannelStatusRef`, `activeGivey`, `giveyLastPayloadAtRef` |
| Functions called inside interval | `syncActiveGiveyFromDb()` |
| Interval period | 2000 ms |

### HostConsole.jsx — Givey watcher effect (lines 553–621)

| Property | Value |
|----------|-------|
| File | src/pages/HostConsole.jsx |
| Dependency array | `[show?.id, giveyLifecycleSignal]` |
| Guard conditions | `if (!show?.id) return` |
| Timer start | Line 563: `setInterval(async () => { ... }, 500)` |
| Timer cleanup | Lines 613–619: `return () => { ... clearInterval(interval); }` |
| Interval depends on | `giveyLifecycleRef.current` |
| Functions called inside interval | `supabase.rpc("finalize_givey_event", { p_givey_event_id: giveyId })` |
| Interval period | 500 ms |
| Lifecycle triggers | `show?.id` change, `giveyLifecycleSignal` increment |

### LiveShow.jsx — Show load poll (lines 309–319)

| Property | Value |
|----------|-------|
| File | src/pages/LiveShow.jsx |
| Dependency array | `[showId]` |
| Guard conditions | `if (!showId) return` |
| Timer start | Line 314: `setInterval(() => { loadShow(); }, 5000)` |
| Timer cleanup | Line 318: `return () => clearInterval(interval)` |
| Interval period | 5000 ms |

### LiveShow.jsx — Stale reconciliation effect (lines 457–475)

| Property | Value |
|----------|-------|
| File | src/pages/LiveShow.jsx |
| Dependency array | `[show?.id, activeGivey, syncActiveGiveyFromDb, syncLatestGiveyFromDb]` |
| Guard conditions | `if (!show?.id) return` |
| Timer start | Line 460: `setInterval(async () => { ... }, 2000)` |
| Timer cleanup | Line 474: `return () => clearInterval(interval)` |
| Interval depends on | `giveyChannelStatusRef`, `activeGivey`, `giveyLastPayloadAtRef` |
| Functions called inside interval | `syncActiveGiveyFromDb()`, `syncLatestGiveyFromDb()` |
| Interval period | 2000 ms |

### LiveShow.jsx — Givey countdown effect (lines 477–491)

| Property | Value |
|----------|-------|
| File | src/pages/LiveShow.jsx |
| Dependency array | `[activeGivey]` |
| Guard conditions | `if (!activeGivey?.ends_at) { setGiveyTimeLeft(null); return; }` |
| Timer start | Line 483: `setInterval(() => { ... }, 1000)` |
| Timer cleanup | Line 490: `return () => clearInterval(interval)` |
| Interval depends on | `activeGivey.ends_at` |
| Functions called inside interval | `setGiveyTimeLeft(diff)` |
| Interval period | 1000 ms |

### LiveShow.jsx — Product load poll (lines 598–608)

| Property | Value |
|----------|-------|
| File | src/pages/LiveShow.jsx |
| Dependency array | `[showId]` |
| Guard conditions | None at effect level |
| Timer start | Line 603: `setInterval(() => { loadProducts(); }, 20000)` |
| Timer cleanup | Line 607: `return () => clearInterval(interval)` |
| Interval period | 20000 ms |

### LiveShow.jsx — Featured product poll (lines 637–651)

| Property | Value |
|----------|-------|
| File | src/pages/LiveShow.jsx |
| Dependency array | `[show?.featured_product_id]` |
| Guard conditions | `if (!show?.featured_product_id) { setFeaturedProduct(null); return; }` |
| Timer start | Line 645: `setInterval(() => { loadFeaturedProduct(); }, 8000)` |
| Timer cleanup | Line 649: `return () => clearInterval(interval)` |
| Interval period | 8000 ms |

---

## SECTION 3 — GIVEY LIFECYCLE SIGNAL FLOW

### giveyLifecycleRef.current — modifications

| File | Line | Code Block | Trigger |
|------|------|------------|---------|
| src/pages/HostConsole.jsx | 441 | `giveyLifecycleRef.current = { id: activeGivey.id, endsAt: activeGivey.ends_at };` | Lifecycle ref sync effect when `activeGivey?.id` and `activeGivey?.ends_at` exist |
| src/pages/HostConsole.jsx | 496–498 | `giveyLifecycleRef.current = { id: payload.new?.id, endsAt: payload.new?.ends_at };` | Realtime handler when `payload.new.status === "active"` |
| src/pages/HostConsole.jsx | 595 | `giveyLifecycleRef.current = null;` | Watcher interval when `now >= endTime` and RPC resolves |
| src/pages/HostConsole.jsx | 693–695 | `giveyLifecycleRef.current = { id: data?.id, endsAt: data?.ends_at };` | handleStartGivey success block |

### giveyLifecycleRef.current — reads (no modification)

| File | Line | Context |
|------|------|---------|
| src/pages/HostConsole.jsx | 510 | Realtime handler log: `currentLifecycleRef: giveyLifecycleRef.current` |
| src/pages/HostConsole.jsx | 541 | Reconciliation log: `currentLifecycleRef: giveyLifecycleRef.current` |
| src/pages/HostConsole.jsx | 560 | Watcher started log: `currentLifecycleRef: giveyLifecycleRef.current` |
| src/pages/HostConsole.jsx | 564 | Watcher guard: `if (!giveyLifecycleRef.current) return` |
| src/pages/HostConsole.jsx | 566 | Watcher destructure: `const { id: giveyId, endsAt } = giveyLifecycleRef.current` |
| src/pages/HostConsole.jsx | 579 | Watcher tick log: `currentLifecycleRef: giveyLifecycleRef.current` |
| src/pages/HostConsole.jsx | 617 | Watcher cleanup log: `currentLifecycleRef: giveyLifecycleRef.current` |

### giveyLifecycleSignal — modifications

| File | Line | Code Block | Trigger |
|------|------|------------|---------|
| src/pages/HostConsole.jsx | 116 | `const [giveyLifecycleSignal, setGiveyLifecycleSignal] = useState(0);` | Declaration |
| src/pages/HostConsole.jsx | 442 | `setGiveyLifecycleSignal((n) => n + 1);` | Lifecycle ref sync effect after setting giveyLifecycleRef |
| src/pages/HostConsole.jsx | 499 | `setGiveyLifecycleSignal((n) => n + 1);` | Realtime handler after setting giveyLifecycleRef (status active) |
| src/pages/HostConsole.jsx | 697 | `setGiveyLifecycleSignal((n) => n + 1);` | handleStartGivey success block after setting giveyLifecycleRef |

### activeGivey — modifications (HostConsole.jsx)

| File | Line | Code Block | Trigger |
|------|------|------------|---------|
| src/pages/HostConsole.jsx | 407 | `setActiveGivey(row)` | syncActiveGiveyFromDb when row exists |
| src/pages/HostConsole.jsx | 400, 426 | `setActiveGivey(null)` | syncActiveGiveyFromDb on error or no row |
| src/pages/HostConsole.jsx | 494 | `setActiveGivey(payload.new)` | Realtime handler status active |
| src/pages/HostConsole.jsx | 511 | `setActiveGivey(null)` | Realtime handler status winner_selected or expired |
| src/pages/HostConsole.jsx | 691 | `setActiveGivey(data)` | handleStartGivey success block |

### activeGivey — modifications (LiveShow.jsx)

| File | Line | Code Block | Trigger |
|------|------|------------|---------|
| src/pages/LiveShow.jsx | 367 | `setActiveGivey(data ?? null)` | syncActiveGiveyFromDb |
| src/pages/LiveShow.jsx | 428 | `setActiveGivey(payload.new)` | Realtime status active |
| src/pages/LiveShow.jsx | 430, 434 | `setActiveGivey(null)` | Realtime status winner_selected or expired |

---

## SECTION 4 — FINALIZATION CALL FLOW

### src/pages/HostConsole.jsx (lines 590–594)

```javascript
        try {
          const rpcResult = await supabase.rpc("finalize_givey_event", {
            p_givey_event_id: giveyId
          });
          giveyLifecycleRef.current = null;
```

| Property | Value |
|----------|-------|
| Trigger | Watcher interval when `now >= endTime` (endTime from `giveyLifecycleRef.current.endsAt`) |
| Guard | `if (!giveyLifecycleRef.current) return`, `if (!giveyId \|\| !endsAt) return`, `if (now >= endTime)` |
| Parameter | `p_givey_event_id: giveyId` (from giveyLifecycleRef.current.id) |

### supabase/functions/finalize-expired-giveys/index.ts (lines 41–46)

```javascript
  for (const row of expiredGiveys) {
    try {
      const { error } = await supabase.rpc("finalize_givey_event", {
        p_givey_event_id: row.id,
      });
```

| Property | Value |
|----------|-------|
| Trigger | HTTP request or pg_cron invocation |
| Data source | `givey_events` where `status = 'active'` and `ends_at <= now()` |
| Parameter | `p_givey_event_id: row.id` |

---

## SECTION 5 — TIMER CLEANUP LOCATIONS

### Givey-related cleanup

| File | Line | Code Block | Effect |
|------|------|------------|--------|
| src/pages/HostConsole.jsx | 551 | `return () => clearInterval(interval);` | Stale reconciliation effect cleanup |
| src/pages/HostConsole.jsx | 619 | `clearInterval(interval);` | Watcher effect cleanup (inside return function) |
| src/pages/LiveShow.jsx | 474 | `return () => clearInterval(interval);` | Stale reconciliation effect cleanup |
| src/pages/LiveShow.jsx | 490 | `return () => clearInterval(interval);` | Givey countdown effect cleanup |
| src/pages/LiveShow.jsx | 318 | `return () => clearInterval(interval);` | Show load poll cleanup |
| src/pages/LiveShow.jsx | 607 | `return () => clearInterval(interval);` | Product load poll cleanup |
| src/pages/LiveShow.jsx | 649 | `return () => clearInterval(interval);` | Featured product poll cleanup |

### Watcher cleanup logic (HostConsole.jsx lines 613–619)

```javascript
    return () => {
      console.log("[GIVEY AUDIT][WATCHER_CLEANUP]", {
        time: new Date().toISOString(),
        showId: show?.id,
        currentLifecycleRef: giveyLifecycleRef.current,
      });
      clearInterval(interval);
    };
```

| Property | Value |
|----------|-------|
| Runs when | Effect re-runs (show?.id or giveyLifecycleSignal change) or component unmount |
| Clears | The 500 ms watcher interval |

---

## EXECUTION FLOW SUMMARY (Facts Only)

### Watcher timer start sequence

1. HostConsole mounts with `show?.id` from useQuery.
2. Watcher effect runs when `show?.id` is truthy and `giveyLifecycleSignal` is in dependency array.
3. On first run, `giveyLifecycleRef.current` may be null (no active givey).
4. If `syncActiveGiveyFromDb` finds an active givey, it sets `activeGivey`.
5. Lifecycle ref sync effect runs when `activeGivey?.id` and `activeGivey?.ends_at` exist; sets `giveyLifecycleRef.current` and increments `giveyLifecycleSignal`.
6. Watcher effect re-runs due to `giveyLifecycleSignal` change; starts 500 ms interval.
7. Interval reads `giveyLifecycleRef.current` each tick; when `now >= endTime`, calls `finalize_givey_event` RPC.
8. On RPC success, sets `giveyLifecycleRef.current = null`.
9. Realtime may deliver `winner_selected` or `expired`; sets `activeGivey(null)`. Lifecycle ref sync effect does not clear giveyLifecycleRef (condition requires activeGivey?.id).

### Events that trigger lifecycle changes

| Event | File | Effect |
|-------|------|--------|
| handleStartGivey RPC success | HostConsole.jsx | Sets activeGivey, giveyLifecycleRef, giveyLifecycleSignal |
| Realtime UPDATE status active | HostConsole.jsx | Sets activeGivey, giveyLifecycleRef, giveyLifecycleSignal |
| Realtime UPDATE status winner_selected/expired | HostConsole.jsx | Sets activeGivey(null) |
| syncActiveGiveyFromDb returns row | HostConsole.jsx | Sets activeGivey (lifecycle ref sync effect then updates giveyLifecycleRef) |
| syncActiveGiveyFromDb returns null/error | HostConsole.jsx | Sets activeGivey(null) |
| Watcher RPC success | HostConsole.jsx | Sets giveyLifecycleRef.current = null |
