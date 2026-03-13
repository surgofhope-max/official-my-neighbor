# GIVEY FORENSIC AUDIT REPORT
## STRICT READ-ONLY — NO FIXES

---

## SECTION 1 — FULL GIVEY EVENT FLOW MAP

### HostConsole Flow

| Stage | FILE | LINE | STATE VARIABLE | SOURCE OF TRUTH | POSSIBLE DELAY SOURCE |
|-------|------|------|----------------|-----------------|------------------------|
| Givey starts | HostConsole.jsx | 587-618 | `activeGivey`, `giveyLifecycleRef` | RPC `start_givey_event` response | None — direct from RPC |
| Active givey shown | HostConsole.jsx | 2096-2098 | `activeGivey` | State from RPC or sync | Realtime only listens for UPDATE; INSERT from RPC does not emit to host |
| Countdown active | HostConsole.jsx | N/A | Host has no countdown UI | — | — |
| Givey ends | HostConsole.jsx | 518-539 | `giveyLifecycleRef` | Watcher reads `ends_at` | 500ms interval; host must have page open |
| Finalize fires | HostConsole.jsx | 531-533 | — | `supabase.rpc("finalize_givey_event")` | RPC latency |
| DB row updates | — | — | — | DB trigger/RPC | — |
| Realtime arrives | HostConsole.jsx | 462-482 | `activeGivey` | `payload.new` | Supabase realtime latency; host listens UPDATE only |
| UI clears entry banner | HostConsole.jsx | 480-481 | `setActiveGivey(null)` | Realtime `winner_selected`/`expired` | — |
| Winner banner | HostConsole.jsx | 1544-1549 | `showWinnerBanner`, `activeGIVI` | GIVI only — no Givey winner banner | — |
| Winner banner disappears | GIVIWinnerBanner.jsx | 9-11 | `onDismiss` | 2s setTimeout | — |

### LiveShow (Buyer) Flow

| Stage | FILE | LINE | STATE VARIABLE | SOURCE OF TRUTH | POSSIBLE DELAY SOURCE |
|-------|------|------|----------------|-----------------|------------------------|
| Givey starts | LiveShow.jsx | 426-428 | `activeGivey` | Realtime INSERT/UPDATE `payload.new` | Realtime latency; host must have started |
| Active givey shown | LiveShow.jsx | 1097-1140 | `activeGivey`, `GiveyEntryBanner` | State | — |
| Countdown active | LiveShow.jsx | 477-491, 1123-1128 | `giveyTimeLeft`, inline `Date.now()` | `activeGivey.ends_at` | 1s interval; inline calc not reactive |
| Givey ends | LiveShow.jsx | 105-106 | — | Server/cron finalizes | Buyer has no watcher |
| Finalize fires | — | — | — | Host watcher or cron | — |
| DB row updates | — | — | — | DB | — |
| Realtime arrives | LiveShow.jsx | 422-436 | `activeGivey`, `latestGivey`, `winnerDisplayName` | `payload.new` | Supabase realtime latency |
| UI clears entry banner | LiveShow.jsx | 430-435 | `setActiveGivey(null)` | Realtime | — |
| Winner banner appears | LiveShow.jsx | 1090-1095, 1186 | `WinnerBanner` | `latestGivey`, `winnerDisplayName` | **CRITICAL: `status === "active"` does NOT update `latestGivey`** — old winner can persist |
| Winner banner disappears | LiveShow.jsx | 1090-1091 | Condition: `latestGivey?.status === "winner_selected"` | No auto-dismiss; persists until `latestGivey` changes | **Never cleared when new givey starts via realtime** |

---

## SECTION 2 — ALL GIVEY-RELATED TIMERS

