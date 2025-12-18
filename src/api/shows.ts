/**
 * Shows API
 *
 * Provides read-only queries for show data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface Show {
  id: string;
  seller_id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  stream_url?: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  viewer_count?: number;
  max_viewers?: number;
  is_featured?: boolean;
  is_streaming?: boolean;
  hidden_from_orders?: boolean;
  community_id?: string;
  created_date?: string;
  featured_product_id?: string;
  pickup_instructions?: string;

  // AWS IVS streaming fields
  ivs_channel_arn?: string;       // AWS IVS channel ARN
  ivs_playback_url?: string;      // IVS playback URL (HLS)
  ivs_ingest_endpoint?: string;   // IVS ingest endpoint (RTMPS)
  ivs_stream_key_arn?: string;    // IVS stream key ARN

  // Stream status (set by IVS sync function)
  stream_status?: "ready" | "starting" | "live" | "stopping" | "offline";

  // Stream timestamps (set by IVS sync function)
  went_live_at?: string;          // When stream went live
  ended_at?: string;              // When stream ended
}

/**
 * Get all shows.
 *
 * @returns Array of all shows, sorted by scheduled_start DESC
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 */
export async function getAllShows(): Promise<Show[]> {
  try {
    const { data, error } = await supabase
      .from("shows")
      .select("*")
      .order("scheduled_start_time", { ascending: false });

    if (error) {
      console.warn("Failed to fetch all shows:", error.message);
      return [];
    }

    return (data as Show[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching shows:", err);
    return [];
  }
}

/**
 * Get shows for a specific seller.
 *
 * @param sellerId - The seller ID to filter by
 * @returns Array of shows for the seller, sorted by scheduled_start DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null sellerId
 * - Returns [] on any error
 */
export async function getShowsBySellerId(
  sellerId: string | null
): Promise<Show[]> {
  if (!sellerId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("shows")
      .select("*")
      .eq("seller_id", sellerId)
      .order("scheduled_start_time", { ascending: false });

    if (error) {
      console.warn("Failed to fetch shows by seller ID:", error.message);
      return [];
    }

    return (data as Show[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching seller shows:", err);
    return [];
  }
}

/**
 * Get a single show by ID.
 *
 * @param showId - The show ID to look up
 * @returns The show if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for null showId
 * - Returns null on any error
 */
export async function getShowById(
  showId: string | null
): Promise<Show | null> {
  if (!showId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("shows")
      .select("*")
      .eq("id", showId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch show by ID:", error.message);
      return null;
    }

    return data as Show | null;
  } catch (err) {
    console.warn("Unexpected error fetching show:", err);
    return null;
  }
}

/**
 * Get shows by status.
 *
 * @param status - The status to filter by
 * @returns Array of shows with the given status
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 */
export async function getShowsByStatus(
  status: "scheduled" | "live" | "ended" | "cancelled"
): Promise<Show[]> {
  try {
    const { data, error } = await supabase
      .from("shows")
      .select("*")
      .eq("status", status)
      .order("scheduled_start_time", { ascending: false });

    if (error) {
      console.warn("Failed to fetch shows by status:", error.message);
      return [];
    }

    return (data as Show[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching shows by status:", err);
    return [];
  }
}

/**
 * Get live shows (currently streaming).
 *
 * @returns Array of live shows
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 */
export async function getLiveShows(): Promise<Show[]> {
  return getShowsByStatus("live");
}

/**
 * Get scheduled (upcoming) shows.
 *
 * @returns Array of scheduled shows
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 */
export async function getScheduledShows(): Promise<Show[]> {
  return getShowsByStatus("scheduled");
}

export async function createShow(input: {
  seller_id: string;
  title: string;
  description?: string;
  pickup_instructions?: string;
  scheduled_start?: string;
}) {
  try {
    const insertPayload = {
      seller_id: input.seller_id,
      title: input.title,
      description: input.description ?? null,
      pickup_instructions: input.pickup_instructions ?? null,
      scheduled_start_time: input.scheduled_start ?? null,
      status: "scheduled",
    };
    
    console.log("🧪 createShow INSERT PAYLOAD:", insertPayload);
    console.log("🧪 seller_id being inserted:", input.seller_id);
    
    const { data, error } = await supabase
      .from("shows")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.warn("createShow failed:", error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.warn("createShow unexpected error:", err);
    return null;
  }
}

