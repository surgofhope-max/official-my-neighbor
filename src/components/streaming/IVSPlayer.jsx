/**
 * IVSPlayer - AWS Interactive Video Service Player Component
 *
 * Provides authenticated playback for private IVS channels.
 *
 * Features:
 * - Automatic token generation via Edge Function
 * - Token refresh before expiration (5 min TTL)
 * - Graceful offline/error state handling
 * - No secrets exposed to frontend
 *
 * TODOs:
 * - Add viewer ban check before token request
 * - Add private show access validation
 * - Add geo-restriction handling
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  getIvsPlaybackToken,
  buildAuthorizedPlaybackUrl,
} from "@/api/ivs";
import { AlertCircle, Radio, Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// IVS Player SDK URL
const IVS_PLAYER_SDK_URL = "https://player.live-video.net/1.22.0/amazon-ivs-player.min.js";

// Player states
const PLAYER_STATE = {
  LOADING: "loading",      // Fetching token / initializing
  BUFFERING: "buffering",  // Player buffering
  PLAYING: "playing",      // Stream is playing
  IDLE: "idle",            // Player idle (not playing)
  OFFLINE: "offline",      // Stream not live
  ERROR: "error",          // Error occurred
};

/**
 * Load the Amazon IVS Player SDK
 */
const loadIvsPlayerSdk = () => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof window !== "undefined" && window.IVSPlayer) {
      resolve(window.IVSPlayer);
      return;
    }

    // Check if script is already loading
    const existingScript = document.querySelector(`script[src="${IVS_PLAYER_SDK_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.IVSPlayer) {
          resolve(window.IVSPlayer);
        } else {
          reject(new Error("IVS Player SDK loaded but IVSPlayer not found"));
        }
      });
      return;
    }

    // Load the SDK
    const script = document.createElement("script");
    script.src = IVS_PLAYER_SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.IVSPlayer) {
        console.log("[IVS] Player SDK loaded successfully");
        resolve(window.IVSPlayer);
      } else {
        reject(new Error("IVS Player SDK loaded but IVSPlayer not found"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load IVS Player SDK"));
    document.head.appendChild(script);
  });
};

/**
 * IVSPlayer Component
 *
 * @param {Object} props
 * @param {Object} props.show - The show object with ivs_channel_arn and ivs_playback_url
 * @param {Function} props.onStateChange - Callback when player state changes
 * @param {Function} props.onError - Callback when error occurs
 * @param {boolean} props.autoplay - Whether to autoplay (default: true)
 * @param {boolean} props.muted - Whether to start muted (default: false)
 */
export default function IVSPlayer({
  show,
  onStateChange,
  onError,
  autoplay = true,
  muted = false,
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const tokenManagerRef = useRef(null);
  const mountedRef = useRef(true);

  const [playerState, setPlayerState] = useState(PLAYER_STATE.LOADING);
  const [error, setError] = useState(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [currentToken, setCurrentToken] = useState(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(0);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  // Extract IVS URLs from show
  const channelArn = show?.ivs_channel_arn;
  const playbackUrl = show?.ivs_playback_url;
  const isShowLive = show?.status === "live" || show?.is_streaming === true;

  // Update parent component when state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(playerState);
    }
  }, [playerState, onStateChange]);

  // Load IVS Player SDK on mount
  useEffect(() => {
    mountedRef.current = true;

    loadIvsPlayerSdk()
      .then((IVSPlayer) => {
        if (mountedRef.current) {
          setSdkLoaded(true);
        }
      })
      .catch((err) => {
        console.error("[IVS] Failed to load SDK:", err);
        if (mountedRef.current) {
          setError("Failed to load video player. Please refresh the page.");
          setPlayerState(PLAYER_STATE.ERROR);
        }
      });

    return () => {
      mountedRef.current = false;
      destroyPlayer();
    };
  }, []);

  // Destroy player and cleanup
  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.delete();
      } catch (err) {
        // Ignore cleanup errors
      }
      playerRef.current = null;
    }

    // Clear token refresh timer
    if (tokenManagerRef.current) {
      clearTimeout(tokenManagerRef.current);
      tokenManagerRef.current = null;
    }
  }, []);

  // Fetch playback token
  const fetchToken = useCallback(async () => {
    if (!channelArn || !playbackUrl) {
      return null;
    }

    setIsRefreshingToken(true);

    try {
      const result = await getIvsPlaybackToken(channelArn, playbackUrl);

      if (result.error) {
        console.warn("[IVS] Token fetch error:", result.error);
        throw new Error(result.error);
      }

      if (!result.token) {
        throw new Error("No token received");
      }

      // Calculate expiration time
      const expiresAt = Math.floor(Date.now() / 1000) + result.expiresIn;

      setCurrentToken(result.token);
      setTokenExpiresAt(expiresAt);

      // Schedule token refresh 30 seconds before expiration
      const refreshDelay = (result.expiresIn - 30) * 1000;
      if (refreshDelay > 0) {
        tokenManagerRef.current = setTimeout(() => {
          if (mountedRef.current && playerState === PLAYER_STATE.PLAYING) {
            console.log("[IVS] Refreshing token before expiration...");
            refreshTokenAndReload();
          }
        }, refreshDelay);
      }

      return result.token;
    } catch (err) {
      console.error("[IVS] Token fetch failed:", err);
      throw err;
    } finally {
      setIsRefreshingToken(false);
    }
  }, [channelArn, playbackUrl, playerState]);

  // Refresh token and reload stream
  const refreshTokenAndReload = useCallback(async () => {
    try {
      const token = await fetchToken();
      if (token && playerRef.current) {
        const authorizedUrl = buildAuthorizedPlaybackUrl(playbackUrl, token);
        console.log("[IVS] Reloading stream with new token");
        playerRef.current.load(authorizedUrl);
      }
    } catch (err) {
      console.error("[IVS] Token refresh failed:", err);
      setError("Failed to refresh authorization. Please reload the page.");
      setPlayerState(PLAYER_STATE.ERROR);
    }
  }, [fetchToken, playbackUrl]);

  // Initialize player when SDK is loaded and show is live
  const initializePlayer = useCallback(async () => {
    if (!sdkLoaded || !videoRef.current || !channelArn || !playbackUrl) {
      return;
    }

    // Check if show is live
    if (!isShowLive) {
      setPlayerState(PLAYER_STATE.OFFLINE);
      return;
    }

    setPlayerState(PLAYER_STATE.LOADING);
    setError(null);

    try {
      // Fetch authorization token
      const token = await fetchToken();

      if (!token) {
        throw new Error("Failed to get playback authorization");
      }

      // Build authorized URL
      const authorizedUrl = buildAuthorizedPlaybackUrl(playbackUrl, token);

      // Check if player SDK is available
      if (!window.IVSPlayer) {
        throw new Error("IVS Player SDK not available");
      }

      // Check browser support
      if (!window.IVSPlayer.isPlayerSupported) {
        throw new Error("IVS Player is not supported in this browser");
      }

      // Create player
      const IVSPlayer = window.IVSPlayer;
      const player = IVSPlayer.create();
      playerRef.current = player;

      // Attach to video element
      player.attachHTMLVideoElement(videoRef.current);

      // Set up event listeners
      player.addEventListener(IVSPlayer.PlayerState.PLAYING, () => {
        if (mountedRef.current) {
          console.log("[IVS] Stream playing");
          setPlayerState(PLAYER_STATE.PLAYING);
          setError(null);
        }
      });

      player.addEventListener(IVSPlayer.PlayerState.BUFFERING, () => {
        if (mountedRef.current) {
          console.log("[IVS] Buffering...");
          setPlayerState(PLAYER_STATE.BUFFERING);
        }
      });

      player.addEventListener(IVSPlayer.PlayerState.IDLE, () => {
        if (mountedRef.current) {
          console.log("[IVS] Player idle");
          setPlayerState(PLAYER_STATE.IDLE);
        }
      });

      player.addEventListener(IVSPlayer.PlayerState.ENDED, () => {
        if (mountedRef.current) {
          console.log("[IVS] Stream ended");
          setPlayerState(PLAYER_STATE.OFFLINE);
        }
      });

      player.addEventListener(IVSPlayer.PlayerEventType.ERROR, (err) => {
        if (mountedRef.current) {
          console.error("[IVS] Player error:", err);
          
          // Check if it's an authorization error
          const errorMessage = err?.message || "";
          if (errorMessage.includes("403") || errorMessage.includes("unauthorized")) {
            setError("Stream authorization failed. Please try again.");
          } else if (errorMessage.includes("404") || errorMessage.includes("not found")) {
            setError("Stream not available");
            setPlayerState(PLAYER_STATE.OFFLINE);
          } else {
            setError("Playback error occurred");
          }
          
          setPlayerState(PLAYER_STATE.ERROR);
          
          if (onError) {
            onError(err);
          }
        }
      });

      // Load and play
      console.log("[IVS] Loading stream...");
      player.load(authorizedUrl);

      if (autoplay) {
        player.setMuted(muted);
        player.play();
      }

    } catch (err) {
      console.error("[IVS] Player initialization failed:", err);
      setError(err.message || "Failed to initialize player");
      setPlayerState(PLAYER_STATE.ERROR);

      if (onError) {
        onError(err);
      }
    }
  }, [sdkLoaded, channelArn, playbackUrl, isShowLive, fetchToken, autoplay, muted, onError]);

  // Initialize player when dependencies change
  useEffect(() => {
    if (sdkLoaded && channelArn && playbackUrl) {
      initializePlayer();
    }

    return () => {
      destroyPlayer();
    };
  }, [sdkLoaded, channelArn, playbackUrl, isShowLive]);

  // Retry handler
  const handleRetry = useCallback(() => {
    destroyPlayer();
    initializePlayer();
  }, [destroyPlayer, initializePlayer]);

  // Render offline state
  if (!channelArn || !playbackUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-white">
          <WifiOff className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">Stream Not Configured</p>
          <p className="text-sm text-gray-400">This show doesn't have streaming enabled</p>
        </div>
      </div>
    );
  }

  // Render based on player state
  return (
    <div className="relative w-full h-full bg-black">
      {/* Video Element - always rendered but may be hidden */}
      <video
        ref={videoRef}
        className={`w-full h-full object-contain ${
          playerState === PLAYER_STATE.PLAYING || playerState === PLAYER_STATE.BUFFERING
            ? "block"
            : "hidden"
        }`}
        playsInline
        muted={muted}
        autoPlay={autoplay}
      />

      {/* Loading State */}
      {playerState === PLAYER_STATE.LOADING && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center text-white">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" />
            <p className="text-sm">
              {isRefreshingToken ? "Authorizing playback..." : "Connecting to stream..."}
            </p>
          </div>
        </div>
      )}

      {/* Buffering State */}
      {playerState === PLAYER_STATE.BUFFERING && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 rounded-full p-4">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        </div>
      )}

      {/* Offline State */}
      {playerState === PLAYER_STATE.OFFLINE && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
          <div className="text-center text-white px-6">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
              <Radio className="w-10 h-10 text-gray-500" />
            </div>
            <p className="text-xl font-semibold mb-2">Stream Offline</p>
            <p className="text-sm text-gray-400 mb-6">
              {show?.title ? `"${show.title}" is not live yet` : "This stream is not currently live"}
            </p>
            <Button
              variant="outline"
              onClick={handleRetry}
              className="text-white border-gray-600 hover:bg-gray-800"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Check Again
            </Button>
          </div>
        </div>
      )}

      {/* Error State */}
      {playerState === PLAYER_STATE.ERROR && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-red-900/50 to-black">
          <div className="text-center text-white px-6 max-w-md">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <p className="text-lg font-semibold mb-2">Playback Error</p>
            <p className="text-sm text-gray-300 mb-6">{error || "Unable to play stream"}</p>
            <Button
              onClick={handleRetry}
              className="bg-red-600 hover:bg-red-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Live indicator when playing */}
      {playerState === PLAYER_STATE.PLAYING && (
        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600 rounded-full text-white text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          LIVE
        </div>
      )}

      {/* Token refresh indicator */}
      {isRefreshingToken && playerState === PLAYER_STATE.PLAYING && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-black/70 rounded-full text-white text-xs">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Refreshing...
        </div>
      )}
    </div>
  );
}

// Export player state enum for parent components
export { PLAYER_STATE };





