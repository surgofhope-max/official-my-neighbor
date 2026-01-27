import { useEffect, useRef } from "react";

// Module-level ref for clearing preview from global stop function
let _localVideoRef = null;

// Helper: Clear local preview element (detach only, never stop tracks)
function clearLocalPreview() {
  try {
    const el = _localVideoRef?.current;
    if (!el) return;
    
    // IMPORTANT:
    // Never stop Daily-managed tracks here.
    // Daily owns the camera lifecycle via call.leave() / call.destroy().
    // We only detach the preview element.
    el.srcObject = null;
  } catch {}
}

// Global imperative stop function for HostConsole to call before navigation
// Safe to call multiple times; idempotent
window.__stopDailyHost = async () => {
  const call = window.__dailyHostCall;
  if (!call) return;
  
  console.log("[DailyBroadcaster] __stopDailyHost called - stopping broadcast");
  window.__dailyHostCall = null;
  
  // Clear preview BEFORE leave/destroy
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
  
  // Clear preview AFTER leave/destroy (idempotent safety)
  clearLocalPreview();
  
  console.log("[DailyBroadcaster] __stopDailyHost complete - camera released");
};

/**
 * DailyBroadcaster - Host/Seller video broadcast component
 * 
 * @param {string} roomUrl - Daily room URL
 * @param {string} token - Daily meeting token (host)
 * @param {function} onViewerCountChange - MVP PHASE-1: Callback for live viewer count updates (UI-only)
 */
export default function DailyBroadcaster({ roomUrl, token, onViewerCountChange }) {
  const callObjectRef = useRef(null);
  const localVideoRef = useRef(null);
  
  // Expose ref to module-level for global stop function
  _localVideoRef = localVideoRef;

  useEffect(() => {
    let cancelled = false;

    async function ensureDailyScript() {
      if (window.DailyIframe) return;
      const script = document.createElement("script");
      script.src = "https://unpkg.com/@daily-co/daily-js@0.58.0";
      script.async = true;
      document.body.appendChild(script);
      await new Promise((res, rej) => {
        script.onload = res;
        script.onerror = rej;
      });
    }

    function attachLocalPreview(call) {
      try {
        const parts = call.participants?.() || {};
        const local = parts.local;
        const track = local?.tracks?.video?.persistentTrack || null;
        if (track && localVideoRef.current) {
          localVideoRef.current.srcObject = new MediaStream([track]);
          localVideoRef.current.play?.().catch(() => {});
        }
      } catch (e) {
        console.warn("[DailyBroadcaster] Failed to attach local preview", e);
      }
    }

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

      // ═══════════════════════════════════════════════════════════════════════
      // MVP PHASE-1: UI-only viewer count from Daily SDK (no backend writes)
      // Mirrors buyer-side behavior in WebRTCViewer.jsx
      // ═══════════════════════════════════════════════════════════════════════
      call.on("participant-counts-updated", (event) => {
        const count = event?.participantCounts?.present;
        if (typeof count === "number" && onViewerCountChange) {
          console.log("[DailyBroadcaster] Participant count:", count);
          onViewerCountChange(count);
        }
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

    start().catch((err) => {
      console.error("[DailyBroadcaster] start failed", err);
    });

    return () => {
      cancelled = true;
      const call = callObjectRef.current;
      callObjectRef.current = null;
      
      // Clear global reference if it matches this instance
      if (window.__dailyHostCall === call) {
        window.__dailyHostCall = null;
      }
      
      // Clear preview BEFORE leave/destroy
      clearLocalPreview();
      
      if (call) {
        try {
          call.leave();
        } catch {}
        try {
          call.destroy();
        } catch {}
      }
      
      // Clear preview AFTER leave/destroy (idempotent safety)
      clearLocalPreview();
    };
  }, [roomUrl, token, onViewerCountChange]);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center">
      <video
        ref={localVideoRef}
        className="w-full h-full object-cover"
        muted
        playsInline
        autoPlay
      />
    </div>
  );
}
