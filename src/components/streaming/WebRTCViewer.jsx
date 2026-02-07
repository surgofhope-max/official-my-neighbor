import React, { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { isShowLive } from "@/api/streamSync";
import { AlertCircle, Radio, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * WebRTCViewer - Daily.co HEADLESS viewer component (NO Prebuilt iframe)
 * 
 * BROADCAST MODE (receive-only):
 * - Fetches viewer token via daily-join-room edge function
 * - Uses Daily call object (NOT iframe) - NEVER requests camera/mic
 * - Only subscribes to and renders remote tracks from host
 * - Per-show room isolation (no hardcoded shared room)
 */

// Load Daily SDK from CDN (only once)
const loadDailySDK = () => {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (window.DailyIframe) {
      console.log("[WebRTCViewer] Daily SDK already loaded");
      resolve(true);
      return;
    }

    // Check if script is already injected
    if (document.getElementById("daily-js-sdk")) {
      // Wait for it to load
      const checkLoaded = setInterval(() => {
        if (window.DailyIframe) {
          clearInterval(checkLoaded);
          resolve(true);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkLoaded);
        reject(new Error("Daily SDK load timeout"));
      }, 10000);
      return;
    }

    // Inject script
    const script = document.createElement("script");
    script.id = "daily-js-sdk";
    script.src = "https://unpkg.com/@daily-co/daily-js@0.58.0";
    script.async = true;

    script.onload = () => {
      console.log("[WebRTCViewer] Daily SDK script loaded, waiting for init...");
      let attempts = 0;
      const maxAttempts = 50;
      
      const checkDaily = () => {
        attempts++;
        if (window.DailyIframe && typeof window.DailyIframe.createCallObject === "function") {
          console.log("[WebRTCViewer] Daily SDK initialized");
          resolve(true);
        } else if (attempts >= maxAttempts) {
          reject(new Error("Daily SDK init timeout"));
        } else {
          setTimeout(checkDaily, 100);
        }
      };
      checkDaily();
    };

    script.onerror = () => {
      reject(new Error("Failed to load Daily SDK"));
    };

    document.head.appendChild(script);
  });
};

