import React, { useEffect, useRef, useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { isShowLive } from "@/api/streamSync";
import { AlertCircle, Radio, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// CRITICAL: Must match broadcaster's room URL EXACTLY
const DAILY_ROOM_URL = "https://azlivemarket.daily.co/AZLiveMarket";
const DAILY_ROOM_NAME = "AZLiveMarket";

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("👁️ VIEWER CONFIGURATION");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("📍 DAILY_ROOM_URL:", DAILY_ROOM_URL);
console.log("🏷️ DAILY_ROOM_NAME:", DAILY_ROOM_NAME);
console.log("🔑 API Key Required:", "No (public room)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Load Daily SDK
const loadDailySDK = () => {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.DailyIframe) {
      resolve(window.DailyIframe);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@daily-co/daily-js';
    script.async = true;
    script.onload = () => {
      if (window.DailyIframe) {
        resolve(window.DailyIframe);
      } else {
        reject(new Error('Daily SDK loaded but DailyIframe not found'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Daily SDK'));
    document.head.appendChild(script);
  });
};

export default function WebRTCViewer({ show, onViewerCountChange }) {
  const callObjectRef = useRef(null);
  const containerRef = useRef(null);
  const videoElementRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [sdkLoaded, setSDKLoaded] = useState(false);
  const mountedRef = useRef(true);
  const statusCheckIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const lastStatusCheckRef = useRef(0);

  // CRITICAL: Exponential backoff for reconnection
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 2000; // 2 seconds
  
  // CRITICAL: Rate limiting for status checks - INCREASED to 25s
  const MIN_STATUS_CHECK_INTERVAL = 25000; // 25 seconds minimum between checks

  // Minimal logging - removed verbose console spam

  // Load SDK on mount
  useEffect(() => {
    console.log("🔧 WebRTCViewer: Loading Daily SDK...");
    loadDailySDK()
      .then(() => {
        if (mountedRef.current) {
          console.log("✅ Daily SDK loaded successfully");
          setSDKLoaded(true);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          console.error("❌ Failed to load Daily SDK:", err);
          setError("Failed to load streaming SDK. Please refresh the page.");
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // REMOVED: checkStreamStatus function - no longer needed
  // Parent LiveShow component handles show polling via react-query
  // WebRTCViewer only connects when isShowLive(show) is true

  // AUTHORITATIVE: stream_status === "live" is the ONLY rule for live
  const showIsLive = isShowLive(show);

  // CRITICAL FIX: ONLY start monitoring when stream is actually live
  // DO NOT poll when stream is offline - prevents the glitch loop
  useEffect(() => {
    if (!sdkLoaded || !show) {
      return;
    }

    // AUTHORITATIVE: Only connect when stream_status === "live"
    if (showIsLive && show.stream_url) {
      // Stream is live - connect immediately
      if (!callObjectRef.current) {
        connectToStream(show.stream_url);
      }
    }
    // DO NOT set up polling intervals when stream is not live
    // The parent LiveShow component handles polling the show status

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
        statusCheckIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      disconnectFromStream();
    };
  }, [sdkLoaded, show?.id, showIsLive, show?.stream_url]);

  const connectToStream = async (streamUrl) => {
    if (!mountedRef.current) return;
    
    try {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔗 VIEWER CONNECTING TO STREAM");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📺 Show ID:", show.id);
      console.log("📦 Stream URL from DB:", streamUrl);
      console.log("📍 Expected URL:", DAILY_ROOM_URL);
      console.log("✅ URLs match:", streamUrl === DAILY_ROOM_URL);
      console.log("🏷️ Room Name:", DAILY_ROOM_NAME);
      console.log("🔍 Show is_streaming:", show.is_streaming);
      console.log("🎥 Container exists:", !!containerRef.current);
      
      // CRITICAL: Always use hardcoded room URL to ensure consistency
      const finalRoomUrl = DAILY_ROOM_URL;
      console.log("🎯 Using room URL:", finalRoomUrl);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      setConnectionStatus('connecting');
      setError(null);

      // CRITICAL: Check if already connected to avoid duplicate connections
      if (callObjectRef.current) {
        console.log("⚠️ Already connected - cleaning up old connection first");
        await disconnectFromStream();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL VALIDATION: Container Element
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log("🔍 STEP 1: VALIDATING CONTAINER ELEMENT");
      console.log("   containerRef.current:", containerRef.current);
      console.log("   Is null?", containerRef.current === null);
      console.log("   Is undefined?", containerRef.current === undefined);
      
      if (!containerRef.current) {
        throw new Error("❌ CRITICAL: Video container is NULL - DOM not ready");
      }

      console.log("   ✅ Container exists");
      console.log("   Tag name:", containerRef.current.tagName);
      console.log("   In DOM?", document.body.contains(containerRef.current));
      console.log("   Parent:", containerRef.current.parentElement?.tagName);
      
      const rect = containerRef.current.getBoundingClientRect();
      console.log("   Dimensions:", rect.width, "x", rect.height);
      console.log("   Position:", rect.top, rect.left);
      
      if (rect.width === 0 || rect.height === 0) {
        throw new Error("❌ CRITICAL: Container has zero dimensions");
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL VALIDATION: Daily SDK
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log("🔍 STEP 2: VALIDATING DAILY SDK");
      console.log("   window.DailyIframe:", typeof window.DailyIframe);
      console.log("   Is undefined?", window.DailyIframe === undefined);
      
      if (!window.DailyIframe) {
        throw new Error("❌ CRITICAL: Daily SDK not loaded - window.DailyIframe is undefined");
      }
      
      console.log("   ✅ Daily SDK loaded");
      console.log("   createFrame method:", typeof window.DailyIframe.createFrame);
      
      if (typeof window.DailyIframe.createFrame !== 'function') {
        throw new Error("❌ CRITICAL: createFrame is not a function");
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CREATING DAILY IFRAME
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🎬 STEP 3: CREATING DAILY IFRAME");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("   Room URL:", DAILY_ROOM_URL);
      console.log("   Room Name:", DAILY_ROOM_NAME);
      console.log("   Container:", containerRef.current.tagName);
      console.log("   Mode: IFRAME with URL (auto pre-join)");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const createFrameOptions = {
        url: DAILY_ROOM_URL,
        userName: `Viewer_${Date.now()}`,
        iframeStyle: {
          position: 'absolute',
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '0'
        },
        showLeaveButton: false,
        showFullscreenButton: false
      };

      console.log("   Options:", JSON.stringify(createFrameOptions, null, 2));
      console.log("   Calling createFrame()...");

      try {
        callObjectRef.current = window.DailyIframe.createFrame(
          containerRef.current,
          createFrameOptions
        );
      } catch (createError) {
        console.error("❌ createFrame() threw error:", createError);
        throw new Error(`createFrame failed: ${createError.message}`);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // VALIDATE FRAME CREATION
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log("🔍 STEP 4: VALIDATING FRAME CREATION");
      console.log("   callObjectRef.current:", callObjectRef.current);
      console.log("   Is null?", callObjectRef.current === null);
      console.log("   Is undefined?", callObjectRef.current === undefined);
      console.log("   Type:", typeof callObjectRef.current);
      
      if (!callObjectRef.current) {
        throw new Error("❌ CRITICAL: createFrame() returned null/undefined");
      }

      console.log("   ✅ Frame created successfully");
      console.log("   Has join method?", typeof callObjectRef.current.join === 'function');
      console.log("   Has on method?", typeof callObjectRef.current.on === 'function');
      console.log("   Has participants method?", typeof callObjectRef.current.participants === 'function');

      // Check if iframe was actually inserted into DOM
      const iframe = containerRef.current.querySelector('iframe');
      console.log("   Iframe in DOM?", !!iframe);
      if (iframe) {
        console.log("   Iframe src:", iframe.src);
        console.log("   Iframe dimensions:", iframe.offsetWidth, "x", iframe.offsetHeight);
      } else {
        console.warn("⚠️ WARNING: No iframe found in container after createFrame()");
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ DAILY IFRAME SETUP COMPLETE");
      console.log("   Pre-join UI should now be visible");
      console.log("   User should see: Camera preview + Join Now button");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Setup event listeners for when user clicks Join Now
      console.log("🔊 Setting up event listeners for pre-join flow...");
      callObjectRef.current
        .on('loading', () => {
          console.log("⏳ [Viewer] Daily iframe loading pre-join UI...");
        })
        .on('loaded', () => {
          console.log("✅ [Viewer] Pre-join UI loaded - waiting for user to click Join");
        })
        .on('joined-meeting', () => {
          if (!mountedRef.current) return;
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log("✅ VIEWER JOINED (USER CLICKED JOIN NOW)");
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;

          const participants = callObjectRef.current.participants();
          console.log("👥 Participants in room:", Object.keys(participants).length);
          Object.values(participants).forEach(p => {
            console.log(`   - ${p.user_name} (${p.local ? 'LOCAL' : 'REMOTE'})`, {
              video: p.video,
              audio: p.audio,
              tracks: p.tracks ? Object.keys(p.tracks) : []
            });
          });
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        })
        .on('left-meeting', () => {
          if (!mountedRef.current) return;
          console.log("👋 [Viewer] Left meeting");
          setConnectionStatus('disconnected');
        })
        .on('error', (e) => {
          if (!mountedRef.current) return;
          console.error("❌ [Viewer] Daily error:", e);
          setError(`Connection error: ${e.errorMsg || 'Unknown error'}`);
          setConnectionStatus('error');
        })
        .on('participant-joined', (e) => {
          console.log("👤 [Viewer] Participant joined:", e.participant.user_name);
        })
        .on('track-started', (e) => {
          console.log("🎥 [Viewer] Track started:", e.track.kind, "from", e.participant?.user_name);
        });

      console.log("✅ Iframe created with pre-join UI - NO programmatic join() call");
      console.log("🎯 Buyer will see Daily's Join Now screen and must click to join");

    } catch (error) {
      if (!mountedRef.current) return;
      
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("❌ Failed to connect to stream:", error);
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      if (error.message?.toLowerCase().includes('rate limit')) {
        setError("Connection rate limit reached. Retrying in a moment...");
        
        // EXPONENTIAL BACKOFF for reconnection
        reconnectAttemptsRef.current++;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
          30000
        );
        
        console.log(`⏰ Retry connection in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connectToStream(streamUrl);
            }
          }, delay);
        } else {
          setError("Unable to connect after multiple attempts. Please refresh the page.");
        }
      } else {
        setError(`Failed to connect: ${error.message}`);
        setConnectionStatus('error');
      }
    }
  };

  const disconnectFromStream = async () => {
    if (callObjectRef.current) {
      try {
        console.log("🔌 Disconnecting from Daily.co stream");
        await callObjectRef.current.leave();
        await callObjectRef.current.destroy();
        callObjectRef.current = null;
        console.log("✅ Disconnected successfully");
      } catch (error) {
        console.error("⚠️ Error during disconnect:", error);
        callObjectRef.current = null;
      }
    }
  };

  // Loading state
  if (!sdkLoaded) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading stream player...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
        <Alert className="max-w-md bg-red-500/20 border-red-500">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <AlertDescription className="text-white">
            {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // FIXED: Waiting for stream - FULL-SCREEN PREVIEW VIDEO
  // AUTHORITATIVE: stream_status === "live" is the only rule for live
  if (!show || !showIsLive) {
    // Minimal log to avoid spam
    
    // CRITICAL: If show is undefined, show loading state instead of "Waiting for Stream"
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

    return (
      <div className="w-full h-full bg-gradient-to-br from-purple-900 via-blue-900 to-gray-900 flex items-center justify-center">
        {/* CRITICAL FIX: Full-screen video preview OR thumbnail OR gradient fallback */}
        <div className="absolute inset-0">
          {show.video_preview_url ? (
            // PRIORITY 1: Full-screen video preview
            <video
              src={show.video_preview_url}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              onLoadedData={() => console.log("✅ PREVIEW VIDEO LOADED:", show.video_preview_url)}
              onError={(e) => console.error("❌ PREVIEW VIDEO ERROR:", e, "URL:", show.video_preview_url)}
            />
          ) : show.thumbnail_url ? (
            // PRIORITY 2: Show thumbnail image
            <img
              src={show.thumbnail_url}
              alt={show.title}
              className="w-full h-full object-cover"
              onLoad={() => console.log("✅ THUMBNAIL LOADED:", show.thumbnail_url)}
              onError={() => console.error("❌ THUMBNAIL ERROR:", show.thumbnail_url)}
            />
          ) : (
            // PRIORITY 3: Gradient background fallback
            <div className="w-full h-full bg-gradient-to-br from-purple-900 via-blue-900 to-gray-900"></div>
          )}
          
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
        </div>

        {/* Overlay text content */}
        <div className="relative z-10 text-center">
          <Clock className="w-16 h-16 text-white/60 mx-auto mb-4 animate-pulse" />
          <h3 className="text-2xl font-bold text-white mb-2">Waiting for Stream</h3>
          <p className="text-white/80">The host will start streaming shortly...</p>
        </div>
      </div>
    );
  }

  // Stream container
  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-black"
    >
      {connectionStatus === 'connecting' && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-white text-lg">Connecting to stream...</p>
            <p className="text-white/60 text-sm mt-2">
              {reconnectAttemptsRef.current > 0 && `Retry attempt ${reconnectAttemptsRef.current}`}
            </p>
          </div>
        </div>
      )}

      {connectionStatus === 'connected' && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-red-500/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="text-white text-sm font-medium">LIVE</span>
          </div>
        </div>
      )}
    </div>
  );
}