/**
 * useDeviceClass - React hook for device-locked classification
 * 
 * CRITICAL: This hook computes device class ONCE on first render and
 * NEVER updates. This ensures SDKs don't remount on rotation/resize.
 * 
 * Usage:
 *   const { isMobileDevice, isDesktopDevice, deviceClass, reason } = useDeviceClass();
 *   
 *   {isMobileDevice && <MobileLayout />}
 *   {isDesktopDevice && <DesktopLayout />}
 */

import { useState } from "react";
import { detectDeviceClass } from "@/lib/deviceClass";

export function useDeviceClass() {
  // Compute ONCE on first render, NEVER update
  // Using lazy initializer to ensure it only runs once
  const [classification] = useState(() => {
    const result = detectDeviceClass();
    
    // Log for debugging (remove in production if noisy)
    if (typeof window !== 'undefined') {
      console.log("[useDeviceClass] Device classification locked:", result);
    }
    
    return result;
  });

  return {
    deviceClass: classification.deviceClass,
    isMobileDevice: classification.deviceClass === "mobile",
    isDesktopDevice: classification.deviceClass === "desktop",
    reason: classification.reason
  };
}