export default function WebRTCViewer({ show, onViewerCountChange }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const callObjectRef = useRef(null);
  const mountedRef = useRef(true);
  const joiningRef = useRef(false);
  
  // Viewer room state (fetched from daily-join-room)
  const [viewerRoomUrl, setViewerRoomUrl] = useState(null);
  const [viewerToken, setViewerToken] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('initializing');
  const [isJoined, setIsJoined] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  
  // Track if we've attempted to join this show
  const joinAttemptedRef = useRef(false);

  // Helper: Stop tracks on a MediaStream and clear srcObject
  const clearMediaElement = (ref) => {
    try {
      const el = ref?.current;
      if (!el) return;
      const stream = el.srcObject;
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      }
      el.srcObject = null;
    } catch {}
  };

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      
      // Clear video/audio srcObject and stop tracks
      clearMediaElement(videoRef);
      clearMediaElement(audioRef);
      
      // Cleanup call object
      if (callObjectRef.current) {
        console.log("[WebRTCViewer] Cleanup: leaving and destroying call");
        try {
          callObjectRef.current.leave();
          callObjectRef.current.destroy();
        } catch (e) {
          console.warn("[WebRTCViewer] Cleanup error:", e);
        }
        callObjectRef.current = null;
      }
      joiningRef.current = false;
    };
  }, []);

  // AUTHORITATIVE: stream_status === "live" is the ONLY rule for live
  const showIsLive = isShowLive(show);

  // Fetch viewer token when show is live
  useEffect(() => {
    if (!show?.id) return;
    
    // Only attempt if show is live and we haven't tried yet for this show
    if (showIsLive && !joinAttemptedRef.current && !viewerToken) {
      fetchViewerToken();
    }
    
    // Reset when show changes
    return () => {
      joinAttemptedRef.current = false;
    };
  }, [show?.id, showIsLive]);

  const fetchViewerToken = async () => {
    if (!show?.id || !mountedRef.current) return;
    
    joinAttemptedRef.current = true;
    setIsLoading(true);
    setJoinError(null);
    
    console.log("[WebRTCViewer] Fetching viewer token for show:", show.id);
    
    try {
      const { data, error } = await supabase.functions.invoke("daily-join-room", {
        body: { show_id: show.id }
      });

      console.log("[WebRTCViewer][DAILY-JOIN][DEBUG] invoke result:", {
        sent_show_id: show?.id,
        hasData: !!data,
        hasError: !!error,
      });

      if (error?.context) {
        try {
          const clone = error.context.clone();
          const text = await clone.text();
          console.log("[WebRTCViewer][DAILY-JOIN][DEBUG] error.context body:", text);
        } catch (e) {
          // ignore
        }
      }
      
      if (!mountedRef.current) return;
      
      if (error) {
        console.error("[WebRTCViewer] Edge function error:", error);
        setJoinError(error.message || "Failed to join stream");
        setIsLoading(false);
        return;
      }
      
      if (data?.error) {
        console.log("[WebRTCViewer] Server returned error:", data.error);
        
        if (data.error === "show-not-live") {
          setJoinError("waiting");
        } else {
          setJoinError(data.error);
        }
        setIsLoading(false);
        return;
      }
      
      if (!data?.room_url || !data?.token) {
        console.error("[WebRTCViewer] Invalid response:", data);
        setJoinError("Invalid stream response");
        setIsLoading(false);
        return;
      }
      
      console.log("[WebRTCViewer] Got viewer token for room:", data.room_name);
      setViewerRoomUrl(data.room_url);
      setViewerToken(data.token);
      setConnectionStatus('ready');
      setIsLoading(false);
      
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("[WebRTCViewer] Fetch error:", err);
      setJoinError(err?.message || "Failed to connect");
      setIsLoading(false);
    }
  };

  // Join Daily room using headless call object (NO DEVICE ACCESS)
  const joinDailyRoom = useCallback(async () => {
    // CRITICAL: Synchronous lock to prevent duplicate join attempts
    if (joiningRef.current) {
      console.log("[WebRTCViewer] Join already in progress, skipping");
      return;
    }
    joiningRef.current = true;

    if (!viewerRoomUrl || !viewerToken || !mountedRef.current) {
      joiningRef.current = false;
      return;
    }
    if (callObjectRef.current) {
      console.log("[WebRTCViewer] Already have call object, skipping");
      joiningRef.current = false;
      return;
    }

    console.log("[WebRTCViewer] Starting headless Daily join...");
    setConnectionStatus('joining');

    try {
      // Load SDK
      await loadDailySDK();
      
      if (!mountedRef.current) return;

      // Create headless call object (NO iframe, NO device prompts)
      console.log("[WebRTCViewer] Creating headless call object...");
      const call = window.DailyIframe.createCallObject({
        // CRITICAL: Auto-subscribe to remote tracks (required for track-started events)
        subscribeToTracksAutomatically: true,
        // CRITICAL: Disable all local device access
        audioSource: false,
        videoSource: false,
        dailyConfig: {
          // Prevent any device enumeration
          avoidEval: true,
        }
      });

      callObjectRef.current = call;

      // CRITICAL: Force local devices OFF before joining
      call.setLocalAudio(false);
      call.setLocalVideo(false);

      // Additional safeguard: disable input devices if API available
      if (typeof call.updateInputSettings === 'function') {
        try {
          await call.updateInputSettings({ audio: false, video: false });
        } catch (e) {
          console.log("[WebRTCViewer] updateInputSettings not supported:", e.message);
        }
      }

      // Event handlers
      call.on("joined-meeting", (event) => {
        console.log("[WebRTCViewer] ✅ Joined meeting as viewer");
        if (mountedRef.current) {
          setIsJoined(true);
          setConnectionStatus('connected');
        }
        
        // Force devices off again after join
        call.setLocalAudio(false);
        call.setLocalVideo(false);
      });

      call.on("left-meeting", () => {
        console.log("[WebRTCViewer] Left meeting");
        if (mountedRef.current) {
          setIsJoined(false);
          setHasRemoteVideo(false);
        }
      });

      call.on("error", (event) => {
        console.error("[WebRTCViewer] Daily error:", event);
        if (mountedRef.current) {
          setJoinError(event?.errorMsg || "Stream error");
        }
      });

      call.on("participant-joined", (event) => {
        console.log("[WebRTCViewer] Participant joined:", event.participant?.user_id);
      });

      call.on("participant-left", (event) => {
        console.log("[WebRTCViewer] Participant left:", event.participant?.user_id);
      });

      // Handle remote tracks (this is where we receive the host's video/audio)
      call.on("track-started", (event) => {
        const { track, participant } = event;
        
        // Only process remote tracks (not local)
        if (participant?.local) {
          console.log("[WebRTCViewer] Ignoring local track");
          return;
        }

        console.log("[WebRTCViewer] 🎬 Remote track started:", {
          kind: track?.kind,
          participantId: participant?.user_id,
          isOwner: participant?.owner,
        });

        if (track?.kind === "video") {
          // Attach video track to video element
          if (videoRef.current) {
            const stream = new MediaStream([track]);
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => {
              console.warn("[WebRTCViewer] Video autoplay blocked:", e);
            });
            setHasRemoteVideo(true);
            console.log("[WebRTCViewer] ✅ Remote video attached");
          }
        } else if (track?.kind === "audio") {
          // Attach audio track to audio element
          if (audioRef.current) {
            const stream = new MediaStream([track]);
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(e => {
              console.warn("[WebRTCViewer] Audio autoplay blocked:", e);
            });
            console.log("[WebRTCViewer] ✅ Remote audio attached");
          }
        }
      });

      call.on("track-stopped", (event) => {
        const { track, participant } = event;
        if (participant?.local) return;
        
        console.log("[WebRTCViewer] Remote track stopped:", track?.kind);
        
        if (track?.kind === "video") {
          setHasRemoteVideo(false);
        }
      });

      call.on("participant-counts-updated", (event) => {
        console.log("[WebRTCViewer] Participant count:", event?.participantCounts);
        if (onViewerCountChange && event?.participantCounts?.present) {
          onViewerCountChange(event.participantCounts.present);
        }
      });

      // JOIN the room (receive-only, no device access)
      console.log("[WebRTCViewer] Joining room:", viewerRoomUrl);
      await call.join({
        url: viewerRoomUrl,
        token: viewerToken,
        // CRITICAL: Explicitly disable sending
        videoSource: false,
        audioSource: false,
        startVideoOff: true,
        startAudioOff: true,
      });

      console.log("[WebRTCViewer] ✅ Join call completed");

    } catch (err) {
      console.error("[WebRTCViewer] Join error:", err);
      if (mountedRef.current) {
        setJoinError(err?.message || "Failed to join stream");
        setConnectionStatus('error');
      }
    } finally {
      joiningRef.current = false;
    }
  }, [viewerRoomUrl, viewerToken, onViewerCountChange]);

  // Auto-join when we have credentials
  useEffect(() => {
    if (viewerRoomUrl && viewerToken && !isJoined && !callObjectRef.current) {
      joinDailyRoom();
    }
  }, [viewerRoomUrl, viewerToken, isJoined, joinDailyRoom]);

  // Retry fetching token
  const retryFetch = () => {
    joinAttemptedRef.current = false;
    setJoinError(null);
    setIsJoined(false);
    setHasRemoteVideo(false);
    
    // Clear video/audio srcObject and stop tracks
    clearMediaElement(videoRef);
    clearMediaElement(audioRef);
    
    if (callObjectRef.current) {
      try {
        callObjectRef.current.leave();
        callObjectRef.current.destroy();
      } catch (e) {}
      callObjectRef.current = null;
    }
    joiningRef.current = false;
    fetchViewerToken();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Connecting to stream...</p>
        </div>
      </div>
    );
  }

  // Show is not defined yet
  if (!show) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  // Waiting for stream (show not live or special waiting error)
  if (!showIsLive || joinError === "waiting") {
    return (
      <div className="w-full h-full bg-gradient-to-br from-purple-900 via-blue-900 to-gray-900 flex items-center justify-center">
        {/* Background: video preview or thumbnail */}
        <div className="absolute inset-0">
          {show.preview_video_url ? (
            <video
              src={show.preview_video_url}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            />
          ) : show.thumbnail_url ? (
            <img
              src={show.thumbnail_url}
              alt={show.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-900 via-blue-900 to-gray-900"></div>
          )}
          
          {/* Dark gradient overlay - pointer-events-none to allow video interaction */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none"></div>
        </div>

        {/* Overlay text */}
        <div className="relative z-10 text-center">
          <Clock className="w-16 h-16 text-white/60 mx-auto mb-4 animate-pulse" />
          <h3 className="text-2xl font-bold text-white mb-2">Waiting for Stream</h3>
          <p className="text-white/80">The host will start streaming shortly...</p>
          {joinError === "waiting" && (
            <button
              onClick={retryFetch}
              className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              Check Again
            </button>
          )}
        </div>
      </div>
    );
  }

  // Error state (non-waiting errors)
  if (joinError && joinError !== "waiting") {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
        <div className="text-center">
          <Alert className="max-w-md bg-red-500/20 border-red-500">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <AlertDescription className="text-white">
              {joinError}
            </AlertDescription>
          </Alert>
          <button
            onClick={retryFetch}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Joining state
  if (connectionStatus === 'joining' || (viewerRoomUrl && viewerToken && !isJoined)) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Joining stream...</p>
        </div>
      </div>
    );
  }

  // BROADCAST MODE: Headless viewer - renders remote video/audio directly
  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-black relative"
    >
      {/* Remote Video - Full screen */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="absolute inset-0 w-full h-full object-cover bg-black"
        style={{ zIndex: 10 }}
      />
      
      {/* Remote Audio (hidden element for audio playback) */}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />
      
      {/* No video placeholder */}
      {!hasRemoteVideo && isJoined && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black z-5">
          <div className="text-center">
            <Radio className="w-16 h-16 text-white/40 mx-auto mb-4 animate-pulse" />
            <p className="text-white/60">Waiting for host video...</p>
          </div>
        </div>
      )}
      
      {/* LIVE indicator REMOVED - LiveShow header already shows LIVE badge based on DB status */}
    </div>
  );
}
