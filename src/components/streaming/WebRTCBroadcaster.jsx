import React, { useState, useRef, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Video, VideoOff, Mic, MicOff, Radio, AlertCircle, Camera, Clapperboard, CheckCircle } from "lucide-react";

// PRE-CONFIGURED DAILY ROOM (NO API KEY NEEDED - PUBLIC ROOM)
const DAILY_ROOM_URL = "https://azlivemarket.daily.co/AZLiveMarket";
const DAILY_ROOM_NAME = "AZLiveMarket";

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🔧 BROADCASTER CONFIGURATION");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("📍 DAILY_ROOM_URL:", DAILY_ROOM_URL);
console.log("🏷️ DAILY_ROOM_NAME:", DAILY_ROOM_NAME);
console.log("🔑 API Key Required:", "No (public room)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Load Daily.co SDK from CDN with WebView compatibility
const loadDailySDK = () => {
  return new Promise((resolve, reject) => {
    if (window.DailyIframe) {
      console.log("✅ Daily SDK already loaded");
      resolve(true);
      return;
    }

    console.log("📦 Loading Daily.co SDK from CDN...");
    
    // Check WebView compatibility
    const isAndroidWebView = /Android/.test(navigator.userAgent) && /wv/.test(navigator.userAgent);
    if (isAndroidWebView) {
      console.log("⚠️ Android WebView detected - ensuring iframe support");
    }
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@daily-co/daily-js@0.58.0'; // Pin to specific version
    script.async = false;
    script.crossOrigin = 'anonymous';
    
    script.onload = () => {
      console.log("📦 Daily SDK script loaded, waiting for initialization...");
      
      // Wait longer and poll for DailyIframe availability
      let attempts = 0;
      const maxAttempts = 20;
      
      const checkDaily = () => {
        attempts++;
        
        if (window.DailyIframe && typeof window.DailyIframe.createCallObject === 'function') {
          console.log("✅ Daily SDK fully initialized");
          console.log(`   Attempts: ${attempts}`);
          console.log(`   Version: ${window.DailyIframe.version?.() || 'unknown'}`);
          console.log(`   Methods: ${Object.keys(window.DailyIframe).slice(0, 5).join(', ')}...`);
          
          // Extra validation for WebView
          if (isAndroidWebView) {
            console.log("✅ WebView iframe support confirmed");
          }
          
          resolve(true);
        } else if (attempts >= maxAttempts) {
          console.error("❌ Daily SDK timeout after", attempts, "attempts");
          console.error("   window.DailyIframe:", !!window.DailyIframe);
          console.error("   createCallObject:", typeof window.DailyIframe?.createCallObject);
          reject(new Error(`Daily SDK failed to initialize after ${attempts} attempts`));
        } else {
          console.log(`⏳ Waiting for Daily SDK... (${attempts}/${maxAttempts})`);
          setTimeout(checkDaily, 200);
        }
      };
      
      checkDaily();
    };
    
    script.onerror = (error) => {
      console.error("❌ Failed to load Daily SDK script:", error);
      reject(new Error("Failed to load Daily.co SDK from CDN"));
    };
    
    document.head.appendChild(script);
  });
};

export default function WebRTCBroadcaster({ show, onStreamStart, onStreamStop }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState(null);
  const [broadcastStatus, setBroadcastStatus] = useState("initializing");
  const [sdkReady, setSdkReady] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const [containerReady, setContainerReady] = useState(false);
  
  const videoRef = useRef(null);
  const callFrameRef = useRef(null);
  const syncIntervalRef = useRef(null);
  const videoElementRef = useRef(null);
  const localStreamRef = useRef(null);

  // Debug logger
  const addDebugLog = (message, type = "info") => {
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setDebugLogs(prev => [...prev.slice(-10), { time: timestamp, message, type }]);
  };

  useEffect(() => {
    initializeSDK();
    
    return () => {
      cleanup();
    };
  }, []);

  // CRITICAL FIX: Monitor video container readiness
  useEffect(() => {
    if (videoRef.current) {
      addDebugLog("✅ Video container mounted", "success");
      addDebugLog(`   Container: ${videoRef.current.tagName}`, "info");
      addDebugLog(`   Dimensions: ${videoRef.current.offsetWidth}x${videoRef.current.offsetHeight}`, "info");
      setContainerReady(true);
    } else {
      addDebugLog("⏳ Video container not yet mounted", "info");
      setContainerReady(false);
    }
  }, [videoRef.current]);

  const initializeSDK = async () => {
    try {
      addDebugLog("🔧 Initializing Daily.co SDK...", "info");
      setBroadcastStatus("loading_sdk");
      
      await loadDailySDK();
      
      if (typeof window.DailyIframe === 'undefined') {
        throw new Error("DailyIframe not available after SDK load");
      }
      
      addDebugLog("✅ Daily.co SDK ready", "success");
      addDebugLog(`📍 Room: ${DAILY_ROOM_URL}`, "info");
      addDebugLog("🔑 Public room (no API key)", "info");
      
      setSdkReady(true);
      setBroadcastStatus("ready");
    } catch (err) {
      addDebugLog(`❌ SDK init failed: ${err.message}`, "error");
      setError(`Failed to load streaming SDK: ${err.message}`);
      setBroadcastStatus("error");
    }
  };

  const requestMediaPermissions = async () => {
    try {
      addDebugLog("🎤 Requesting camera/mic permissions...", "info");
      setPermissionStatus("requesting");
      
      const constraints = {
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      addDebugLog(`✅ Permissions granted`, "success");
      addDebugLog(`   Video tracks: ${stream.getVideoTracks().length}`, "info");
      addDebugLog(`   Audio tracks: ${stream.getAudioTracks().length}`, "info");
      
      stream.getTracks().forEach(track => {
        addDebugLog(`   - ${track.kind}: ${track.label}`, "info");
        track.stop();
      });
      
      setPermissionStatus("granted");
      return true;
    } catch (err) {
      addDebugLog(`❌ Permission error: ${err.name}`, "error");
      setPermissionStatus("denied");
      
      let userMessage = "Camera/Microphone access denied. ";
      if (err.name === "NotAllowedError") {
        userMessage += "Please allow camera/mic access in browser settings.";
      } else if (err.name === "NotFoundError") {
        userMessage += "No camera or microphone found.";
      } else if (err.name === "NotReadableError") {
        userMessage += "Camera/microphone is being used by another app. Please close other apps and try again.";
      } else {
        userMessage += err.message;
      }
      
      throw new Error(userMessage);
    }
  };

  const updateShowStreamingStatus = async (isActive, roomUrl = null) => {
    try {
      await base44.entities.Show.update(show.id, {
        is_streaming: isActive,
        stream_started_at: isActive ? new Date().toISOString() : null,
        status: isActive ? "live" : show.status,
        webrtc_channel_id: isActive ? roomUrl : null
      });
      addDebugLog(`✅ DB updated: is_streaming=${isActive}`, "success");
      if (!isActive) {
        setBroadcastStatus("ready");
      }
    } catch (err) {
      addDebugLog(`❌ DB update failed: ${err.message}`, "error");
    }
  };

  const startStream = async () => {
    let callFrame = null;
    
    try {
      setBroadcastStatus("connecting");
      setError(null);
      setPermissionStatus(null);
      setDebugLogs([]); // Clear logs on new stream attempt

      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("🎥 STARTING DAILY.CO BROADCAST", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog(`📺 Show ID: ${show.id}`, "info");
      addDebugLog(`🏷️ Room: ${DAILY_ROOM_NAME}`, "info");
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL: DESTROY ALL EXISTING DAILY IFRAMES
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🧹 DESTROYING ALL DAILY IFRAMES");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("🧹 DESTROYING ALL IFRAMES", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      
      // 1. Try Daily's getCallInstance() to find any existing instances
      try {
        if (window.DailyIframe && typeof window.DailyIframe.getCallInstance === 'function') {
          const existingInstance = window.DailyIframe.getCallInstance();
          if (existingInstance) {
            console.log("⚠️ FOUND EXISTING INSTANCE via getCallInstance()");
            addDebugLog("   Found instance via getCallInstance()", "error");
            await existingInstance.destroy();
            addDebugLog("   ✅ Destroyed via getCallInstance()", "success");
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (e) {
        console.log("getCallInstance() not available or failed:", e.message);
      }
      
      // 2. Destroy global reference
      if (window.__dailyFrame) {
        console.log("⚠️ DESTROYING window.__dailyFrame");
        try {
          await window.__dailyFrame.destroy();
          addDebugLog("   ✅ window.__dailyFrame destroyed", "success");
        } catch (e) {
          console.error("Error destroying global:", e);
        }
        window.__dailyFrame = null;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 3. Destroy ref
      if (callFrameRef.current) {
        console.log("⚠️ DESTROYING callFrameRef.current");
        try {
          await callFrameRef.current.destroy();
          addDebugLog("   ✅ callFrameRef destroyed", "success");
        } catch (e) {
          console.error("Error destroying ref:", e);
        }
        callFrameRef.current = null;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 4. Find and destroy ALL Daily iframes in entire document
      const allIframes = document.querySelectorAll('iframe[src*="daily.co"]');
      if (allIframes.length > 0) {
        console.log(`⚠️ FOUND ${allIframes.length} DAILY IFRAME(S) IN DOCUMENT`);
        addDebugLog(`   ⚠️ Found ${allIframes.length} Daily iframe(s) in document`, "error");
        allIframes.forEach((iframe, i) => {
          console.log(`   Removing iframe ${i + 1}:`, iframe.src);
          iframe.remove();
        });
        addDebugLog(`   ✅ Removed ${allIframes.length} Daily iframe(s)`, "success");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log("✅ ALL DAILY IFRAMES DESTROYED - READY TO CREATE NEW ONE");
      addDebugLog("✅ All iframes destroyed", "success");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 1: CRITICAL VALIDATION - Container Element
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔍 STEP 1: VALIDATING CONTAINER");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("🔍 CONTAINER VALIDATION", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      setBroadcastStatus("creating_frame");
      
      if (!videoRef.current) {
        throw new Error("❌ CRITICAL: videoRef.current is NULL");
      }
      
      const container = videoRef.current;
      const rect = container.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(container);
      
      console.log("✅ Container Reference:", container);
      console.log("   Tag:", container.tagName);
      console.log("   ID:", container.id || "(no id)");
      console.log("   Class:", container.className);
      console.log("   In DOM:", document.body.contains(container));
      console.log("   Dimensions:", rect.width, "x", rect.height);
      console.log("   Position:", rect.top, rect.left);
      console.log("   Display:", computedStyle.display);
      console.log("   Visibility:", computedStyle.visibility);
      console.log("   Opacity:", computedStyle.opacity);
      console.log("   Overflow:", computedStyle.overflow);
      console.log("   Z-Index:", computedStyle.zIndex);
      
      addDebugLog(`✅ Container: ${container.tagName}`, "success");
      addDebugLog(`   Size: ${rect.width}x${rect.height}`, "info");
      addDebugLog(`   Display: ${computedStyle.display}`, "info");
      addDebugLog(`   Visibility: ${computedStyle.visibility}`, "info");
      addDebugLog(`   Opacity: ${computedStyle.opacity}`, "info");
      
      if (rect.width === 0 || rect.height === 0) {
        throw new Error("❌ CRITICAL: Container has zero dimensions");
      }
      
      if (computedStyle.display === "none") {
        throw new Error("❌ CRITICAL: Container has display:none");
      }
      
      if (computedStyle.visibility === "hidden") {
        throw new Error("❌ CRITICAL: Container has visibility:hidden");
      }
      
      if (parseFloat(computedStyle.opacity) === 0) {
        throw new Error("❌ CRITICAL: Container has opacity:0");
      }
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      addDebugLog("✅ Container validation passed", "success");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 2: VERIFY DAILY SDK LOADED
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("🔍 STEP 2: VERIFY DAILY SDK", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      
      if (!window.DailyIframe) {
        throw new Error("❌ DailyIframe SDK not loaded");
      }
      addDebugLog("✅ window.DailyIframe exists", "success");
      
      if (typeof window.DailyIframe.createFrame !== 'function') {
        throw new Error("❌ createFrame method not available");
      }
      addDebugLog("✅ createFrame method available", "success");

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 3: DESTROY ANY EXISTING DAILY IFRAME
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("🧹 STEP 3: CHECK FOR DUPLICATES", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      
      // Check for existing Daily iframe in global scope
      if (window.__dailyFrame) {
        addDebugLog("⚠️ Found existing Daily iframe - destroying...", "error");
        console.log("⚠️ DESTROYING PREVIOUS DAILY IFRAME:", window.__dailyFrame);
        try {
          window.__dailyFrame.destroy();
          window.__dailyFrame = null;
          addDebugLog("✅ Previous iframe destroyed", "success");
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for cleanup
        } catch (err) {
          addDebugLog(`⚠️ Error destroying previous: ${err.message}`, "error");
        }
      }
      
      // Check for existing iframe in ref
      if (callFrameRef.current) {
        addDebugLog("⚠️ Found iframe in ref - destroying...", "error");
        console.log("⚠️ DESTROYING REF IFRAME:", callFrameRef.current);
        try {
          callFrameRef.current.destroy();
          callFrameRef.current = null;
          addDebugLog("✅ Ref iframe destroyed", "success");
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for cleanup
        } catch (err) {
          addDebugLog(`⚠️ Error destroying ref: ${err.message}`, "error");
        }
      }
      
      // Check for any iframe DOM elements
      const existingIframes = container.querySelectorAll('iframe');
      if (existingIframes.length > 0) {
        addDebugLog(`⚠️ Found ${existingIframes.length} existing iframe(s) - removing...`, "error");
        existingIframes.forEach(iframe => {
          console.log("⚠️ REMOVING DOM IFRAME:", iframe);
          iframe.remove();
        });
        addDebugLog("✅ DOM iframes removed", "success");
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for cleanup
      }
      
      addDebugLog("✅ No duplicates - ready to create", "success");

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 4: CREATE DAILY IFRAME (PRE-JOIN UI)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("🎬 STEP 4: CALLING createFrame()", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog(`   Room URL: ${DAILY_ROOM_URL}`, "info");
      addDebugLog(`   Container tag: ${container.tagName}`, "info");
      addDebugLog(`   Container ID: ${container.id || 'no-id'}`, "info");
      
      console.log("🚨 ABOUT TO CALL createFrame()");
      console.log("   Container:", container);
      console.log("   URL:", DAILY_ROOM_URL);
      console.log("   No existing iframes:", container.querySelectorAll('iframe').length === 0);
      
      try {
        callFrame = window.DailyIframe.createFrame(container, {
          url: DAILY_ROOM_URL,
          userName: `Host_${show.id}`,
          iframeStyle: {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '0',
            zIndex: '999999'  // CRITICAL: Very high z-index to be above everything
          },
          showLeaveButton: false,
          showFullscreenButton: false
        });
        
        console.log("✅ createFrame() RETURNED:", callFrame);
        console.log("   Type:", typeof callFrame);
        console.log("   Is null?", callFrame === null);

        } catch (createError) {
        console.error("❌ createFrame() THREW ERROR:", createError);
        addDebugLog(`❌ createFrame() error: ${createError.message}`, "error");
        throw createError;
        }

        if (!callFrame) {
        console.error("❌ callFrame is NULL after createFrame()");
        throw new Error("createFrame returned null");
        }

        addDebugLog("✅ createFrame() successful", "success");

        // Store in both ref and global scope
        callFrameRef.current = callFrame;
        window.__dailyFrame = callFrame;

        // CRITICAL: Wait and verify iframe is actually in DOM
        console.log("⏳ Waiting for iframe to be inserted into DOM...");
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time

        const iframe = container.querySelector('iframe');
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📺 IFRAME VERIFICATION");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
        addDebugLog("📺 IFRAME VERIFICATION", "info");
        addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

        if (iframe) {
        const iframeRect = iframe.getBoundingClientRect();
        const iframeStyle = window.getComputedStyle(iframe);

        console.log("✅ IFRAME FOUND IN DOM");
        console.log("   Src:", iframe.src);
        console.log("   Dimensions:", iframe.offsetWidth, "x", iframe.offsetHeight);
        console.log("   Rect:", iframeRect.width, "x", iframeRect.height);
        console.log("   Position:", iframeRect.top, iframeRect.left);
        console.log("   Display:", iframeStyle.display);
        console.log("   Visibility:", iframeStyle.visibility);
        console.log("   Opacity:", iframeStyle.opacity);
        console.log("   Z-Index:", iframeStyle.zIndex);
        console.log("   Pointer Events:", iframeStyle.pointerEvents);

        addDebugLog(`✅ Iframe found`, "success");
        addDebugLog(`   Size: ${iframe.offsetWidth}x${iframe.offsetHeight}`, "success");
        addDebugLog(`   Display: ${iframeStyle.display}`, "info");
        addDebugLog(`   Z-Index: ${iframeStyle.zIndex}`, "info");

        if (iframe.offsetWidth === 0 || iframe.offsetHeight === 0) {
          console.error("⚠️ WARNING: Iframe has zero dimensions!");
          addDebugLog("⚠️ Iframe has zero dimensions", "error");
        }

        if (iframeStyle.display === "none") {
          console.error("⚠️ WARNING: Iframe has display:none!");
          addDebugLog("⚠️ Iframe has display:none", "error");
        }

        } else {
        console.error("❌ NO IFRAME IN CONTAINER");
        console.error("   Container:", container);
        console.error("   Container children:", container.children.length);
        Array.from(container.children).forEach((child, i) => {
          console.error(`      Child ${i}:`, child.tagName, child.className);
        });

        addDebugLog("❌ NO IFRAME FOUND", "error");
        addDebugLog(`   Container children: ${container.children.length}`, "error");

        throw new Error("Daily iframe was not inserted into DOM");
        }

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

      // STEP 4: Set up event listeners
      addDebugLog("🔊 STEP 4: Setting up event listeners", "info");
      
      let joinPromiseResolve;
      let joinPromiseReject;
      const joinPromise = new Promise((resolve, reject) => {
        joinPromiseResolve = resolve;
        joinPromiseReject = reject;
      });
      
      let eventCount = 0;
      let joinSuccessful = false;
      let videoTrackStarted = false;
      let audioTrackStarted = false;
      
      callFrame.on('loading', (event) => {
        eventCount++;
        addDebugLog(`⏳ [Event ${eventCount}] loading`, "info");
      });
      
      callFrame.on('loaded', (event) => {
        eventCount++;
        addDebugLog(`✅ [Event ${eventCount}] loaded`, "success");
      });
      
      callFrame.on('joining-meeting', (event) => {
        eventCount++;
        addDebugLog(`🔄 [Event ${eventCount}] joining-meeting`, "info");
      });
      
      // Track event listeners
      callFrame.on('track-started', (event) => {
        eventCount++;
        addDebugLog(`🎥 [Event ${eventCount}] track-started: ${event.track.kind} - ${event.participant?.user_name}`, "success");
        addDebugLog(`   Track ID: ${event.track.id}`, "info");
        addDebugLog(`   Local: ${!!event.participant?.local}`, "info");

        if (event.participant?.local) {
          if (event.track.kind === 'video') {
            videoTrackStarted = true;
            addDebugLog("   ✅ LOCAL VIDEO TRACK STARTED", "success");
          }
          if (event.track.kind === 'audio') {
            audioTrackStarted = true;
            addDebugLog("   ✅ LOCAL AUDIO TRACK STARTED", "success");
          }

          // Accept broadcast if both tracks started
          if (videoTrackStarted && audioTrackStarted && !joinSuccessful) {
            addDebugLog("🎉 BOTH TRACKS STARTED - BROADCAST IS LIVE", "success");
            joinSuccessful = true;
            setIsStreaming(true);
            setBroadcastStatus("broadcasting");
            setError(null);
            joinPromiseResolve();
          }
        }
      });

      callFrame.on('track-stopped', (event) => {
        eventCount++;
        addDebugLog(`⏹️ [Event ${eventCount}] track-stopped: ${event.track.kind}`, "info");
      });

      callFrame.on('local-tracks-updated', (event) => {
        eventCount++;
        addDebugLog(`🔄 [Event ${eventCount}] local-tracks-updated`, "info");
        const tracks = event.localTracks || {};
        addDebugLog(`   Video track: ${tracks.video ? 'EXISTS' : 'MISSING'}`, tracks.video ? "success" : "error");
        addDebugLog(`   Audio track: ${tracks.audio ? 'EXISTS' : 'MISSING'}`, tracks.audio ? "success" : "error");
        
        if (tracks.video) {
          addDebugLog(`   Video state: ${tracks.video.state}`, "info");
          addDebugLog(`   Video enabled: ${tracks.video.enabled}`, "info");
        }
        if (tracks.audio) {
          addDebugLog(`   Audio state: ${tracks.audio.state}`, "info");
          addDebugLog(`   Audio enabled: ${tracks.audio.enabled}`, "info");
        }
      });

      callFrame.on('camera-error', (event) => {
        eventCount++;
        addDebugLog(`❌ [Event ${eventCount}] camera-error: ${JSON.stringify(event.error || event)}`, "error");
      });

      // PRIMARY: joined-meeting event (desktop)
      callFrame.on('joined-meeting', async (event) => {
        eventCount++;
        addDebugLog(`✅ [Event ${eventCount}] joined-meeting SUCCESS!`, "success");
        addDebugLog(`   Local participant: ${event.participants?.local?.user_name}`, "info");
        addDebugLog(`   ⏳ Waiting for video/audio tracks to start...`, "info");
        
        // DON'T mark as successful yet - wait for track-started events
      });

      callFrame.on('participant-joined', (event) => {
        eventCount++;
        addDebugLog(`👤 [Event ${eventCount}] participant-joined: ${event.participant.user_name}`, "info");
      });
      
      // MOBILE FALLBACK: participant-updated event
      callFrame.on('participant-updated', async (event) => {
        eventCount++;
        addDebugLog(`👤 [Event ${eventCount}] participant-updated: ${event.participant.user_name}`, "info");
        
        // Log track state for local participant
        if (event.participant.local) {
          addDebugLog(`   Video: ${event.participant.video ? 'ON' : 'OFF'}`, "info");
          addDebugLog(`   Audio: ${event.participant.audio ? 'ON' : 'OFF'}`, "info");
          
          // CRITICAL FIX: Accept broadcast if both tracks active (mobile fallback)
          if (event.participant.video && event.participant.audio && !joinSuccessful) {
            addDebugLog(`📱 MOBILE: Both tracks active - broadcast is live!`, "success");
            joinSuccessful = true;
            videoTrackStarted = true;
            audioTrackStarted = true;
            setIsStreaming(true);
            setBroadcastStatus("broadcasting");
            setError(null);
            joinPromiseResolve();
          }
        }
      });

      callFrame.on('error', (error) => {
        eventCount++;
        const errorDetail = error.errorMsg || error.message || JSON.stringify(error);
        addDebugLog(`❌ [Event ${eventCount}] error: ${errorDetail}`, "error");
        addDebugLog(`   Error type: ${error.type || 'unknown'}`, "error");
        addDebugLog(`   Full error: ${JSON.stringify(error)}`, "error");
        
        if (!joinSuccessful) {
          const errorMsg = `Streaming error: ${errorDetail}`;
          setError(errorMsg);
          setBroadcastStatus("error");
          joinPromiseReject(new Error(errorMsg));
        }
      });
      
      addDebugLog("✅ Event listeners registered (including mobile fallback)", "success");

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 5: WAIT FOR HOST TO JOIN VIA DAILY UI
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("⏳ STEP 5: WAITING FOR JOIN", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("   Daily pre-join UI should now be visible", "info");
      addDebugLog("   Host should see Join button", "info");
      addDebugLog("   Click Join to start broadcasting", "info");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      
      setBroadcastStatus("awaiting_join");
      
      console.log("⏳ Waiting for host to click Join in Daily UI...");
      
      try {
        await Promise.race([
          joinPromise,
          new Promise((_, reject) => 
            setTimeout(() => {
              console.error("⏱️ TIMEOUT - Host never clicked Join");
              addDebugLog(`⏱️ TIMEOUT after 60s`, "error");
              reject(new Error("Timed out waiting for you to click Join. Please try again."));
            }, 60000)
          )
        ]);
        
        console.log("✅ HOST JOINED SUCCESSFULLY");
        addDebugLog("✅ HOST JOINED - BROADCAST ACTIVE", "success");
        
      } catch (joinError) {
        console.error("❌ Join failed:", joinError);
        addDebugLog(`❌ Join error: ${joinError.message}`, "error");
        throw joinError;
      }

      // STEP 6: Update database - mark show as streaming
      addDebugLog("💾 STEP 6: Updating database", "info");
      await updateShowStreamingStatus(true, DAILY_ROOM_URL);

      // STEP 7: Start sync interval
      addDebugLog("🔄 STEP 7: Starting sync", "info");
      syncIntervalRef.current = setInterval(async () => {
        try {
          await base44.entities.Show.update(show.id, {
            is_streaming: true,
            viewer_count: show.viewer_count || 0
          });
        } catch (err) {
          addDebugLog(`⚠️ Sync failed: ${err.message}`, "error");
        }
      }, 10000);

      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");
      addDebugLog("✅ HOST BROADCAST STARTED!", "success");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "info");

      if (onStreamStart) onStreamStart();

    } catch (err) {
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "error");
      addDebugLog(`❌ HOST REGISTRATION FAILED: ${err.message}`, "error");
      addDebugLog(`   Stack trace: ${err.stack}`, "error");
      addDebugLog("━━━━━━━━━━━━━━━━━━━━━━━━━━", "error");
      
      setError(`Failed to start broadcast: ${err.message}`);
      setBroadcastStatus("error");
      
      if (callFrame || callFrameRef.current) {
        try {
          const frame = callFrame || callFrameRef.current;
          await frame.destroy();
          callFrameRef.current = null;
          addDebugLog("🧹 Frame destroyed", "info");
        } catch (cleanupErr) {
          addDebugLog(`⚠️ Cleanup error: ${cleanupErr.message}`, "error");
        }
      }
      
      await updateShowStreamingStatus(false);
    }
  };

  const cleanup = async () => {
    try {
      addDebugLog("🧹 Cleaning up...", "info");

      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }

      if (callFrameRef.current) {
        try {
          await callFrameRef.current.leave();
          callFrameRef.current.destroy();
        } catch (err) {
          addDebugLog(`⚠️ Cleanup error: ${err.message}`, "error");
        }
        callFrameRef.current = null;
      }
      
      // Clear global reference
      if (window.__dailyFrame) {
        try {
          window.__dailyFrame.destroy();
        } catch (err) {
          console.error("Error destroying global frame:", err);
        }
        window.__dailyFrame = null;
      }

      addDebugLog("✅ Cleanup complete", "success");
    } catch (err) {
      addDebugLog(`❌ Cleanup failed: ${err.message}`, "error");
    }
  };

  const stopStream = async () => {
    try {
      addDebugLog("⏹️ Stopping stream", "info");

      await cleanup();
      await updateShowStreamingStatus(false);
      
      setIsStreaming(false);
      setBroadcastStatus("ready");
      setPermissionStatus(null);
      setError(null);

      if (onStreamStop) onStreamStop();

    } catch (err) {
      addDebugLog(`❌ Stop error: ${err.message}`, "error");
    }
  };

  const toggleMute = () => {
    if (callFrameRef.current) {
      const newMutedState = !isMuted;
      callFrameRef.current.setLocalAudio(!newMutedState);
      setIsMuted(newMutedState);
      addDebugLog(`🔇 Audio ${newMutedState ? 'muted' : 'unmuted'}`, "info");
    }
  };

  const toggleCamera = () => {
    if (callFrameRef.current) {
      const newCameraState = !isCameraOff;
      callFrameRef.current.setLocalVideo(!newCameraState);
      setIsCameraOff(newCameraState);
      addDebugLog(`📹 Camera ${newCameraState ? 'off' : 'on'}`, "info");
    }
  };

  const getStatusMessage = () => {
    switch (broadcastStatus) {
      case "initializing":
      case "loading_sdk": 
        return "Loading Daily.co SDK...";
      case "requesting_permissions": 
        return "📸 Waiting for camera & microphone permission...";
      case "creating_frame": 
        return "Creating video frame...";
      case "awaiting_join":
        return "⏳ Click JOIN in the Daily window to start";
      case "joining_room": 
        return "Connecting to Daily.co room...";
      case "broadcasting": 
        return "🔴 BROADCASTING LIVE";
      case "connecting": 
        return "Connecting...";
      case "error": 
        return "Error - see details below";
      default: 
        return "Ready to broadcast";
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Debug Console - DESKTOP ONLY */}
      {debugLogs.length > 0 && (
        <div className="hidden sm:block">
          <Card className="bg-black border-yellow-500">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-yellow-400 text-xs font-mono">🔍 Debug Console</span>
                <button
                  onClick={() => setDebugLogs([])}
                  className="text-yellow-400 hover:text-yellow-300 text-xs"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto font-mono text-xs">
                {debugLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`${
                      log.type === "error" ? "text-red-400" :
                      log.type === "success" ? "text-green-400" :
                      "text-gray-300"
                    }`}
                  >
                    [{log.time}] {log.message}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <Alert className="border-red-500 bg-red-50">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
          <AlertDescription className="text-red-900 text-xs sm:text-sm">
            <strong>Error:</strong> {error}
            <br />
            <span className="text-[10px] mt-1 block">
              Please check the <strong>Debug Console</strong> above for more details.
              Often, this is due to permissions or another app using your camera/mic.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Permission Request Alert */}
      {permissionStatus === "requesting" && (
        <Alert className="border-yellow-500 bg-yellow-50 animate-pulse">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
          <AlertDescription className="text-yellow-900 text-xs sm:text-sm">
            <strong>📸 Camera & Microphone Permission Required</strong>
            <br />
            <span className="text-[10px] sm:text-xs mt-1 block">
              <strong>LOOK AT THE TOP OF YOUR SCREEN!</strong> Your browser should show a permission popup. 
              Please tap <strong>"Allow"</strong> to enable camera and microphone access.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Status Alert */}
      {sdkReady && !error && (
        <Alert className={`border-2 ${
          broadcastStatus === "broadcasting" ? "border-green-500 bg-green-50" :
          broadcastStatus === "connecting" || broadcastStatus === "requesting_permissions" || broadcastStatus === "creating_frame" || broadcastStatus === "joining_room" || broadcastStatus === "loading_sdk" ? "border-yellow-500 bg-yellow-50" :
          broadcastStatus === "error" ? "border-red-500 bg-red-50" :
          "border-blue-500 bg-blue-50"
        }`}>
          {broadcastStatus === "broadcasting" ? (
            <>
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
              <AlertDescription className="text-green-900">
                <strong className="text-xs sm:text-sm">{getStatusMessage()}</strong>
                <br />
                <span className="text-[10px] sm:text-xs">
                  Room: {DAILY_ROOM_NAME} • Show: {show.id}
                </span>
              </AlertDescription>
            </>
          ) : (broadcastStatus === "connecting" || broadcastStatus === "requesting_permissions" || broadcastStatus === "creating_frame" || broadcastStatus === "awaiting_join" || broadcastStatus === "joining_room" || broadcastStatus === "loading_sdk") ? (
            <>
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600 animate-spin" />
              <AlertDescription className="text-yellow-900 text-xs sm:text-sm">
                <strong>{getStatusMessage()}</strong>
                <br />
                <span className="text-[10px] mt-1 block">
                  {broadcastStatus === "loading_sdk" && "Loading SDK..."}
                  {broadcastStatus === "requesting_permissions" && "Check top of screen for permission popup"}
                  {broadcastStatus === "creating_frame" && "Setting up video... Check debug console"}
                  {broadcastStatus === "awaiting_join" && "Daily pre-join UI should be visible - click Join"}
                  {broadcastStatus === "joining_room" && "Check debug console for details"}
                  {broadcastStatus === "connecting" && "Please wait..."}
                </span>
              </AlertDescription>
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              <AlertDescription className="text-blue-900 text-xs sm:text-sm">
                <strong>Ready</strong> — Click "Start Broadcasting"
                <br />
                <span className="text-[10px] mt-1 block">
                  Container: {containerReady ? "✅ Ready" : "⏳ Loading..."}
                </span>
              </AlertDescription>
            </>
          )}
        </Alert>
      )}

      {/* Video Container - CRITICAL: Must be visible for Daily iframe */}
      <Card className="bg-black border-0 overflow-visible">
        <div className="relative aspect-video overflow-visible">
          {/* CRITICAL: Daily iframe container - MUST be visible with high z-index */}
          <div 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full"
            style={{ 
              minHeight: '400px',
              zIndex: broadcastStatus === "awaiting_join" ? 999999 : 1,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            }}
          ></div>
          
          {/* Loading overlay - hide completely when awaiting_join */}
          {!isStreaming && broadcastStatus !== "awaiting_join" && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-0">
              <div className="text-center p-4">
                {(broadcastStatus === "connecting" || broadcastStatus === "requesting_permissions" || broadcastStatus === "creating_frame" || broadcastStatus === "joining_room" || broadcastStatus === "loading_sdk") ? (
                  <>
                    <div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:h-16 border-b-2 border-white mx-auto mb-3 sm:mb-4"></div>
                    <p className="text-gray-300 text-sm sm:text-base font-semibold">{getStatusMessage()}</p>
                    <p className="text-gray-500 text-xs sm:text-sm mt-2">Check debug console above</p>
                  </>
                ) : (
                  <>
                    <Camera className="w-12 h-12 sm:w-16 sm:h-16 text-gray-600 mx-auto mb-3 sm:mb-4" />
                    <p className="text-gray-400 text-sm sm:text-base">Ready to broadcast</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Live Overlay */}
          {isStreaming && (
            <>
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-1.5 sm:gap-2 bg-red-600 px-2.5 py-1 sm:px-3 rounded-full animate-pulse z-10">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                <span className="text-white text-xs sm:text-sm font-bold">LIVE</span>
              </div>

              <div className="absolute bottom-3 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 sm:gap-3 z-10">
                <Button
                  variant="outline"
                  size="icon"
                  className={`rounded-full w-10 h-10 sm:w-12 sm:h-12 ${isMuted ? 'bg-red-600 text-white' : 'bg-white/90'}`}
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                </Button>
                
                <Button
                  variant="outline"
                  size="icon"
                  className={`rounded-full w-10 h-10 sm:w-12 sm:h-12 ${isCameraOff ? 'bg-red-600 text-white' : 'bg-white/90'}`}
                  onClick={toggleCamera}
                >
                  {isCameraOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                </Button>
                
                <Button
                  variant="destructive"
                  size="icon"
                  className="rounded-full w-10 h-10 sm:w-12 sm:h-12"
                  onClick={stopStream}
                >
                  <Radio className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Controls */}
      <div className="flex gap-2 sm:gap-3">
        {!isStreaming ? (
          <Button
            className="flex-1 bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-700 hover:to-purple-700 h-10 sm:h-12 text-sm sm:text-base"
            onClick={startStream}
            disabled={!sdkReady || !containerReady || broadcastStatus === "connecting" || broadcastStatus === "requesting_permissions" || broadcastStatus === "creating_frame" || broadcastStatus === "awaiting_join" || broadcastStatus === "joining_room" || broadcastStatus === "loading_sdk"}
          >
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            {(broadcastStatus === "connecting" || broadcastStatus === "requesting_permissions" || broadcastStatus === "creating_frame" || broadcastStatus === "awaiting_join" || broadcastStatus === "joining_room" || broadcastStatus === "loading_sdk") ? "Connecting..." : !containerReady ? "Loading..." : "Start Broadcasting"}
          </Button>
        ) : (
          <Button
            variant="destructive"
            className="flex-1 h-10 sm:h-12 text-sm sm:text-base"
            onClick={stopStream}
          >
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Stop Broadcasting
          </Button>
        )}
      </div>

      {/* Tips */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2 text-sm sm:text-base">
            <Clapperboard className="w-3 h-3 sm:w-4 sm:h-4" />
            Broadcasting Tips
          </h4>
          <ul className="text-xs sm:text-sm text-gray-600 space-y-1">
            <li>• <strong>Debug Console:</strong> Check logs above for detailed info</li>
            <li>• <strong>Permissions:</strong> Allow camera/mic at top of browser</li>
            <li>• <strong>Connection:</strong> First time may take 30-60 seconds</li>
            <li>• <strong>Close Other Apps:</strong> Instagram, TikTok, Camera app</li>
            <li>• <strong>Internet:</strong> Need stable 4G/5G/WiFi</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}