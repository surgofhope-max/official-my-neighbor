# Flip Camera — Streaming Pipeline Audit

**Purpose:** Identify how the Host/Seller camera stream is created and published, and whether "Flip Camera" can be implemented via track replacement (preferred) or requires full restart/renegotiation.

**Audit Type:** Read-only. No code modifications.

---

## 1. STREAMING PIPELINE MAP

| Location | File:Line | Role |
|----------|-----------|------|
| **getUserMedia** | WebRTCBroadcaster.jsx:175 | Legacy/alternative path; `requestMediaPermissions()` for permission check only (tracks stopped immediately). **Not used by HostConsole.** |
| **getUserMedia (indirect)** | DailyBroadcaster.jsx:124-127 | Daily SDK handles internally via `call.startCamera({ videoSource: true, audioSource: true })`. No explicit getUserMedia in our code. |
| **Video constraints** | WebRTCBroadcaster.jsx:160-171 | `facingMode: "user"`, `width: { ideal: 1280 }`, `height: { ideal: 720 }`. **DailyBroadcaster does not pass constraints** — uses Daily defaults. |
| **MediaStream/track storage** | DailyBroadcaster.jsx:79-85 | `local?.tracks?.video?.persistentTrack` from `call.participants()`; attached to `localVideoRef.current.srcObject = new MediaStream([track])` |
| **Stream exposure** | DailyBroadcaster.jsx:57, 98-101 | `callObjectRef`, `window.__dailyHostCall = call` — Daily call object exposed globally |
| **Outgoing stream sent** | DailyBroadcaster.jsx:132 | `await call.join({ url: roomUrl, token })` — Daily SDK handles WebRTC internally (addTrack, peer connection, etc.) |
| **RTCRtpSender / replaceTrack** | **N/A** | No direct RTCPeerConnection or RTCRtpSender in our codebase. Daily.co SDK abstracts WebRTC. |
| **Camera permissions** | DailyBroadcaster.jsx:124-127 | Via `call.startCamera()` — Daily requests permissions internally |
| **Camera start** | DailyBroadcaster.jsx:93-136 | `start()`: `call.startCamera()` then `call.join()` |
| **Camera stop** | DailyBroadcaster.jsx:22-47, 141-165 | `window.__stopDailyHost()`: `call.leave()`, `call.destroy()`; HostConsole.jsx:823-829 calls this before End Show |

### Active vs Legacy Paths

| Path | Used By | Status |
|------|---------|--------|
| **DailyBroadcaster** | HostConsole.jsx (mobile: 1201, desktop: 1631) | **ACTIVE** — Host/Seller broadcast |
| **WebRTCBroadcaster** | Not imported by HostConsole | **LEGACY/UNUSED** — separate flow (e.g. SellerShows pre-Daily) |
| **WebRTCViewer** | LiveShow.jsx | Viewer only — no camera |

---

## 2. FLIP FEASIBILITY CONCLUSION

### RTCRtpSender.replaceTrack

**Not present in our pipeline.** We do not use raw WebRTC. The project uses Daily.co SDK (`@daily-co/daily-js@0.58.0`), which owns the peer connection and senders. We have no direct access to RTCRtpSender.

### Daily.co SDK — Preferred Approach

Daily provides `cycleCamera()` for Flip Camera:

```javascript
call.cycleCamera({ preferDifferentFacingMode: true })
```

- **Behavior:** Switches to the next camera, preferring a different facing mode (front ↔ rear).
- **Scope:** Track replacement handled inside Daily; no renegotiation or restart required.
- **Availability:** Call object is at `window.__dailyHostCall` (DailyBroadcaster.jsx:101).

### Feasibility Verdict

**Track replacement via Daily SDK is safe.** Use `window.__dailyHostCall?.cycleCamera({ preferDifferentFacingMode: true })`. No full restart or renegotiation needed.

---

## 3. UI INSERT POINTS

### Host Controls Layout

| Device | Location | File:Line | Controls |
|--------|----------|-----------|----------|
| **Mobile** | Host Controls — Top Right Icons | HostConsole.jsx:1292-1366 | Message, GIVI, Products, Fulfillment, Broadcast (Go Live) |
| **Desktop** | Left Column — Host Tools | HostConsole.jsx:1377-1450 | Broadcast blocked warning, Go Live, End Show, GIVI, Add Product, Recent Orders |

### Flip Button Placement

| Placement | Pros | Cons |
|-----------|------|------|
| **Mobile:** Add to top-right icon stack (after Fulfillment, before Broadcast) | Matches existing pattern | Stack is dense |
| **Mobile:** Inside HostBottomControls | Reuse existing bottom bar | Bottom bar is products/search; camera control is a mid-stream action |
| **Desktop:** Left column, after Go Live / before End Show | Clear and visible | — |
| **Both:** Next to Broadcast / LIVE indicator | Intuitive for camera control | — |

