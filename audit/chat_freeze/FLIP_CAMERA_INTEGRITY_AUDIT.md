# Flip Camera — Integrity Audit (Read-Only)

**Date:** 2025-02-07  
**Scope:** Flip Camera button for Host Console  
**Goal:** Confirm adding a Flip Camera button is SAFE and will NOT break streaming, camera permissions, chat, Daily SDK, or show lifecycle.

**Audit Type:** READ-ONLY. No code modifications. No suggested edits.

---

## 1) STREAMING PIPELINE OWNERSHIP

### Component that controls the live camera stream

| Component | Used by HostConsole? | Role |
|-----------|----------------------|------|
| **DailyBroadcaster.jsx** | ✅ YES (mobile: 1201, desktop: 1632) | Active host broadcast path |
| **WebRTCBroadcaster.jsx** | ❌ NO | Legacy; not imported by HostConsole |

**HostConsole uses DailyBroadcaster only.** No WebRTCBroadcaster.

### Camera start, stop, and attach

| Operation | Location | Mechanism |
|-----------|----------|-----------|
| **Start** | DailyBroadcaster.jsx:93–136 | `call.startCamera({ videoSource: true, audioSource: true })` then `call.join()` |
| **Stop** | DailyBroadcaster.jsx:22–47, 141–165 | `call.leave()`, `call.destroy()`; also `window.__stopDailyHost()` |
| **Attach preview** | DailyBroadcaster.jsx:79–91 | `local?.tracks?.video?.persistentTrack` → `localVideoRef.current.srcObject = new MediaStream([track])` |

### RTCPeerConnection / RTCRtpSender

**Not used directly.** No raw WebRTC in the codebase. Daily SDK owns the WebRTC pipeline internally.

**Expected outcome:** ✅ **Daily SDK fully owns camera + track lifecycle.**

---

## 2) CAMERA FLIP CAPABILITY

### Existing camera toggle / facingMode / track replacement

| Search | Result |
|--------|--------|
| `facingMode` | WebRTCBroadcaster.jsx:166 only (permission check; HostConsole does not use it) |
| `cycleCamera` | **None** in codebase |
| `updateInputSettings` | **None** in codebase |
| `toggleCamera` | WebRTCBroadcaster.jsx:590 — `setLocalVideo()` (mute/unmute, not flip) |

No existing Flip Camera implementation in HostConsole or DailyBroadcaster.

### Daily API: cycleCamera

- **Docs:** `cycleCamera({ preferDifferentFacingMode: true })` switches to next camera, preferring different facing mode (front ↔ rear).
- **Changelog:** Added in **daily-js 0.65.0** (June 2024).
- **Current project version:** `@daily-co/daily-js@0.58.0` (DailyBroadcaster.jsx:70, WebRTCViewer.jsx:46, WebRTCBroadcaster.jsx:38).

**cycleCamera is not available in 0.58.0.** It was introduced in 0.65.0.

### Fallback: updateInputSettings

`updateInputSettings({ video: { settings: { facingMode: "environment" } } })` (or `"user"`) can change camera. This API is documented and likely present in 0.58. Implementing flip via `updateInputSettings` would require tracking current facing mode and toggling.

### Active call object storage

| Storage | Location | Scope |
|---------|----------|-------|
| `callObjectRef.current` | DailyBroadcaster.jsx:58 | Component-internal |
| `window.__dailyHostCall` | DailyBroadcaster.jsx:101 | Global; set before `startCamera()` |

**HostConsole can access the call via `window.__dailyHostCall`.**

**Expected outcome:** ⚠️ **Flip via Daily API needs either (a) daily-js upgrade to 0.65+ for `cycleCamera`, or (b) `updateInputSettings` with facingMode in 0.58.**

---

## 3) LIVE STATE SAFETY

### HostConsole “live” determination

| Variable | Definition (HostConsole.jsx:674–675) |
|----------|--------------------------------------|
| `isAlreadyLive` | `show?.stream_status === "live" \|\| (!!dailyRoomUrl && !!dailyToken)` |

### Camera existence guarantees

DailyBroadcaster mounts only when:

```javascript
dailyRoomUrl && dailyToken  // mobile: 1201, desktop: 1632
```

So camera and call exist only after:

1. `dailyRoomUrl` is set (from `startDailyBroadcast` Edge Function response)
2. `dailyToken` is set (same)
3. DailyBroadcaster mounts → `start()` runs → `call.startCamera()` → `call.join()`

**Flip Camera should be enabled only when `isAlreadyLive`** (or equivalently `dailyRoomUrl && dailyToken` when live). That ensures the call exists and the camera has been started.

