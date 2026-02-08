# Flip Camera — Safety Audit

**Purpose:** Confirm the safest conditions and insertion points for a Flip Camera button that calls Daily's `cycleCamera()`, without breaking camera permissions, streaming, or HostConsole rendering.

**Scope:** DailyBroadcaster.jsx, HostConsole.jsx.

**Audit Type:** Read-only. No code modifications.

---

## 1. DAILY CALL LIFECYCLE

### 1.1 window.__dailyHostCall Assignment

**File:** `src/components/streaming/DailyBroadcaster.jsx`

**Lines 99-101:**

```javascript
// Expose globally so HostConsole can stop before navigation
window.__dailyHostCall = call;
```

**Context:** Assigned inside `start()` immediately after `createCallObject()`, before `startCamera()` or `join()`.

---

### 1.2 start() Function — startCamera and join

**File:** `src/components/streaming/DailyBroadcaster.jsx`

**Lines 93-136:**

```javascript
async function start() {
  if (!roomUrl || !token) return;
  await ensureDailyScript();
  if (cancelled) return;

  const call = window.DailyIframe.createCallObject();
  callObjectRef.current = call;
  
  // Expose globally so HostConsole can stop before navigation
  window.__dailyHostCall = call;

  // Keep preview in sync when Daily updates participant/track state
  const onParticipantUpdated = () => attachLocalPreview(call);
  const onTrackStarted = () => attachLocalPreview(call);

  call.on("participant-updated", onParticipantUpdated);
  call.on("track-started", onTrackStarted);

  call.on("participant-counts-updated", (event) => {
    // ... viewer count callback
  });

  // Start camera/mic using Daily v0.58 supported API
  await call.startCamera({
    videoSource: true,
    audioSource: true,
  });

  // Attach local preview (no meeting UI; just a <video>)
  attachLocalPreview(call);

  // Join room with host token
  await call.join({ url: roomUrl, token });

  console.log("[DailyBroadcaster] Host joined + camera started");
}
```

**Order:** `createCallObject` → `window.__dailyHostCall = call` → `startCamera()` → `attachLocalPreview()` → `join()`.

---

### 1.3 Event Handlers on Camera/Track Changes

| Event | Handler | Purpose |
|-------|---------|---------|
| `participant-updated` | `attachLocalPreview(call)` | Re-attach preview when participant state changes |
| `track-started` | `attachLocalPreview(call)` | Re-attach preview when new track starts (e.g. after cycleCamera) |
| `participant-counts-updated` | Viewer count callback | Update live viewer count |

**Note:** `track-started` will fire after `cycleCamera()` switches the camera. The existing handler will re-attach the local preview to the new track.

---

### 1.4 Stop/Cleanup Snippet

**File:** `src/components/streaming/DailyBroadcaster.jsx`

**Module-level `window.__stopDailyHost` (lines 21-47):**

```javascript
window.__stopDailyHost = async () => {
  const call = window.__dailyHostCall;
  if (!call) return;
  
  console.log("[DailyBroadcaster] __stopDailyHost called - stopping broadcast");
  window.__dailyHostCall = null;
  
  clearLocalPreview();
  
  try {
    await call.leave();
  } catch (e) {
    console.warn("[DailyBroadcaster] leave() failed:", e);
  }
  
  try {
    call.destroy();
  } catch (e) {
    console.warn("[DailyBroadcaster] destroy() failed:", e);
  }
  
  clearLocalPreview();
  console.log("[DailyBroadcaster] __stopDailyHost complete - camera released");
};
```

**useEffect cleanup (lines 141-165):**

```javascript
return () => {
  cancelled = true;
  const call = callObjectRef.current;
  callObjectRef.current = null;
  
  if (window.__dailyHostCall === call) {
    window.__dailyHostCall = null;
  }
  
  clearLocalPreview();
  
  if (call) {
    try {
      call.leave();
    } catch {}
    try {
      call.destroy();
    } catch {}
  }
  
  clearLocalPreview();
};
```

**Conclusion:** `window.__dailyHostCall` is set to `null` in both `__stopDailyHost` and the useEffect cleanup. No stale references remain after unmount or explicit stop.

---

## 2. SAFE-TO-FLIP CONDITIONS

### 2.1 “Host is Live” Booleans

**File:** `src/pages/HostConsole.jsx`

| Variable | Definition | Line |
|----------|------------|------|
| `isAlreadyLive` | `show?.stream_status === "live"` | 674 |
| `isBroadcastBlocked` | `show?.status === "ended" \|\| show?.status === "cancelled"` | 671 |

---

### 2.2 startDailyBroadcast Flow

**File:** `src/pages/HostConsole.jsx` (lines 679-763)

1. Calls `daily-create-room` Edge Function.
2. Sets `dailyRoomUrl` and `dailyToken` from response.
3. Updates `shows` in DB: `streaming_provider: "daily"`, `status: "live"`, `stream_status: "live"`.
4. Invalidates `show` query.
5. Sets `isBroadcasting` to true.

**DailyBroadcaster mount:** Rendered when `dailyRoomUrl && dailyToken` (mobile: 1201, desktop: 1630).

---

### 2.3 Conditions That Guarantee Call Exists and Camera Is Started

| Condition | Guarantees |
|-----------|------------|
| `isAlreadyLive` | Show is live in DB (`stream_status === "live"`). |
| `dailyRoomUrl && dailyToken` | DailyBroadcaster is mounted; `start()` has run. |
| `window.__dailyHostCall` truthy | Call object exists. |

