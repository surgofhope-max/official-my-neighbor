# GIVEY MIGRATION FORENSIC MAP
## Strict Read-Only — Exact Code Evidence for Server-Timed Finalization Migration

---

## SECTION 1 — WATCHER REMOVAL SURFACE

### 1.1 giveyLifecycleRef declaration

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 121 |
| EXACT CODE | `const giveyLifecycleRef = useRef(null);` |
| VARIABLE | giveyLifecycleRef |
| NON-WATCHER READS | No. Only watcher reads it (564, 566, 579, 617). Realtime and handleStartGivey write it. |

### 1.2 giveyLifecycleSignal declaration

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 116 |
| EXACT CODE | `const [giveyLifecycleSignal, setGiveyLifecycleSignal] = useState(0);` |
| VARIABLE | giveyLifecycleSignal |
| NON-WATCHER READS | No. Only watcher useEffect dependency array (621). |

### 1.3 Lifecycle ref sync effect

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 438-444 |
| EXACT CODE | See below |
| VARIABLES | giveyLifecycleRef.current, giveyLifecycleSignal |
| NON-WATCHER READS | giveyLifecycleRef: only watcher. giveyLifecycleSignal: only watcher deps. |

```javascript
  useEffect(() => {
    if (activeGivey?.id && activeGivey?.ends_at) {
      giveyLifecycleRef.current = { id: activeGivey.id, endsAt: activeGivey.ends_at };
      setGiveyLifecycleSignal((n) => n + 1);
    }
  }, [activeGivey?.id, activeGivey?.ends_at]);
```

### 1.4 Watcher useEffect

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 553-621 |
| EXACT CODE | See below |
| VARIABLES | giveyLifecycleRef (read, clear), finalize_givey_event RPC |
| NON-WATCHER READS | N/A — this is the watcher |

```javascript
  useEffect(() => {
    if (!show?.id) return;

    console.log("[GIVEY AUDIT][WATCHER_STARTED]", {
      time: new Date().toISOString(),
      showId: show?.id,
      currentLifecycleRef: giveyLifecycleRef.current,
    });

    const interval = setInterval(async () => {
      if (!giveyLifecycleRef.current) return;

      const { id: giveyId, endsAt } = giveyLifecycleRef.current;
      if (!giveyId || !endsAt) return;

      const endTime = new Date(endsAt).getTime();
      const now = Date.now();
      const msRemaining = endTime - now;

      if (msRemaining <= 3000 && msRemaining > 0) {
        console.log("[GIVEY AUDIT][WATCHER_TICK_LAST_3S]", {...});
      }

      if (now >= endTime) {
        console.log("[GIVEY AUDIT][WATCHER_FINALIZE_ATTEMPT]", {...});
        console.log("[GIVEY FINALIZED BY HOST]", { giveyId });

        try {
          const rpcResult = await supabase.rpc("finalize_givey_event", {
            p_givey_event_id: giveyId
          });
          giveyLifecycleRef.current = null;
          console.log("[GIVEY AUDIT][WATCHER_FINALIZE_RESOLVED]", {...});
        } catch (err) {
          console.log("[GIVEY AUDIT][WATCHER_FINALIZE_ERROR]", {...});
          console.error("[GIVEY] finalize_givey_event failed:", err);
        }
      }
    }, 500);

    console.log("[GIVEY WATCHER ACTIVE]", { showId: show?.id });
    return () => {
      console.log("[GIVEY AUDIT][WATCHER_CLEANUP]", {...});
      clearInterval(interval);
    };
  }, [show?.id, giveyLifecycleSignal]);
```

### 1.5 giveyLifecycleRef / setGiveyLifecycleSignal in handleStartGivey

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 693-697 |
| EXACT CODE | `giveyLifecycleRef.current = { id: data?.id, endsAt: data?.ends_at }; setGiveyLifecycleSignal((n) => n + 1);` |
| VARIABLES | giveyLifecycleRef, giveyLifecycleSignal |