| FILE | LINES | FULL CODE BLOCK | WHAT IT CONTROLS | CAN DELAY UI/FINALIZE? |
|------|-------|-----------------|------------------|------------------------|
| HostConsole.jsx | 499-510 | `setInterval(async () => { if (giveyChannelStatusRef.current !== "SUBSCRIBED") return; if (!activeGivey) return; if (Date.now() - giveyLastPayloadAtRef.current <= 8000) return; ... await syncActiveGiveyFromDb(); giveyLastPayloadAtRef.current = Date.now(); }, 2000)` | Stale reconciliation when realtime >8s | Yes — up to 8s before reconciliation; 2s loop |
| HostConsole.jsx | 518-539 | `setInterval(async () => { ... const now = Date.now(); if (now >= endTime) { await supabase.rpc("finalize_givey_event", ...); giveyLifecycleRef.current = null; } }, 500)` | Host watcher — finalize when `ends_at` passed | Yes — up to 500ms after end before finalize |
| HostConsole.jsx | 788 | `setTimeout(() => setShowPurchaseBanner(false), 2000)` | Purchase banner dismiss | No |
| LiveShow.jsx | 314-316 | `setInterval(() => { loadShow(); }, 5000)` | Show data poll (sales_count, etc.) | No direct givey; can refresh show |
| LiveShow.jsx | 460-472 | `setInterval(async () => { if (giveyChannelStatusRef.current !== "SUBSCRIBED") return; if (!activeGivey) return; if (Date.now() - giveyLastPayloadAtRef.current <= 8000) return; ... await syncActiveGiveyFromDb(); await syncLatestGiveyFromDb(); giveyLastPayloadAtRef.current = Date.now(); }, 2000)` | Stale reconciliation when realtime >8s | Yes — up to 8s threshold before DB sync; buyer can lag |
| LiveShow.jsx | 483-491 | `setInterval(() => { const end = new Date(activeGivey.ends_at).getTime(); const diff = Math.max(0, end - now); setGiveyTimeLeft(diff); }, 1000)` | Countdown display | Minor — 1s granularity |
| LiveShow.jsx | 603-605 | `setInterval(() => { loadProducts(); }, 20000)` | Product list | No |
| LiveShow.jsx | 645-648 | `setInterval(() => { loadFeaturedProduct(); }, 8000)` | Featured product | No |
| LiveShow.jsx | 630 | `setTimeout(() => setShowPurchaseBanner(false), 2000)` | Purchase banner | No |
| LiveShow.jsx | 693-695 | `setTimeout(() => { setPriceJustChanged(false); }, 3000)` | Price change animation | No |
| GIVIWinnerBanner.jsx | 9-11 | `setTimeout(() => { onDismiss(); }, 2000)` | GIVI winner banner auto-dismiss | GIVI only |
| WinnerCelebrationOverlay.jsx | 10-12 | `setTimeout(() => { onComplete(); }, 2000)` | GIVI celebration overlay | GIVI only |

### Stale Thresholds

| FILE | LINE | THRESHOLD | MEANING |
|------|------|-----------|---------|
| HostConsole.jsx | 502 | `8000` ms | Realtime considered stale if no payload in 8s |
| LiveShow.jsx | 463 | `8000` ms | Same — 8s before reconciliation |
| LiveShow.jsx | 673 | `staleTime: 8000` | activeGIVI query | GIVI only |

---

## SECTION 3 — ALL WINNER UI RENDER PATHS

### Givey Winner (not GIVI)

| FILE | LINES | FULL CODE BLOCK | DATA USED | FALLBACK | CAN OVERLAP? |
|------|-------|-----------------|------------|----------|--------------|
| LiveShow.jsx | 1090-1095 | `const WinnerBanner = latestGivey?.status === "winner_selected" && winnerDisplayName && (<div>Winner: {winnerDisplayName}</div>)` | `latestGivey`, `winnerDisplayName` | `winnerDisplayName` fallback "Winner" in syncLatestGiveyFromDb | **YES — with GiveyEntryBanner if `latestGivey` not updated on new givey start** |
| LiveShow.jsx | 1186 | `{WinnerBanner}` | — | — | — |
| LiveShow.jsx | 1097-1140 | `const GiveyEntryBanner = activeGivey && (...)` | `activeGivey`, `giveyTimeLeft`, `giveyEntryStatus` | — | **YES — both can render if `activeGivey` set but `latestGivey` still winner_selected** |

### GIVI Winner (separate system)

| FILE | LINES | FULL CODE BLOCK | DATA USED | FALLBACK | CAN OVERLAP? |
|------|-------|-----------------|------------|----------|--------------|
| HostConsole.jsx | 1544-1549 | `<GIVIWinnerBanner show={showWinnerBanner} winnerName={activeGIVI?.winner_names?.[0]} onDismiss={...} />` | `showWinnerBanner`, `activeGIVI` | "Winner" in GIVIWinnerBanner | No with Givey |
| LiveShow.jsx | 1150-1156 | `<GIVIWinnerBanner show={showWinnerBanner} winnerName={activeGIVI?.winner_names?.[0]} ... />` | Same | Same | No with Givey |
| GIVIViewerOverlay.jsx | 633-639 | `<WinnerCelebrationOverlay winners={celebrationWinners} ... />` | `celebrationWinners` from `activeGIVI.winner_ids/winner_names` | "Winner" | GIVI only |
| GIVIViewerOverlay.jsx | 529-596 | Winner announcement overlay | `activeGIVI`, `showWinnerAnnouncement` | — | GIVI only |