**Strict safe-to-flip condition:**

```
isAlreadyLive && dailyRoomUrl && dailyToken && window.__dailyHostCall
```

**Practical simplification:** When `isAlreadyLive && dailyRoomUrl && dailyToken`, DailyBroadcaster is mounted and `start()` has been invoked. `window.__dailyHostCall` is set before `startCamera()`, so it exists as soon as `start()` runs. If `startCamera()` throws (e.g. permission denied), `join()` never runs and the show is not fully live—but `show.stream_status` was already set to `"live"` in `startDailyBroadcast` before Daily starts. So `isAlreadyLive` can be true even if Daily failed. Safe gate: **`isAlreadyLive && dailyRoomUrl && dailyToken`**. The handler should still check `window.__dailyHostCall` before calling `cycleCamera()`.

---

### 2.4 States Where Call Exists but Camera May Not Be Started

| State | Description |
|-------|-------------|
| After `createCallObject`, before `startCamera` | Call exists, no camera. Brief window. |
| `startCamera` throws (permission denied) | Call exists, camera never started. `join()` never runs. |
| `startCamera` succeeds, before `join` | Camera on, not yet in room. Very brief. |

**Mitigation:** Only enable Flip when `isAlreadyLive && dailyRoomUrl && dailyToken`. That implies `start()` was triggered. If `startCamera` failed, the user would see an error and the flow would be broken; in that case, a Flip button would be misleading. Using `isAlreadyLive && dailyRoomUrl && dailyToken` as the UI gate is sufficient; the handler should guard on `window.__dailyHostCall` before calling `cycleCamera()`.

---

## 3. UI INSERTION POINT CONFIRMATION

### 3.1 Mobile Top-Right Icon Cluster

**File:** `src/pages/HostConsole.jsx`  
**Lines:** 1292-1366 (inside `{isMobileDevice && (` block)

**Structure:** `fixed top-16 right-3 flex flex-col gap-3 z-[200]`

**Buttons:** Message, GIVI (if enabled), Products, Fulfillment, Broadcast (Go Live).

**Finding:** No existing camera toggle or Flip button.

---

### 3.2 Desktop Left Column Host Tools

**File:** `src/pages/HostConsole.jsx`  
**Lines:** 1377-1450 (`{isDesktopDevice && (` block)

**Structure:** `space-y-2` in left column

**Buttons:** Broadcast blocked warning, Go Live, End Show, GIVI, Add Product, Recent Orders.

**Finding:** No existing camera toggle or Flip button.

---

### 3.3 Conflicting Keybindings

**Search:** `keydown`, `keyboard`, `key` in HostConsole.jsx.

**Matches:** Enter/Escape only for price and quantity inputs (lines 1557-1558, 1587-1588).

**Conclusion:** No keybindings that conflict with a Flip Camera button.

---

## 4. FAILURE MODE REVIEW

### 4.1 cycleCamera Called When window.__dailyHostCall Is Undefined

**Scenario:** User clicks Flip before or after the call exists (e.g. race, refresh, unmount).

**Behavior:** `window.__dailyHostCall?.cycleCamera()` evaluates to `undefined`; no error, no call.

**Handler spec:** Check `window.__dailyHostCall` before calling. If falsy, return without calling `cycleCamera`. Optionally log a warning. Do not throw.

---

### 4.2 Call Exists but Camera Not Started

**Scenario:** `startCamera` failed (permission denied) or `start()` is still in progress.

**Behavior:** Daily `cycleCamera()` may throw or no-op.

**Handler spec:** Wrap in try/catch. On error, log and avoid surfacing an error to the user unless necessary. Do not break HostConsole. Ensure the button stays disabled when not safe (see Section 5).

---

### 4.3 User Denied Camera Permissions

**Scenario:** Permissions denied before or during `startCamera`.

**Behavior:** `start()` fails; `join()` never runs. `window.__dailyHostCall` exists but call is in a bad state. `cycleCamera` would be meaningless.

**Handler spec:** Only enable Flip when `isAlreadyLive && dailyRoomUrl && dailyToken`. If permissions are denied, the user typically never reaches a UI where these are true. If they do (e.g. stale state), the handler should guard on `window.__dailyHostCall` and catch errors from `cycleCamera()`.

---

### 4.4 Device Has Only One Camera

**Scenario:** Single-camera device.

**Behavior:** Daily docs: “Has no effect if there is only one camera.” So no-op.

**Handler spec:** No special handling. Optionally show a toast or disable the button if a single-camera device is detected, but not required for safety.

---

## 5. FINAL VERDICT

### SAFE to add Flip Camera

**Gating conditions for enabling the button (in code terms):**

```
isAlreadyLive && dailyRoomUrl && dailyToken
```

**Handler behavior:**

1. If `!window.__dailyHostCall`, return without calling `cycleCamera`.
2. Call `window.__dailyHostCall.cycleCamera({ preferDifferentFacingMode: true })` in a try/catch.
3. On error, log and avoid breaking HostConsole; do not rethrow.

**UI placement:**

- **Mobile:** In the top-right icon cluster (lines 1292-1366), e.g. after Fulfillment, before Broadcast.
- **Desktop:** In the left column (lines 1377-1450), e.g. after Go Live, before End Show.

**Button visibility:** Only when `isAlreadyLive` (camera active). Optionally also require `dailyRoomUrl && dailyToken` for extra safety, though when `isAlreadyLive` is true in the normal flow, both are set.
