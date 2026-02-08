# LiveShow Desktop Regression Confirmation

**Purpose:** Evidence-based audit to identify which callback/function invocation throws `"TypeError: ___ is not a function"` on the newly reachable DESKTOP + useSupabaseChat path after `isShowLive` expansion.

---

## Section A — What Changed (isShowLive Expansion)

**Before (LiveShow.jsx:134–136, prior to Phase 2 Step 1):**
```javascript
const useSupabaseChat =
  show?.stream_status === 'starting' ||
  show?.stream_status === 'live';
```

**After (LiveShow.jsx:139–144):**
```javascript
const isShowLive =
  show?.stream_status === 'starting' ||
  show?.stream_status === 'live' ||
  show?.is_streaming === true ||
  show?.status === 'live';
const useSupabaseChat = isShowLive;
```

**Effect:** The DESKTOP + `useSupabaseChat === true` branch is now reachable when:
- `stream_status` is **not** `'starting'` or `'live'`, but
- `is_streaming === true`, or
- `status === 'live'`

---

## Section B — Newly Reachable Desktop-Live Render Tree

The entire DESKTOP block (LiveShow.jsx:1274–1535) is newly reachable in these expanded show states. No new JSX children were added; the same tree now renders in more scenarios.

| Component | File:Line | Props passed (callbacks only) |
|-----------|-----------|-------------------------------|
| SupabaseLiveChat | LiveShow.jsx:1512–1520 | `onMessageSeller` (passed). `onClose` **NOT passed** (undefined on desktop). |
| IVSPlayer | LiveShow.jsx:1392–1398 | `onStateChange`, `onError` |
| WebRTCViewer | LiveShow.jsx:1400–1403 | `onViewerCountChange` |
| ShareButton | LiveShow.jsx:1353–1362 | No callbacks from LiveShow |
| FollowButton | LiveShow.jsx:1346–1351 | No callbacks from LiveShow |

**Desktop vs mobile SupabaseLiveChat:**

| Prop | Mobile (line 995–1005) | Desktop (line 1512–1520) |
|------|------------------------|--------------------------|
| onClose | Passed: `() => setShowChatOverlay(false)` | **NOT passed** → undefined |
| onMessageSeller | Passed | Passed |
| isOverlay | true | false |

---

## Section C — Callback Inventory with typeof Results

A diagnostic log was added at LiveShow.jsx:1503–1510:

```javascript
console.log("[AUDIT][LiveShow][Desktop][CallbackCheck]", {
  onMessageSeller: typeof onMessageSellerCb,
  onClose: typeof undefined,
  handleIvsStateChange: typeof handleIvsStateChange,
  handleIvsError: typeof handleIvsError,
  handleViewerCountChange: typeof handleViewerCountChange,
});
```

**Expected results when the desktop branch renders:**
- `onMessageSeller`: `"function"`
- `onClose`: `"undefined"` (not passed on desktop)
- `handleIvsStateChange`: `"function"`
- `handleIvsError`: `"function"`
- `handleViewerCountChange`: `"function"`

---

## Section D — Invocation Sites That Can Throw "not a function"

| File:Line | Callback invoked | Guard / condition | Can throw? |
|-----------|------------------|-------------------|------------|
| SupabaseLiveChat.jsx:390–392 | `onMessageSeller` | `onMessageSeller && user && !isSeller` — guarded | No |
| SupabaseLiveChat.jsx:55 | `onClose` | Destructured only; no invocation found in component | N/A — not invoked |
| ViewerBanDialog.jsx:108 | `onOpenChange(false)` | SupabaseLiveChat passes `() => setBanningViewer(null)` | No |
| IVSPlayer (internal) | `onStateChange`, `onError` | LiveShow always passes handlers | Unknown — depends on IVSPlayer internals |
| WebRTCViewer (internal) | `onViewerCountChange` | LiveShow always passes handler | Unknown — depends on WebRTCViewer internals |

**Finding:** `onClose` is the only callback passed on mobile but **omitted** on desktop. SupabaseLiveChat does **not** invoke `onClose` anywhere in the current implementation. There is no unconditional `onClose()` call that would throw on desktop.

---

## Section E — Single Most Likely Failing Callback (with Evidence)

**Constraint:** The regression only affects paths newly reachable due to `isShowLive` expansion.

**Evidence:**

1. **`onClose`** — Omitted on desktop. SupabaseLiveChat receives `onClose === undefined` but never invokes it. No `onClose()` call found in SupabaseLiveChat.jsx. **Low probability** unless an undocumented or conditional invocation exists.

2. **`onMessageSeller`** — Passed on desktop and guarded before use (`onMessageSeller && user && !isSeller`). **Low probability**.

3. **IVSPlayer / WebRTCViewer callbacks** — Both receive functions from LiveShow. In expanded show states (e.g. `stream_status !== 'live'` but `is_streaming === true`), internal logic may differ and could call a callback passed from elsewhere. **Medium probability** — requires inspection of IVSPlayer and WebRTCViewer for any callback invocations that might receive a non-function in edge states.

4. **React Query `onSuccess` / `onError`** — SupabaseLiveChat.jsx:166–171 passes inline functions. No obvious path to a non-function. **Low probability**.

**Conclusion:** With current evidence, there is no definitive single failing callback. The most plausible area is IVSPlayer or WebRTCViewer in expanded show states, or an unreviewed path in a transitive child. Next step: run the app, reproduce the error, and capture the exact `"TypeError: ___ is not a function"` message (including the placeholder) and stack trace.