### Other winner displays (non-live)

| FILE | LINES | CONTEXT |
|------|-------|---------|
| SellerOrders.jsx | 1546, 1592 | `Winner: {g.winner_name \|\| "Winner"}` — seller givey list |
| BuyerOrders.jsx | 144-177 | givey_events queries for won giveys |

---

## SECTION 4 — REALTIME VS DB SYNC CONFLICT AUDIT

| FILE | LINES | TRIGGER | STATE WRITTEN | POSSIBLE RACE/CONFLICT |
|------|-------|---------|---------------|------------------------|
| LiveShow.jsx | 422-436 | Realtime `givey_events` event:* | `activeGivey`, `latestGivey`, `winnerDisplayName` | **Race: `status === "active"` sets only `activeGivey`; does NOT set `latestGivey`** — old winner persists |
| LiveShow.jsx | 399-403 | Mount / show change | `syncActiveGiveyFromDb`, `syncLatestGiveyFromDb` | Can overwrite realtime if DB lags |
| LiveShow.jsx | 441-444 | SUBSCRIBED | `syncActiveGiveyFromDb`, `syncLatestGiveyFromDb` | Same |
| LiveShow.jsx | 446-448 | CHANNEL_ERROR/TIMED_OUT/CLOSED | `syncLatestGiveyFromDb` only | Partial sync; no activeGivey sync |
| LiveShow.jsx | 460-471 | Stale reconciliation (>8s) | `syncActiveGiveyFromDb`, `syncLatestGiveyFromDb` | **Only runs when `activeGivey` truthy** — after winner, reconciliation stops; relies on realtime for winner |
| HostConsole.jsx | 462-482 | Realtime UPDATE | `activeGivey`, `giveyLifecycleRef` | Host listens UPDATE only; INSERT (new givey) not received — but host sets from RPC |
| HostConsole.jsx | 417-420 | Mount | `syncActiveGiveyFromDb` | — |
| HostConsole.jsx | 499-509 | Stale reconciliation | `syncActiveGiveyFromDb` | Host has no `syncLatestGiveyFromDb` |

### syncLatestGiveyFromDb behavior

| FILE | LINES | WHEN CLEARS winnerDisplayName |
|------|-------|------------------------------|
| LiveShow.jsx | 370-397 | **NEVER** — only sets when `data?.status === "winner_selected"`; does not clear when latest is "active" |

---

## SECTION 5 — LATEST GIVEY VS ACTIVE GIVEY AUDIT

### activeGivey

| Where set | FILE:LINES |
|-----------|------------|
| LiveShow | 367: `setActiveGivey(data ?? null)` (syncActiveGiveyFromDb) |
| LiveShow | 428: `setActiveGivey(payload.new)` (realtime active) |
| LiveShow | 430: `setActiveGivey(null)` (realtime winner_selected) |
| LiveShow | 434: `setActiveGivey(null)` (realtime expired) |
| HostConsole | 406-409: syncActiveGiveyFromDb |
| HostConsole | 471: realtime active |
| HostConsole | 481: realtime winner_selected/expired |
| HostConsole | 609: handleStartGivey success |

| Where cleared | FILE:LINES |
|---------------|------------|
| LiveShow | 430, 434 (realtime) |
| HostConsole | 400-401, 409, 481 |

| Where rendered | FILE:LINES |
|----------------|------------|
| LiveShow | 1097 (GiveyEntryBanner), 1120, 1123 |
| HostConsole | 2096-2101 |

| Can persist across giveys? | No — cleared on winner_selected/expired |

### latestGivey

| Where set | FILE:LINES |
|-----------|------------|
| LiveShow | 386: `setLatestGivey(data ?? null)` (syncLatestGiveyFromDb) |
| LiveShow | 431: `setLatestGivey(payload.new)` (realtime winner_selected) |
| LiveShow | 435: `setLatestGivey(payload.new)` (realtime expired) |

