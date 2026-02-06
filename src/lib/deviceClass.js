/**
 * Device Classification - Single Source of Truth
 * 
 * CRITICAL: This module provides DEVICE-BASED classification that does NOT
 * change on rotation or resize. It determines device type ONCE based on
 * hardware characteristics, not viewport dimensions.
 * 
 * This prevents SDKs (DailyBroadcaster, WebRTCViewer, SupabaseLiveChat)
 * from remounting during orientation changes.
 */

/**
 * Detects device class based on hardware characteristics.
 * Returns a stable classification that will NOT change during the session.
 * 
 * @returns {{ deviceClass: "mobile"|"desktop", reason: string }}
 */
export function detectDeviceClass() {
  // SSR safety
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { deviceClass: "desktop", reason: "SSR/no-window fallback" };
  }

  // Method 1: Modern User-Agent Client Hints API (most reliable)
  if (navigator.userAgentData?.mobile !== undefined) {
    const isMobile = navigator.userAgentData.mobile;
    return {
      deviceClass: isMobile ? "mobile" : "desktop",
      reason: `userAgentData.mobile=${isMobile}`
    };
  }

  // Method 2: User-Agent string regex (fallback for older browsers)
  const ua = navigator.userAgent || "";
  const mobileUARegex = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i;
  if (mobileUARegex.test(ua)) {
    return {
      deviceClass: "mobile",
      reason: `UA regex matched: ${ua.substring(0, 50)}...`
    };
  }

  // Method 3: Touch + small physical screen (catches tablets and edge cases)
  // Uses screen.width/height which are PHYSICAL dimensions, not viewport
  if (typeof screen !== 'undefined' && navigator.maxTouchPoints > 0) {
    const minScreenDimension = Math.min(screen.width, screen.height);
    if (minScreenDimension <= 900) {
      return {
        deviceClass: "mobile",
        reason: `touch device with small screen (${minScreenDimension}px min dimension, ${navigator.maxTouchPoints} touch points)`
      };
    }
  }

  // Default: Desktop
  return {
    deviceClass: "desktop",
    reason: "no mobile indicators detected"
  };
}
