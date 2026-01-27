# Mobile Parity Verification Checklist

> **Pre-Deploy QA Checklist for Live Show Viewer Experience**
> 
> Last Updated: January 2026

---

## 1. Devices / Browsers to Test

### Required (Minimum)

| Device | Browser | Priority | Notes |
|--------|---------|----------|-------|
| iPhone (notch device) | Safari | **P0** | Test safe-area, audio autoplay policy |
| Android phone | Chrome | **P0** | Test WebRTC compatibility |
| Desktop | Chrome DevTools (responsive) | P1 | Backup only — not a substitute for real devices |

### Optional (Extended Coverage)

- iPad Safari (landscape + portrait)
- Samsung Internet Browser
- Firefox Mobile (Android)

---

## 2. Streaming Verification (Daily.co)

### Test Scenarios

- [ ] **Join BEFORE host starts streaming**
  - Expected: "Waiting for Stream" UI with thumbnail/preview
  - Verify: No camera/mic permission prompts
  - Verify: "Check Again" button works

- [ ] **Join AFTER host starts streaming**
  - Expected: Video appears within 3-5 seconds
  - Verify: Audio is audible (or tap-to-unmute if autoplay blocked)
  - Verify: No duplicate audio tracks (echo)

- [ ] **Host ends show while viewer is watching**
  - Expected: Graceful transition to "Show Ended" state or redirect
  - Verify: No infinite reconnect loop
  - Verify: No console errors flooding

- [ ] **Reconnection behavior**
  - Expected: If network drops briefly, viewer should auto-reconnect
  - Verify: No "Duplicate DailyIframe instances" errors

### Video Quality Checks

- [ ] Video is **full-bleed** (edge-to-edge, no letterboxing unless aspect ratio differs)
- [ ] Video uses `object-cover` (fills container, may crop)
- [ ] No black bars on sides (unless host camera aspect differs)
- [ ] Video does not appear "boxed" or shrunk

---

## 3. iOS Audio Policy Checks

### Safari Autoplay Behavior

iOS Safari blocks autoplay of audio/video with sound until user interaction.

- [ ] **First load**: Audio may be silent
- [ ] **After first tap anywhere on page**: Audio should start playing
- [ ] **Verify**: No need for separate "unmute" button (audio element should play after interaction)

### Expected Behavior

| Scenario | Expected |
|----------|----------|
| Page loads, no user tap yet | Video plays, audio silent |
| User taps anywhere | Audio begins playing |
| User refreshes page | Same behavior (silent until tap) |

### If Audio Issues Persist

- Check console for `NotAllowedError: play() request was interrupted`
- Verify `<audio>` element has `autoPlay` and `playsInline` attributes
- Verify no `muted` attribute on audio element

---

## 4. UI Overlay Verification (Mobile)

### Safe-Area Compliance

- [ ] **Header**: Not hidden under notch or status bar
  - Check: Top padding accounts for `env(safe-area-inset-top)`
  - Visual: LIVE badge and back button fully visible

- [ ] **Bottom Action Bar**: Not overlapping home indicator
  - Check: Bottom padding accounts for `env(safe-area-inset-bottom)`
  - Visual: Chat input and share button fully tappable

### Z-Index Stacking (Expected Order)

| Layer | Z-Index | Element |
|-------|---------|---------|
| 1 | `z-0` | Video container |
| 2 | `z-10` | Video element |
| 3 | `z-40` | Share/Follow buttons |
| 4 | `z-50` | Header (LIVE badge) |
| 5 | `z-[90]` | Product carousel |
| 6 | `z-[100]` | Product detail card |
| 7 | `z-[100]` | Bottom action bar |
| 8 | `z-[200]` | Checkout overlay |

### Overlap Checks

- [ ] **Product carousel** does NOT overlap chat input field
- [ ] **Expanded product card** does NOT overlap carousel + input simultaneously
- [ ] **Checkout overlay** appears ABOVE all other elements
- [ ] **GIVI overlay** (if active) does not block critical UI

### Tap Target Verification

- [ ] Back button (header) is tappable
- [ ] LIVE badge is visible (not cut off)
- [ ] Product thumbnails are tappable
- [ ] "BUY NOW" button is tappable
- [ ] Chat input field is tappable and opens keyboard
- [ ] Share button is tappable

---

## 5. Regression Safety

### WebRTCViewer Mount Verification

- [ ] Open browser console before joining show
- [ ] Search for `[WebRTCViewer]` logs
- [ ] **PASS**: Only ONE set of initialization logs:
  ```
  [WebRTCViewer] Starting headless Daily join...
  [WebRTCViewer] Creating headless call object...
  [WebRTCViewer] ✅ Joined meeting as viewer
  ```
- [ ] **FAIL**: Multiple "Creating headless call object" logs = duplicate mount

### LIVE Badge Consistency

- [ ] LIVE badge appears ONLY when `show.stream_status === "live"` in database
- [ ] LIVE badge does NOT appear based on WebRTC connection state alone
- [ ] When host ends show, LIVE badge disappears (after DB update propagates)

### Console Error Checks

- [ ] No `Duplicate DailyIframe instances are not allowed` errors
- [ ] No `getUserMedia` or camera/mic permission errors on viewer
- [ ] No infinite `track-started` / `track-stopped` loops
- [ ] No 404 errors related to Daily SDK

---

## 6. Quick Smoke Test Script

```
1. Open LiveShow on iPhone Safari
2. Wait for "Waiting for Stream" UI
3. Have host start streaming
4. Verify video appears full-bleed
5. Tap screen once
6. Verify audio is playing
7. Tap a product thumbnail
8. Verify product detail card appears
9. Tap "BUY NOW"
10. Verify checkout overlay appears (z-[200])
11. Close checkout
12. Have host end show
13. Verify graceful end state (no crash/loop)
```

---

## 7. Known Issues / Workarounds

| Issue | Workaround | Status |
|-------|------------|--------|
| iOS audio silent on first load | User must tap screen | Expected behavior |
| Notch overlap on some devices | Need to add safe-area padding | TODO |
| Bottom bar overlap on iPhone X+ | Need to add safe-area padding | TODO |

---

## Sign-Off

| Tester | Device | Date | Pass/Fail | Notes |
|--------|--------|------|-----------|-------|
| | | | | |
| | | | | |