**Recommended:** Add Flip Camera button in the same control area as Broadcast:
- **Mobile:** HostConsole.jsx ~1340 (e.g. after Fulfillment, before Broadcast)
- **Desktop:** HostConsole.jsx ~1410 (after Go Live button, before End Show)

---

## 4. IMPLEMENTATION INSERT POINTS (No Edits Yet)

### A) Flip Action Logic

| File | Insertion Point | Implementation |
|------|-----------------|----------------|
| **HostConsole.jsx** | New handler (e.g. near `startDailyBroadcast` ~679) | `const handleFlipCamera = async () => { try { await window.__dailyHostCall?.cycleCamera({ preferDifferentFacingMode: true }); } catch (e) { console.warn("[HostConsole] cycleCamera failed", e); } };` |
| **Alternative:** DailyBroadcaster.jsx | New prop `onFlipCamera` + expose `cycleCamera` via callback | Pass `() => call.cycleCamera({ preferDifferentFacingMode: true })` to parent |

**Simplest:** Use `window.__dailyHostCall` from HostConsole (same pattern as `__stopDailyHost`). No DailyBroadcaster changes for logic.

### B) UI Button

| File | Line (approx) | Context |
|------|----------------|--------|
| **HostConsole.jsx** | ~1340 | Mobile: Inside `<div className="fixed top-16 right-3 flex flex-col gap-3 z-[200]">`, add Flip button before Broadcast |
| **HostConsole.jsx** | ~1410 | Desktop: Inside left column `<div className="space-y-2">`, add Flip button after Go Live, before End Show |

**Button visibility:** Only when `isAlreadyLive` (camera is active). Use same icon pattern as other controls (e.g. `Camera` or `RefreshCw` from lucide-react).

---

## 5. EVIDENCE — Key Code Snippets

### DailyBroadcaster — Camera Start (Daily SDK)

```javascript
// DailyBroadcaster.jsx:124-133
await call.startCamera({
  videoSource: true,
  audioSource: true,
});

attachLocalPreview(call);
await call.join({ url: roomUrl, token });
```

### Global Call Reference

```javascript
// DailyBroadcaster.jsx:99-101
window.__dailyHostCall = call;
```

### Stop Broadcast (HostConsole)

```javascript
// HostConsole.jsx:823-829
if (window.__stopDailyHost) {
  try {
    await window.__stopDailyHost();
    ...
  } catch (e) { ... }
}
```

### Mobile Host Controls Structure

```javascript
// HostConsole.jsx:1292-1366
<div className="fixed top-16 right-3 flex flex-col gap-3 z-[200]">
  <Button onClick={() => setBottomBarMode("message")} ...>  {/* Message */}
  {FEATURES.givi && <Button ...>  {/* GIVI */}
  <Button onClick={() => setBottomBarMode("products")} ...>  {/* Products */}
  <Button onClick={() => setShowFulfillmentDrawer(true)} ...>  {/* Fulfillment */}
  {isAlreadyLive ? <div ...> : <Button onClick={startDailyBroadcast} ...>}  {/* Broadcast */}
</div>
```

---

## 6. SEARCH QUERY RESULTS SUMMARY

| Query | Matches |
|-------|---------|
| getUserMedia | WebRTCBroadcaster.jsx:175 (legacy) |
| MediaDevices | (via navigator.mediaDevices in WebRTCBroadcaster) |
| enumerateDevices | None |
| facingMode | WebRTCBroadcaster.jsx:166 |
| deviceId | None |
| MediaStreamTrack | None (Daily uses internally) |
| replaceTrack | None |
| RTCPeerConnection | None |
| RTCRtpSender | None |
| addTrack / addTransceiver | None |
| onnegotiationneeded | None |
| setLocalDescription / setRemoteDescription | None |
| videoRef / srcObject | DailyBroadcaster.jsx:85, 171; WebRTCViewer.jsx:78, 337 |
| startBroadcast / startStream | HostConsole: startDailyBroadcast; WebRTCBroadcaster: startStream |
| stopBroadcast | window.__stopDailyHost |
| HostConsole | Uses DailyBroadcaster |
| HostBottomControls | Product bubbles + search; no camera controls |
| WebRTC | DailyBroadcaster, WebRTCViewer, WebRTCBroadcaster |

---

## 7. FINAL SUMMARY

| Question | Answer |
|----------|--------|
| **Active broadcaster for Host** | DailyBroadcaster (Daily.co SDK) |
| **replaceTrack in pipeline?** | No — Daily abstracts WebRTC |
| **Flip via track replacement?** | Yes — via Daily `cycleCamera()` |
| **Full restart needed?** | No |
| **Flip action logic** | HostConsole.jsx ~679: `handleFlipCamera` calling `window.__dailyHostCall?.cycleCamera({ preferDifferentFacingMode: true })` |
| **Flip UI button** | HostConsole.jsx ~1340 (mobile), ~1410 (desktop); only when `isAlreadyLive` |
