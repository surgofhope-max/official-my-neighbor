import { useEffect } from "react";

/**
 * useMobilePortraitLock - Locks mobile devices to portrait orientation
 * 
 * This hook uses the Screen Orientation API to lock the display to portrait
 * mode on mobile devices. It does NOT affect device classification or layout
 * logic — it simply prevents the OS from rotating the screen.
 * 
 * - Only activates when isMobileDevice is true
 * - Fails silently if orientation lock is not supported (most browsers)
 * - Unlocks orientation on unmount
 * 
 * @param {boolean} isMobileDevice - From useDeviceClass hook
 */
export function useMobilePortraitLock(isMobileDevice) {
  useEffect(() => {
    if (!isMobileDevice) return;

    const lock = async () => {
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("portrait");
        }
      } catch (err) {
        // Orientation lock not supported or denied — fail silently
        // This is expected on most browsers (only works in fullscreen PWA mode)
      }
    };

    lock();

    return () => {
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (err) {
        // Ignore unlock errors
      }
    };
  }, [isMobileDevice]);
}
