/**
 * AWS IVS API
 *
 * Provides frontend integration for AWS IVS playback authorization.
 * Tokens are generated server-side via Supabase Edge Function.
 *
 * Security:
 * - Private key is never exposed to frontend
 * - Requires authenticated Supabase session
 * - Tokens are short-lived (5 minutes)
 */

import { supabase } from "@/lib/supabase/supabaseClient";

/**
 * Result of getting a playback token.
 */
export interface PlaybackTokenResult {
  token: string | null;
  expiresIn: number;
  error: string | null;
}

/**
 * Get an AWS IVS playback authorization token.
 *
 * This calls the server-side Edge Function which:
 * 1. Verifies user authentication
 * 2. Signs a JWT with the private key from Vault
 * 3. Returns a short-lived token
 *
 * @param channelArn - The AWS IVS channel ARN
 * @param playbackUrl - The playback URL (optional, for logging)
 * @returns The playback token or error
 *
 * Example:
 * ```typescript
 * const { token, error } = await getIvsPlaybackToken(
 *   "arn:aws:ivs:us-east-1:123456789:channel/abc",
 *   "https://xxx.playback.live-video.net/api/video/v1/xxx.m3u8"
 * );
 *
 * if (token) {
 *   const authorizedUrl = `${playbackUrl}?token=${token}`;
 *   player.load(authorizedUrl);
 * }
 * ```
 */
export async function getIvsPlaybackToken(
  channelArn: string,
  playbackUrl?: string
): Promise<PlaybackTokenResult> {
  // Validate input
  if (!channelArn) {
    return {
      token: null,
      expiresIn: 0,
      error: "Channel ARN is required",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      "get-ivs-playback-token",
      {
        body: {
          channelArn,
          playbackUrl: playbackUrl || "",
        },
      }
    );

    if (error) {
      console.warn("Failed to get IVS playback token:", error.message);
      return {
        token: null,
        expiresIn: 0,
        error: error.message,
      };
    }

    if (data.error) {
      console.warn("IVS token error:", data.error);
      return {
        token: null,
        expiresIn: 0,
        error: data.error,
      };
    }

    return {
      token: data.token,
      expiresIn: data.expiresIn || 300,
      error: null,
    };
  } catch (err) {
    console.warn("Unexpected error getting IVS playback token:", err);
    return {
      token: null,
      expiresIn: 0,
      error: "Failed to get playback token",
    };
  }
}

/**
 * Build an authorized playback URL by appending the token.
 *
 * @param playbackUrl - The base IVS playback URL
 * @param token - The authorization token
 * @returns The authorized URL
 */
export function buildAuthorizedPlaybackUrl(
  playbackUrl: string,
  token: string
): string {
  if (!playbackUrl || !token) {
    return playbackUrl;
  }

  // Check if URL already has query parameters
  const separator = playbackUrl.includes("?") ? "&" : "?";
  return `${playbackUrl}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Check if a playback token is expired or will expire soon.
 *
 * @param expiresAt - The expiration timestamp (seconds since epoch)
 * @param bufferSeconds - Buffer time before expiration to consider "expired" (default: 30s)
 * @returns True if token is expired or expiring soon
 */
export function isTokenExpired(
  expiresAt: number,
  bufferSeconds: number = 30
): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= expiresAt - bufferSeconds;
}

/**
 * Token refresh manager for IVS playback.
 *
 * Automatically refreshes tokens before they expire.
 */
export class IvsTokenManager {
  private channelArn: string;
  private playbackUrl: string;
  private currentToken: string | null = null;
  private expiresAt: number = 0;
  private refreshTimer: number | null = null;
  private onTokenRefreshed?: (token: string) => void;

  constructor(
    channelArn: string,
    playbackUrl: string,
    onTokenRefreshed?: (token: string) => void
  ) {
    this.channelArn = channelArn;
    this.playbackUrl = playbackUrl;
    this.onTokenRefreshed = onTokenRefreshed;
  }

  /**
   * Get a valid token, refreshing if necessary.
   */
  async getToken(): Promise<string | null> {
    // Return cached token if still valid
    if (this.currentToken && !isTokenExpired(this.expiresAt)) {
      return this.currentToken;
    }

    // Fetch new token
    const result = await getIvsPlaybackToken(this.channelArn, this.playbackUrl);

    if (result.error || !result.token) {
      console.warn("Failed to refresh IVS token:", result.error);
      return null;
    }

    this.currentToken = result.token;
    this.expiresAt = Math.floor(Date.now() / 1000) + result.expiresIn;

    // Schedule refresh before expiration (30 seconds before)
    this.scheduleRefresh(result.expiresIn - 30);

    return this.currentToken;
  }

  /**
   * Get the authorized playback URL with current token.
   */
  async getAuthorizedUrl(): Promise<string | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }
    return buildAuthorizedPlaybackUrl(this.playbackUrl, token);
  }

  /**
   * Start automatic token refresh.
   */
  async start(): Promise<string | null> {
    return this.getToken();
  }

  /**
   * Stop automatic token refresh.
   */
  stop(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.currentToken = null;
    this.expiresAt = 0;
  }

  private scheduleRefresh(delaySeconds: number): void {
    // Clear existing timer
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }

    // Schedule next refresh
    this.refreshTimer = setTimeout(async () => {
      const token = await this.getToken();
      if (token && this.onTokenRefreshed) {
        this.onTokenRefreshed(token);
      }
    }, delaySeconds * 1000) as unknown as number;
  }
}