| Where cleared | **NEVER explicitly** — only overwritten by sync or realtime |
| Where NOT updated | **Realtime `status === "active"`** — does NOT set latestGivey |

| Where rendered | LiveShow 1090-1091 (WinnerBanner condition) |
| Can persist across giveys? | **YES** — when new givey starts via realtime active, latestGivey stays as previous winner_selected |

### winnerDisplayName

| Where set | FILE:LINES |
|-----------|------------|
| LiveShow | 395: syncLatestGiveyFromDb when `data?.status === "winner_selected"` |
| LiveShow | 432: realtime `payload.new.winner_name ?? "Winner"` |

| Where cleared | **NEVER** |
| Where rendered | LiveShow 1093 |
| Can persist? | **YES** — persists until overwritten by next winner_selected sync |

### showWinnerBanner (GIVI)

| Where set | HostConsole 752-753, LiveShow 682-683 |
| Where cleared | onDismiss / 2s timeout in GIVIWinnerBanner |

### giveyEntryStatus

| Where set | LiveShow handleEnterGivey |
| Where cleared | LiveShow 406: `setGiveyEntryStatus(null)` when `activeGivey?.id` changes |
| Can persist? | Cleared on givey id change |

### giveyTimeLeft

| Where set | LiveShow 487 |
| Where cleared | LiveShow 479: when `!activeGivey?.ends_at` |

---

## SECTION 6 — BUYER-SIDE LAG SOURCES

Exact code blocks that can cause buyer UI to update late when DB already finalized:

### 1. Stale reconciliation threshold (8 seconds)

```javascript
// LiveShow.jsx 460-472
if (Date.now() - giveyLastPayloadAtRef.current <= 8000) return;
```

**Effect:** Buyer will not sync from DB until 8 seconds after last realtime payload. If realtime is delayed or drops, winner display is delayed up to 8s.

### 2. Reconciliation only runs when activeGivey is set

```javascript
// LiveShow.jsx 462
if (!activeGivey) return;
```

**Effect:** Once realtime delivers winner_selected, activeGivey becomes null. Next reconciliation cycle exits early. If realtime never delivered, the *previous* reconciliation (while activeGivey was still set) would have run sync. So first stale run recovers; subsequent runs no-op. Lag is bounded by 8s + 2s interval.

### 3. winnerDisplayName fetch is async (extra round-trip)

```javascript
// LiveShow.jsx 388-395
if (data?.status === "winner_selected" && data?.winner_user_id) {
  const { data: userData } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", data.winner_user_id)
    .maybeSingle();
  setWinnerDisplayName(userData?.display_name ?? "Winner");
}
```

**Effect:** syncLatestGiveyFromDb does two sequential requests. Winner banner can lag by one extra network round-trip. Realtime path uses `payload.new.winner_name` (no extra fetch).

### 4. Winner banner render condition

```javascript
// LiveShow.jsx 1090-1091
const WinnerBanner =
  latestGivey?.status === "winner_selected" && winnerDisplayName && (...)
```

**Effect:** Requires both. If syncLatestGiveyFromDb sets latestGivey but users fetch fails, winnerDisplayName stays null; banner does not show.

### 5. Realtime `status === "active"` does NOT update latestGivey

```javascript
// LiveShow.jsx 426-428
if (status === "active") {
  setActiveGivey(payload.new);
  // NO: setLatestGivey(payload.new);
}
```

**Effect:** When new givey starts, latestGivey remains previous winner_selected. WinnerBanner keeps showing during new givey.

### 6. CHANNEL_ERROR path only syncs latest, not active

```javascript
// LiveShow.jsx 446-448
if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
  syncLatestGiveyFromDb();  // No syncActiveGiveyFromDb
}
```

**Effect:** On channel failure, active givey state not refreshed from DB.

---

## SECTION 7 — HIDDEN POLLING / NON-OBVIOUS DELAY SOURCES

| Search term | FILE | LINES | Notes |
|-------------|------|-------|-------|
| givey_events | LiveShow.jsx | 348-379, 419-420 | syncActiveGiveyFromDb, syncLatestGiveyFromDb, realtime |
| givey_events | HostConsole.jsx | 369-391, 454-461 | sync, realtime |
| givey_events | BuyerOrders.jsx | 144-171 | loadGiveyWins, loadWonGiveys — not live UI |
| givey_events | SellerOrders.jsx | 604-616 | loadSellerGiveys — not live UI |
| winner_selected | LiveShow.jsx | 429, 1091 | realtime, WinnerBanner condition |
| winner_selected | HostConsole.jsx | 480 | realtime |
| syncLatestGiveyFromDb | LiveShow.jsx | 370, 402, 443, 469 | Mount, SUBSCRIBED, CHANNEL_ERROR, stale |
| syncActiveGiveyFromDb | LiveShow.jsx | 344, 401, 443, 469 | Same |
| syncActiveGiveyFromDb | HostConsole.jsx | 382, 419, 508 | Mount, stale |