### 1.6 giveyLifecycleRef / setGiveyLifecycleSignal in realtime handler (status active)

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 496-499 |
| EXACT CODE | `giveyLifecycleRef.current = { id: payload.new?.id, endsAt: payload.new?.ends_at }; setGiveyLifecycleSignal((n) => n + 1);` |
| VARIABLES | giveyLifecycleRef, giveyLifecycleSignal |

### 1.7 Reconciliation log references giveyLifecycleRef

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 541 |
| EXACT CODE | `currentLifecycleRef: giveyLifecycleRef.current` (in RECONCILE_TRIGGER log) |
| NON-WATCHER READS | Log only; no logic depends on it |

---

## SECTION 2 — SERVER FINALIZATION SURFACE

### 2.1 processExpiredGiveys (edge function)

| Property | Value |
|----------|-------|
| FILE | supabase/functions/finalize-expired-giveys/index.ts |
| LINES | 14-52 |
| FUNCTION NAME | processExpiredGiveys |
| TRIGGER SOURCE | HTTP POST to /functions/v1/finalize-expired-giveys (pg_cron or manual) |
| DB CONDITION | `.eq("status", "active").lte("ends_at", now)` |
| NEXT FUNCTION | `supabase.rpc("finalize_givey_event", { p_givey_event_id: row.id })` |

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
    const { error } = await supabase.rpc("finalize_givey_event", {
      p_givey_event_id: row.id,
    });
  }
}
```

### 2.2 serve handler

| Property | Value |
|----------|-------|
| FILE | supabase/functions/finalize-expired-giveys/index.ts |
| LINES | 54-61 |
| FUNCTION NAME | serve (default export) |
| TRIGGER SOURCE | HTTP request |
| NEXT FUNCTION | processExpiredGiveys() |

### 2.3 Manual expire script

| Property | Value |
|----------|-------|
| FILE | supabase/scripts/expire_givey.sql |
| LINES | 5-7 |
| TRIGGER SOURCE | Manual execution in SQL Editor |
| DB CONDITION | `id = '<active_givey_id>'` |
| NEXT | Direct UPDATE; does not call finalize_givey_event |

```sql
update public.givey_events
set status = 'expired'
where id = '<active_givey_id>';
```

---

## SECTION 3 — HOST POST-FINALIZATION REACTION PATH

### Step 1: Realtime handler receives givey_events UPDATE

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 480-513 |
| SOURCE EVENT | postgres_changes UPDATE on givey_events, filter show_id |
| STATE UPDATED | setActiveGivey(null) when status === "winner_selected" or "expired" |
| UI AFFECTED | Sidebar switches from "Givey #X is Active" to "Next Givey: #Y" |

```javascript
        (payload) => {
          giveyLastPayloadAtRef.current = Date.now();
          if (!payload.new) return;
          const status = payload.new.status;
          if (status === "winner_selected" || status === "expired") {
            setActiveGivey(null);
          }
        }
```

### Step 2: syncActiveGiveyFromDb (mount, SUBSCRIBED, or reconciliation)

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 383-431 |
| SOURCE EVENT | Mount effect (435), reconciliation when stale >8s (547) |
| STATE UPDATED | setActiveGivey(row) or setActiveGivey(null) |
| UI AFFECTED | Sidebar |

```javascript
  const syncActiveGiveyFromDb = useCallback(async () => {
    const { data: row, error } = await supabase
      .from("givey_events")
      .select("*")
      .eq("show_id", show.id)
      .eq("status", "active")
      ...
    if (row) setActiveGivey(row);
    else setActiveGivey(null);
  }, [show?.id]);
```

### Step 3: Sidebar render

| Property | Value |
|----------|-------|
| FILE | src/pages/HostConsole.jsx |
| LINES | 2181-2194 |
| SOURCE EVENT | React render when activeGivey changes |
| STATE READ | activeGivey, nextGiveyNumber |
| UI AFFECTED | "Givey #X is Active" or "Next Givey: #Y", Start Givey button visibility |

```javascript
                  {activeGivey
                    ? `Givey #${activeGivey.givey_number} is Active`
                    : `Next Givey: #${nextGiveyNumber ?? "-"}`}
                  {!activeGivey && (
                    <Button onClick={handleStartGivey} ...>Start Givey</Button>
                  )}
