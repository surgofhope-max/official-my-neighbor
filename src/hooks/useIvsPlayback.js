/**
 * useIvsPlayback Hook
 *
 * Provides IVS playback token management for components that need
 * authorized stream URLs.
 *
 * Features:
 * - Automatic token fetching
 * - Token refresh before expiration
 * - Error handling
 * - Loading state management
 *
 * Usage:
 * ```jsx
 * const { authorizedUrl, isLoading, error, refresh } = useIvsPlayback(
 *   show.ivs_channel_arn,
 *   show.ivs_playback_url
 * );
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getIvsPlaybackToken,
  buildAuthorizedPlaybackUrl,
  isTokenExpired,
} from "@/api/ivs";

/**
 * Hook for managing IVS playback authorization.
 *
 * @param {string} channelArn - AWS IVS channel ARN
 * @param {string} playbackUrl - AWS IVS playback URL
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether to fetch token (default: true)
 * @param {boolean} options.autoRefresh - Whether to auto-refresh tokens (default: true)
 * @param {number} options.refreshBuffer - Seconds before expiry to refresh (default: 30)
 */
export function useIvsPlayback(channelArn, playbackUrl, options = {}) {
  const {
    enabled = true,
    autoRefresh = true,
    refreshBuffer = 30,
  } = options;

  const [token, setToken] = useState(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Build authorized URL from current token
  const authorizedUrl = token && playbackUrl
    ? buildAuthorizedPlaybackUrl(playbackUrl, token)
    : null;

  // Check if current token is still valid
  const isTokenValid = token && !isTokenExpired(expiresAt, refreshBuffer);

  // Fetch a new token
  const fetchToken = useCallback(async () => {
    if (!channelArn || !playbackUrl) {
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getIvsPlaybackToken(channelArn, playbackUrl);

      if (!mountedRef.current) return null;

      if (result.error) {
        setError(result.error);
        setToken(null);
        return null;
      }

      const newToken = result.token;
      const newExpiresAt = Math.floor(Date.now() / 1000) + result.expiresIn;

      setToken(newToken);
      setExpiresAt(newExpiresAt);

      // Schedule refresh if auto-refresh is enabled
      if (autoRefresh) {
        scheduleRefresh(result.expiresIn - refreshBuffer);
      }

      return newToken;
    } catch (err) {
      if (!mountedRef.current) return null;

      const errorMessage = err.message || "Failed to get playback token";
      setError(errorMessage);
      setToken(null);
      return null;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [channelArn, playbackUrl, autoRefresh, refreshBuffer]);

  // Schedule token refresh
  const scheduleRefresh = useCallback((delaySeconds) => {
    // Clear existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Don't schedule if delay is too short
    if (delaySeconds <= 0) {
      return;
    }

    refreshTimerRef.current = setTimeout(async () => {
      if (mountedRef.current) {
        console.log("[useIvsPlayback] Refreshing token...");
        await fetchToken();
      }
    }, delaySeconds * 1000);
  }, [fetchToken]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    return fetchToken();
  }, [fetchToken]);

  // Clear token and timer
  const clear = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    setToken(null);
    setExpiresAt(0);
    setError(null);
  }, []);

  // Fetch token on mount and when dependencies change
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && channelArn && playbackUrl) {
      fetchToken();
    }

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [enabled, channelArn, playbackUrl]); // Don't include fetchToken to avoid loop

  return {
    // Current token
    token,

    // Authorized playback URL (null if no token)
    authorizedUrl,

    // Token expiration timestamp (seconds)
    expiresAt,

    // Whether token is currently valid
    isTokenValid,

    // Loading state
    isLoading,

    // Error message (if any)
    error,

    // Manual refresh function
    refresh,

    // Clear token and reset state
    clear,
  };
}

export default useIvsPlayback;





