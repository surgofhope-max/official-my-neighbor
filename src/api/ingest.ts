/**
 * Ingest API
 *
 * Provides frontend integration for retrieving AWS IVS ingest details.
 *
 * Security:
 * - All credentials and sensitive operations are server-side
 * - Only authenticated sellers can access their show's ingest details
 * - Admin impersonation is supported via header
 */

import { supabase } from "@/lib/supabase/supabaseClient";

/**
 * Ingest details returned by the Edge Function
 */
export interface IngestDetails {
  /** RTMPS ingest endpoint URL */
  ingestEndpoint: string;
  /** Stream key value (keep secret!) */
  streamKey: string;
  /** Server URL for OBS (same as ingestEndpoint) */
  serverUrl: string;
  /** Helpful hint for streaming software */
  streamKeyHint: string;
}

/**
 * Result of getting ingest details
 */
export interface GetIngestResult {
  data: IngestDetails | null;
  error: string | null;
}

/**
 * Get AWS IVS ingest details for a show.
 *
 * This calls the server-side Edge Function which:
 * 1. Verifies seller authentication and authorization
 * 2. Retrieves channel details from AWS IVS
 * 3. Gets or creates a stream key
 * 4. Returns the ingest endpoint and stream key
 *
 * @param showId - The show ID to get ingest details for
 * @param impersonatedSellerId - Optional seller ID for admin impersonation
 * @returns Ingest details or error
 *
 * Example:
 * ```typescript
 * const { data, error } = await getIngestDetails("show-uuid");
 *
 * if (data) {
 *   // Configure OBS with:
 *   // Server: data.serverUrl
 *   // Stream Key: data.streamKey
 * }
 * ```
 */
export async function getIngestDetails(
  showId: string,
  impersonatedSellerId?: string
): Promise<GetIngestResult> {
  if (!showId) {
    return {
      data: null,
      error: "Show ID is required",
    };
  }

  try {
    // Build headers (include impersonation header if provided)
    const headers: Record<string, string> = {};

    if (impersonatedSellerId) {
      headers["x-impersonate-seller-id"] = impersonatedSellerId;
    }

    const { data, error } = await supabase.functions.invoke("get-ivs-ingest", {
      body: { showId },
      headers,
    });

    if (error) {
      console.warn("Failed to get ingest details:", error.message);
      return {
        data: null,
        error: error.message || "Failed to get ingest details",
      };
    }

    if (data.error) {
      console.warn("Ingest details error:", data.error);
      return {
        data: null,
        error: data.error,
      };
    }

    return {
      data: data as IngestDetails,
      error: null,
    };
  } catch (err) {
    console.error("Unexpected error getting ingest details:", err);
    return {
      data: null,
      error: "Failed to get ingest details",
    };
  }
}

/**
 * Check if ingest details are available for a show.
 *
 * This is a lightweight check that doesn't retrieve the stream key.
 *
 * @param showId - The show ID to check
 * @returns True if IVS is configured for the show
 */
export async function hasIvsConfigured(showId: string): Promise<boolean> {
  if (!showId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("shows")
      .select("ivs_channel_arn")
      .eq("id", showId)
      .single();

    if (error || !data) {
      return false;
    }

    return Boolean(data.ivs_channel_arn);
  } catch {
    return false;
  }
}

/**
 * Check the current stream status for a show.
 *
 * AUTHORITATIVE: Returns stream_status directly. "live" means live.
 *
 * @param showId - The show ID to check
 * @returns The stream_status value or null
 */
export async function getStreamStatus(
  showId: string
): Promise<string | null> {
  if (!showId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("shows")
      .select("stream_status")
      .eq("id", showId)
      .single();

    if (error || !data) {
      return null;
    }

    // AUTHORITATIVE: Return stream_status directly
    return data.stream_status || null;
  } catch {
    return null;
  }
}