### Non-obvious paths

- **LiveShow loadShow 5s poll** (314-316): Refreshes show data; does not touch givey state. No direct lag.
- **BuyerOrders 5s poll** (207-211): loadGiveyWins, loadWonGiveys — "My Giveys" panel only; not live stream.
- **SellerOrders loadSellerGiveys**: Called when `view === "giveys"`; not live.
- **HostConsole GIVI query** (732-745): refetchInterval 3000, staleTime 2000 — GIVI only.
- **LiveShow GIVI query** (654-676): refetchInterval 10000, staleTime 8000 — GIVI only.

### Cron fallback

- **finalize-expired-giveys** (supabase/functions): Runs on schedule; finalizes active giveys with `ends_at <= now`. If host watcher fails or host closed, cron is fallback. Cron schedule not in repo — depends on deployment.

---

## SECTION 8 — BLAST-RADIUS SUMMARY TABLE

| FILE | LINE | DELAY SOURCE | DUPLICATE UI RISK | OLD STATE PERSISTENCE RISK | REALTIME CONFLICT RISK | NOTES |
|------|------|--------------|------------------|----------------------------|------------------------|------|
| LiveShow.jsx | 426-428 | — | — | **HIGH** | **HIGH** | `status === "active"` does NOT set latestGivey; old winner banner persists |
| LiveShow.jsx | 463 | 8s threshold | — | — | — | Stale reconciliation delayed up to 8s |
| LiveShow.jsx | 462 | — | — | — | — | Reconciliation skips when activeGivey null |
| LiveShow.jsx | 388-395 | users fetch | — | — | — | Extra round-trip for winnerDisplayName |
| LiveShow.jsx | 370-397 | — | — | — | — | syncLatestGiveyFromDb never clears winnerDisplayName |
| LiveShow.jsx | 1090-1095 | — | **MEDIUM** | **HIGH** | — | WinnerBanner + GiveyEntryBanner can both show |
| HostConsole.jsx | 502 | 8s threshold | — | — | — | Same stale logic |
| HostConsole.jsx | 518-539 | 500ms interval | — | — | — | Watcher delay up to 500ms |
| HostConsole.jsx | 458 | UPDATE only | — | — | — | INSERT not received; host uses RPC response |
| LiveShow.jsx | 417 | event: "*" | — | — | — | Gets INSERT and UPDATE |
| LiveShow.jsx | 446-448 | — | — | — | — | CHANNEL_ERROR only syncs latest, not active |
| GIVIWinnerBanner.jsx | 9-11 | 2s timer | — | — | — | GIVI only |
| WinnerCelebrationOverlay.jsx | 10-12 | 2s timer | — | — | — | GIVI only |

---

## CRITICAL FINDINGS (Evidence-Only)

1. **Old winner banner during new givey**: Realtime handler for `status === "active"` updates only `activeGivey`, not `latestGivey`. WinnerBanner uses `latestGivey?.status === "winner_selected"`, so the previous winner stays visible when a new givey starts.

2. **8-second stale threshold**: Both HostConsole and LiveShow wait 8 seconds without realtime before syncing from DB. If realtime is slow or drops, winner display can lag up to 8 seconds.

3. **syncLatestGiveyFromDb never clears winnerDisplayName**: When the latest givey is "active", winnerDisplayName is left unchanged. Combined with (1), stale winner name can persist.

4. **Reconciliation exits when activeGivey is null**: After winner_selected, reconciliation no longer runs. Recovery depends on the last reconciliation run before activeGivey was cleared.

5. **Givey winner banner has no auto-dismiss**: Unlike GIVIWinnerBanner (2s), the Givey WinnerBanner stays until `latestGivey` changes. With (1), it can persist across giveys.

6. **HostConsole realtime listens UPDATE only**: New givey INSERT is not received. Host relies on RPC response from handleStartGivey. No impact if host started the givey.

---

*End of audit. No code was modified.*
