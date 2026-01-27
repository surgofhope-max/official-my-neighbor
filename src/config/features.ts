/**
 * Feature Flags Configuration
 * 
 * Controls which features are enabled/disabled at runtime.
 * Set via environment variables (VITE_*).
 */

export const FEATURES = {
  // MVP: GIVI is disabled by default to prevent accidental activation.
  // Enable explicitly by setting: VITE_GIVI_ENABLED=true
  givi: String(import.meta.env.VITE_GIVI_ENABLED || "").toLowerCase() === "true",
};