**Expected outcome:** ✅ **Camera flip cannot run before live state.** Gate UI on `isAlreadyLive`.

---

## 4) UI INSERTION SURFACE (NO EDIT)

### Mobile host icon cluster

**Location:** HostConsole.jsx:1294–1371  
**Structure:** `fixed top-16 right-3 flex flex-col gap-3 z-[200]`

**Buttons:** Message, GIVI (if enabled), Products, **Fulfillment** (hidden when live), Broadcast.

**Fulfillment button:** `{!isAlreadyLive && (...)}` — hidden during live to free a slot.

### Desktop host controls column

**Location:** HostConsole.jsx:1384–1480  
**Structure:** Left column, `space-y-2`

**Buttons:** Broadcast blocked warning, Go Live / LIVE status, End Show, GIVI, Add Product, Recent Orders.

### Fulfillment button impact

- **Mobile:** Fulfillment is hidden when live. The freed slot can be reused for Flip Camera.
- **Desktop:** Fulfillment / Pickup Verification is in a separate `{false && (...)}` block (hidden). No conflict.

**Expected outcome:** ✅ **Mobile slot can be safely reused for Flip Camera.** Fulfillment is pre-live only; during live, that slot is empty.

---

## 5) BLAST RADIUS CHECK

| Area | Impact from Flip Camera button |
|------|--------------------------------|
| **Chat** | None. Flip is a local Daily call method; no chat state or props touched. |
| **Stripe** | None. No payment or checkout code. |
| **Auth** | None. No authentication logic. |
| **Show staging** | None. No show creation, scheduling, or status changes. |
| **Marketplace cards** | None. No discovery or listing logic. |
| **Streaming startup/teardown** | None. No changes to `startDailyBroadcast`, `endShowMutation`, or `__stopDailyHost`. |

**Expected outcome:** ✅ **No impact on chat, Stripe, auth, staging, or marketplace.**

---

## 6) FAILURE MODES

| Scenario | Expected behavior |
|----------|-------------------|
| **Device has only one camera** | Daily docs: “Has no effect if there is only one camera.” No-op, no crash. |
| **User denies camera permission** | `startCamera()` fails; `join()` never runs. Flip is gated by `isAlreadyLive`; user never reaches live UI. Safe. |
| **Camera already stopped** | Call destroyed; `window.__dailyHostCall` is null. Handler should check before calling; `?.cycleCamera()` is a no-op. Safe. |
| **Call object undefined** | `window.__dailyHostCall?.cycleCamera()` → no call. Safe. |

**Expected outcome:** ✅ **No crashes; operation is safely ignored when not applicable.**

---

## REPORT SUMMARY

### ✅ SAFE

- Daily SDK fully owns camera and track lifecycle.
- No direct RTCPeerConnection/RTCRtpSender; all via Daily.
- Live state is well-defined; Flip can be gated on `isAlreadyLive`.
- Camera only exists after `dailyRoomUrl` and `dailyToken` are set.
- Mobile Fulfillment slot is freed when live; safe to reuse for Flip.
- Blast radius: no impact on chat, Stripe, auth, staging, marketplace.
- Failure modes (single camera, permission denied, call undefined) are safe.

### ⚠️ RISKS

1. **daily-js version:** `cycleCamera()` exists in 0.65.0+, not in 0.58.0. Options:
   - Upgrade to 0.65+ to use `cycleCamera` (potential SDK behavior changes).
   - Use `updateInputSettings({ video: { settings: { facingMode: "environment" | "user" } } })` in 0.58 (requires tracking current facing mode).

### ❌ BLOCKERS

1. **cycleCamera in 0.58:** `cycleCamera()` is not available in `@daily-co/daily-js@0.58.0`. Implementation must either upgrade the SDK or use `updateInputSettings` with facingMode.

---

## FINAL VERDICT

**SAFE TO IMPLEMENT** with the following conditions:

1. **SDK path:** Either upgrade daily-js to 0.65+ for `cycleCamera`, or use `updateInputSettings` with facingMode in 0.58.
2. **Gate:** Enable Flip only when `isAlreadyLive` (or `dailyRoomUrl && dailyToken` when live).
3. **Handler:** Guard on `window.__dailyHostCall` before calling; wrap in try/catch.
4. **UI placement:** Mobile — reuse Fulfillment slot (top-right cluster); Desktop — left column near Go Live / End Show.

No impact on streaming, chat, Stripe, auth, show lifecycle, or marketplace. Failure modes are safe.