```

---

## SECTION 4 — BUYER POST-FINALIZATION REACTION PATH

### Step 1: Realtime handler receives givey_events UPDATE

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 422-436 |
| SOURCE EVENT | postgres_changes (event: "*") on givey_events, filter show_id |
| STATE UPDATED | winner_selected: setActiveGivey(null), setLatestGivey(payload.new), setWinnerDisplayName(payload.new.winner_name ?? "Winner"); expired: setActiveGivey(null), setLatestGivey(payload.new) |
| UI AFFECTED | GiveyEntryBanner hides, WinnerBanner shows (winner_selected only) |

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

### Step 2: syncActiveGiveyFromDb / syncLatestGiveyFromDb

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 344-397 |
| SOURCE EVENT | Mount (401), SUBSCRIBED (443), CHANNEL_ERROR (448), reconciliation (469-470) |
| STATE UPDATED | syncActiveGiveyFromDb: setActiveGivey; syncLatestGiveyFromDb: setLatestGivey, setWinnerDisplayName (when winner_selected) |
| UI AFFECTED | GiveyEntryBanner, WinnerBanner |

### Step 3: winnerDisplayName fetch in syncLatestGiveyFromDb

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 388-395 |
| SOURCE EVENT | syncLatestGiveyFromDb when data?.status === "winner_selected" |
| STATE UPDATED | setWinnerDisplayName(userData?.display_name ?? "Winner") |
| UI AFFECTED | WinnerBanner |

### Step 4: WinnerBanner render

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 1090-1095, 1186 |
| SOURCE EVENT | React render |
| STATE READ | latestGivey?.status === "winner_selected", winnerDisplayName |
| UI AFFECTED | Fixed div "Winner: {winnerDisplayName}" |

### Step 5: GiveyEntryBanner render

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 1097-1140, 1187 |
| SOURCE EVENT | React render |
| STATE READ | activeGivey |
| UI AFFECTED | Entry banner with countdown, Enter Givey button |

### Step 6: Countdown timer effect

| Property | Value |
|----------|-------|
| FILE | src/pages/LiveShow.jsx |
| LINES | 477-491 |
| SOURCE EVENT | activeGivey?.ends_at change |
| STATE UPDATED | setGiveyTimeLeft(diff) or setGiveyTimeLeft(null) |
| UI AFFECTED | GiveyEntryBanner time display (inline calc also at 1123-1127) |

---

## SECTION 5 — UI STATE MISMATCH / OVERLAP SURFACE

### activeGivey

| Property | Value |
|----------|-------|
| SET | HostConsole: 407, 426, 494, 511, 691; LiveShow: 367, 428, 430, 434 |
| CLEARED | HostConsole: 400, 426, 511; LiveShow: 363, 430, 434 |
| RENDERED | HostConsole: 2181-2182; LiveShow: 1097, 1120, 1123, 1132, 494 |
| PERSISTENCE RISK | Realtime status "active" does not update latestGivey; when new givey starts, activeGivey set but latestGivey can stay winner_selected |

### latestGivey

| Property | Value |
|----------|-------|
| SET | LiveShow: 386, 431, 435 |
| CLEARED | Never explicitly; overwritten only |
| RENDERED | LiveShow: 1091 |
| PERSISTENCE RISK | status === "active" handler does NOT set latestGivey; old winner can persist during new givey |

### winnerDisplayName

| Property | Value |
|----------|-------|
| SET | LiveShow: 395, 432 |
| CLEARED | Never |
| RENDERED | LiveShow: 1093 |
| PERSISTENCE RISK | syncLatestGiveyFromDb only sets when winner_selected; never clears when latest is "active" |

### giveyTimeLeft

| Property | Value |
|----------|-------|
| SET | LiveShow: 487 |
| CLEARED | LiveShow: 479 |
| RENDERED | GiveyEntryBanner uses inline calc (1123-1127), not giveyTimeLeft |
| PERSISTENCE RISK | Cleared when !activeGivey?.ends_at |

### giveyEntryStatus

| Property | Value |
|----------|-------|
| SET | LiveShow: handleEnterGivey (536+) |
| CLEARED | LiveShow: 406 (when activeGivey?.id changes), 496 |
| RENDERED | LiveShow: 1132, 1137, 1138 |
| PERSISTENCE RISK | Cleared on givey id change |

### showWinnerBanner (LiveShow)

| Property | Value |
|----------|-------|
| SET | LiveShow: 682-683 (GIVI trigger) |
| CLEARED | LiveShow: 1155 onDismiss |
| RENDERED | GIVIWinnerBanner (GIVI, not Givey) |
| NOTE | Givey WinnerBanner uses latestGivey/winnerDisplayName, not showWinnerBanner |

---

## SECTION 6 — TIMING / STALENESS SURFACE

| FILE | LINES | CODE | INTERVAL/THRESHOLD | CONTROLS | AFFECTS FINALIZATION? |
|------|-------|------|--------------------|----------|------------------------|
| HostConsole.jsx | 563 | setInterval(..., 500) | 500 ms | Watcher tick | Yes — watcher calls finalize RPC |
| HostConsole.jsx | 530 | setInterval(..., 2000) | 2000 ms | Stale reconciliation | No — only sync |
| HostConsole.jsx | 533 | Date.now() - giveyLastPayloadAtRef <= 8000 | 8000 ms | Stale threshold | No — gates reconciliation |
| LiveShow.jsx | 460 | setInterval(..., 2000) | 2000 ms | Stale reconciliation | No |
| LiveShow.jsx | 463 | Date.now() - giveyLastPayloadAtRef <= 8000 | 8000 ms | Stale threshold | No |
| LiveShow.jsx | 483 | setInterval(..., 1000) | 1000 ms | Countdown | No — UI only |
| GIVIWinnerBanner.jsx | 9-11 | setTimeout(onDismiss, 2000) | 2000 ms | GIVI banner auto-dismiss | No — GIVI only |
| LiveShow.jsx | 1090-1095 | — | None | Givey WinnerBanner has no auto-dismiss | — |

---

## SECTION 7 — CONNECTION GRAPH

| SOURCE | DESTINATION | FILE | LINE | TYPE |
|--------|-------------|------|------|------|
| handleStartGivey | start_givey_event RPC | HostConsole.jsx | 673 | RPC |
| start_givey_event RPC | givey_events row (INSERT) | — | — | DB |
| handleStartGivey success | setActiveGivey, giveyLifecycleRef, setGiveyLifecycleSignal | HostConsole.jsx | 691-697 | state |
| Watcher interval | finalize_givey_event RPC | HostConsole.jsx | 592 | RPC |
| processExpiredGiveys | finalize_givey_event RPC | finalize-expired-giveys/index.ts | 42 | RPC |
| finalize_givey_event RPC | givey_events UPDATE | — | — | DB |
| givey_events UPDATE | postgres_changes | Supabase | — | realtime |
| postgres_changes | HostConsole realtime handler | HostConsole.jsx | 480-513 | realtime |
| postgres_changes | LiveShow realtime handler | LiveShow.jsx | 422-436 | realtime |
| HostConsole realtime (winner_selected/expired) | setActiveGivey(null) | HostConsole.jsx | 511 | state |
| LiveShow realtime (winner_selected) | setActiveGivey(null), setLatestGivey, setWinnerDisplayName | LiveShow.jsx | 430-432 | state |
| LiveShow realtime (expired) | setActiveGivey(null), setLatestGivey | LiveShow.jsx | 434-435 | state |
| activeGivey | Host sidebar render | HostConsole.jsx | 2181-2182 | render |
| activeGivey | GiveyEntryBanner, countdown, handleEnterGivey | LiveShow.jsx | 1097, 483, 494 | render |
| latestGivey, winnerDisplayName | WinnerBanner | LiveShow.jsx | 1090-1095 | render |
| syncActiveGiveyFromDb | setActiveGivey | HostConsole.jsx, LiveShow.jsx | 407/367, 400/363 | state |
| syncLatestGiveyFromDb | setLatestGivey, setWinnerDisplayName | LiveShow.jsx | 386, 388-395 | state |
| Lifecycle ref sync | giveyLifecycleRef, setGiveyLifecycleSignal | HostConsole.jsx | 441-442 | state |
| giveyLifecycleSignal | Watcher useEffect deps | HostConsole.jsx | 621 | state |
| giveyLifecycleRef | Watcher interval read/clear | HostConsole.jsx | 564, 566, 595 | state |

---

## SECTION 8 — EXECUTION BLAST RADIUS TABLE

| COMPONENT | PRIMARY FILE | WATCHER-DEPENDENT? | SERVER-FINALIZATION-DEPENDENT? | UI-ONLY? | DB-ONLY? | STATE TOUCHED | NOTES |
|-----------|--------------|-------------------|--------------------------------|----------|----------|---------------|-------|
| Watcher useEffect | HostConsole.jsx | Yes | No | No | No | giveyLifecycleRef | Calls finalize RPC |
| Lifecycle ref sync | HostConsole.jsx | Feeds watcher | No | No | No | giveyLifecycleRef, giveyLifecycleSignal | No consumer if watcher removed |
| giveyLifecycleRef | HostConsole.jsx | Yes (only reader) | No | No | No | — | Written by handleStartGivey, realtime, sync |
| giveyLifecycleSignal | HostConsole.jsx | Yes (only consumer) | No | No | No | — | Triggers watcher |
| handleStartGivey | HostConsole.jsx | Writes ref/signal | No | No | No | activeGivey, giveyLifecycleRef, giveyLifecycleSignal | Start flow unchanged |
| Host realtime handler | HostConsole.jsx | Writes ref/signal | No | No | No | activeGivey, giveyLifecycleRef, giveyLifecycleSignal | Clears activeGivey on winner/expired |
| syncActiveGiveyFromDb (host) | HostConsole.jsx | No | No | No | Yes | activeGivey | Queries status=active |
| Host sidebar | HostConsole.jsx | No | No | Yes | No | activeGivey | Renders activeGivey |
| Stale reconciliation (host) | HostConsole.jsx | No | No | No | Yes | via sync | Gates on activeGivey |
| processExpiredGiveys | finalize-expired-giveys/index.ts | No | Yes | No | Yes | — | Calls finalize RPC |
| finalize_givey_event RPC | — | No | Yes | No | Yes | givey_events | Updates row |
| givey_events UPDATE | Supabase | No | Yes | No | Yes | — | Triggers realtime |
| LiveShow realtime handler | LiveShow.jsx | No | No | No | No | activeGivey, latestGivey, winnerDisplayName | Reacts to DB update |
| syncActiveGiveyFromDb (buyer) | LiveShow.jsx | No | No | No | Yes | activeGivey | |
| syncLatestGiveyFromDb | LiveShow.jsx | No | No | No | Yes | latestGivey, winnerDisplayName | |
| WinnerBanner | LiveShow.jsx | No | No | Yes | No | latestGivey, winnerDisplayName | |
| GiveyEntryBanner | LiveShow.jsx | No | No | Yes | No | activeGivey | |
| Countdown | LiveShow.jsx | No | No | Yes | No | activeGivey.ends_at, giveyTimeLeft | |
| Stale reconciliation (buyer) | LiveShow.jsx | No | No | No | Yes | via sync | Gates on activeGivey |
| expire_givey.sql | supabase/scripts/ | No | No | No | Yes | givey_events | Manual; direct UPDATE |
