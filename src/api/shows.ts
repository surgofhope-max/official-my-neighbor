/**
 * Shows API
 *
 * Provides read-only queries for show data.
 *
 * SECURITY: Field lists are audience-scoped to prevent exposure of sensitive IVS credentials.
 * - PUBLIC: Viewers, buyers, discovery pages
 * - SELLER: Show owners only (includes ingest details)
 * - ADMIN: Full access for admin dashboards
 */

import { supabase } from "@/lib/supabase/supabaseClient";

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL FIELD LISTS — Audience-scoped to prevent credential exposure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PUBLIC fields — Safe for viewers, buyers, discovery pages.
 * Matches exact columns in public.shows table.
 */
export const SHOWS_PUBLIC_FIELDS = `
  id,
  seller_id,
  title,
  description,
  status,
  scheduled_start_time,
  started_at,
  ended_at,
  community_id,
  featured_product_id,
  viewer_count,
  pickup_instructions,
  stream_status,
  thumbnail_url,
  sales_count
`.replace(/\s+/g, '');

/**
 * SELLER fields — For show owners.
 * Matches exact columns in public.shows table + timestamps.
 */
export const SHOWS_SELLER_FIELDS = `
  id,
  seller_id,
  title,
  description,
  status,
  scheduled_start_time,
  started_at,
  ended_at,
  community_id,
  featured_product_id,
  viewer_count,
  pickup_instructions,
  stream_status,
  thumbnail_url,
  created_at,
  updated_at,
  sales_count
`.replace(/\s+/g, '');

/**
 * ADMIN fields — Full access for admin dashboards.
 * Use "*" for complete row access.
 */
export const SHOWS_ADMIN_FIELDS = "*";

export interface Show {
  id: string;
  /** References sellers.id (NOT users.id) */
  seller_id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  stream_url?: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  // FIX: Use actual DB column name (was scheduled_start, but DB uses scheduled_start_time)
  scheduled_start_time?: string;
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

  // Sales tracking
  sales_count?: number;           // Number of orders for this show

  // Bookmark tracking (computed, not stored in DB)
  bookmark_count?: number;        // Number of users who bookmarked this show
}

/**
 * Get all shows (PUBLIC context).
 *
 * @returns Array of all shows, sorted by scheduled_start DESC
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Uses PUBLIC field list (no sensitive IVS credentials)
 */
export async function getAllShows(): Promise<Show[]> {
  try {
    const { data, error } = await supabase
      .from("shows")
      .select(SHOWS_PUBLIC_FIELDS)
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
 * Get shows for a specific seller (SELLER context).
 *
 * @param sellerId - The seller ID to filter by
 * @returns Array of shows for the seller, sorted by scheduled_start DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null sellerId
 * - Returns [] on any error
 * - Uses SELLER field list (includes ingest details for broadcasting)
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
      .select(SHOWS_SELLER_FIELDS)
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
 * Get a single show by ID (PUBLIC context).
 *
 * @param showId - The show ID to look up
 * @returns The show if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for null showId
 * - Returns null on any error
 * - Uses PUBLIC field list (no sensitive IVS credentials)
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
      .select(SHOWS_PUBLIC_FIELDS)
      .eq("id", showId)
      .maybeSingle();

    // AUDIT LOG - TEMPORARY
    console.log("[SHOW_QUERY_AUDIT]", {
      source: "getShowById (src/api/shows.ts)",
      selectedColumns: SHOWS_PUBLIC_FIELDS,
      showIdRequested: showId,
      showIdReturned: data?.id,
      sales_count: data?.sales_count,
      updated_at: data?.updated_at,
      error: error?.message || null,
      rawData: data
    });

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
 * Get shows by status (PUBLIC context).
 *
 * @param status - The status to filter by
 * @returns Array of shows with the given status
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Uses PUBLIC field list (no sensitive IVS credentials)
 */
export async function getShowsByStatus(
  status: "scheduled" | "live" | "ended" | "cancelled"
): Promise<Show[]> {
  try {
    const { data, error } = await supabase
      .from("shows")
      .select(SHOWS_PUBLIC_FIELDS)
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
 * Get scheduled (upcoming) shows with bookmark counts.
 *
 * @returns Array of scheduled shows with bookmark_count
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Includes bookmark_count (defaults to 0)
 */
export async function getScheduledShows(): Promise<Show[]> {
  const shows = await getShowsByStatus("scheduled");

  if (!shows.length) {
    return shows;
  }

  const ids = shows.map((s) => s.id).filter(Boolean);
  const bookmarkCountMap = await fetchBookmarkCounts(ids);

  return mergeBookmarkCountsIntoShows(shows, bookmarkCountMap);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REALTIME STATS MERGE LAYER
// Fetches viewer counts from show_realtime_stats and merges into Show objects.
// This is READ-ONLY and provides graceful fallback if stats table is empty.
// ═══════════════════════════════════════════════════════════════════════════════

interface ShowStats {
  viewer_count: number;
  max_viewers: number;
}

/**
 * Internal helper: Fetch stats for multiple shows from show_realtime_stats.
 *
 * @param showIds - Array of show IDs to fetch stats for
 * @returns Map of show_id -> { viewer_count, max_viewers }
 *
 * This function:
 * - Never throws
 * - Returns empty Map on error (graceful fallback)
 * - Logs warning once on error
 */
async function fetchShowStats(
  showIds: string[]
): Promise<Map<string, ShowStats>> {
  const statsMap = new Map<string, ShowStats>();

  if (!showIds.length) {
    return statsMap;
  }

  try {
    const { data, error } = await supabase
      .from("show_realtime_stats")
      .select("show_id, viewer_count, max_viewers")
      .in("show_id", showIds);

    if (error) {
      console.warn("[fetchShowStats] Stats query failed (using fallback):", error.message);
      return statsMap;
    }

    if (data) {
      for (const row of data) {
        statsMap.set(row.show_id, {
          viewer_count: row.viewer_count ?? 0,
          max_viewers: row.max_viewers ?? 0,
        });
      }
    }

    return statsMap;
  } catch (err) {
    console.warn("[fetchShowStats] Unexpected error (using fallback):", err);
    return statsMap;
  }
}

/**
 * Merge stats into a list of shows.
 * Prefers show_realtime_stats.viewer_count, falls back to show.viewer_count, then 0.
 */
function mergeStatsIntoShows(shows: Show[], statsMap: Map<string, ShowStats>): Show[] {
  return shows.map((show) => {
    const stats = statsMap.get(show.id);
    return {
      ...show,
      viewer_count: stats?.viewer_count ?? show.viewer_count ?? 0,
      max_viewers: stats?.max_viewers ?? show.max_viewers,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKMARK COUNT MERGE LAYER
// Fetches bookmark counts from bookmarked_shows and merges into Show objects.
// This is READ-ONLY and provides graceful fallback if query fails.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Internal helper: Fetch bookmark counts for multiple shows.
 *
 * @param showIds - Array of show IDs to fetch bookmark counts for
 * @returns Map of show_id -> bookmark_count
 *
 * This function:
 * - Never throws
 * - Returns empty Map on error (graceful fallback)
 * - Logs warning once on error
 */
async function fetchBookmarkCounts(
  showIds: string[]
): Promise<Map<string, number>> {
  const countMap = new Map<string, number>();

  if (!showIds.length) {
    return countMap;
  }

  try {
    // Query bookmark counts grouped by show_id
    // Using a raw query pattern since Supabase JS doesn't support GROUP BY directly
    const { data, error } = await supabase
      .from("bookmarked_shows")
      .select("show_id")
      .in("show_id", showIds);

    if (error) {
      console.warn("[fetchBookmarkCounts] Query failed (using fallback):", error.message);
      return countMap;
    }

    if (data) {
      // Count occurrences of each show_id
      for (const row of data) {
        const currentCount = countMap.get(row.show_id) ?? 0;
        countMap.set(row.show_id, currentCount + 1);
      }
    }

    return countMap;
  } catch (err) {
    console.warn("[fetchBookmarkCounts] Unexpected error (using fallback):", err);
    return countMap;
  }
}

/**
 * Merge bookmark counts into a list of shows.
 * Adds bookmark_count field to each show (defaults to 0 if not found).
 */
function mergeBookmarkCountsIntoShows(
  shows: Show[],
  countMap: Map<string, number>
): Show[] {
  return shows.map((show) => ({
    ...show,
    bookmark_count: countMap.get(show.id) ?? 0,
  }));
}

/**
 * Get live shows with real-time stats and bookmark counts merged.
 *
 * @returns Array of live shows with viewer_count from show_realtime_stats and bookmark_count
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Falls back to shows.viewer_count if stats unavailable
 * - Includes bookmark_count (defaults to 0)
 */
export async function getLiveShowsWithStats(): Promise<Show[]> {
  const shows = await getLiveShows();

  if (!shows.length) {
    return shows;
  }

  const ids = shows.map((s) => s.id).filter(Boolean);

  // Fetch stats and bookmark counts in parallel
  const [statsMap, bookmarkCountMap] = await Promise.all([
    fetchShowStats(ids),
    fetchBookmarkCounts(ids),
  ]);

  const withStats = mergeStatsIntoShows(shows, statsMap);
  return mergeBookmarkCountsIntoShows(withStats, bookmarkCountMap);
}

/**
 * Get scheduled shows with real-time stats merged.
 *
 * @returns Array of scheduled shows with viewer_count from show_realtime_stats
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Falls back to shows.viewer_count if stats unavailable
 */
export async function getScheduledShowsWithStats(): Promise<Show[]> {
  const shows = await getScheduledShows();

  if (!shows.length) {
    return shows;
  }

  const ids = shows.map((s) => s.id).filter(Boolean);
  const statsMap = await fetchShowStats(ids);

  return mergeStatsIntoShows(shows, statsMap);
}

/**
 * Get a single show by ID with real-time stats merged.
 *
 * @param showId - The show ID to look up
 * @returns The show with viewer_count from show_realtime_stats, or null
 *
 * This function:
 * - Never throws
 * - Returns null for null showId or not found
 * - Falls back to show.viewer_count if stats unavailable
 */
export async function getShowByIdWithStats(
  showId: string | null
): Promise<Show | null> {
  const show = await getShowById(showId);

  if (!show) {
    return null;
  }

  const statsMap = await fetchShowStats([show.id]);
  const stats = statsMap.get(show.id);

  return {
    ...show,
    viewer_count: stats?.viewer_count ?? show.viewer_count ?? 0,
    max_viewers: stats?.max_viewers ?? show.max_viewers,
  };
}

/**
 * Create a new show.
 * 
 * @param input.seller_id - Must be sellers.id (NOT users.id)
 * @param input.community_id - Optional community ID (FK to communities.id)
 * @param input.thumbnail_url - Optional thumbnail image URL
 */
export async function createShow(input: {
  /** Must be sellers.id (NOT users.id) */
  seller_id: string;
  title: string;
  description?: string;
  pickup_instructions?: string;
  scheduled_start?: string;
  /** Optional community ID (FK to public.communities.id) */
  community_id?: string | null;
  /** Optional thumbnail image URL */
  thumbnail_url?: string | null;
}) {
  try {
    // Fetch seller's IVS profile (non-blocking)
    let ivs_channel_arn: string | null = null;
    let ivs_playback_url: string | null = null;

    try {
      const { data: sellerProfile } = await supabase
        .from("seller_streaming_profiles")
        .select("ivs_channel_arn, ivs_playback_url")
        .eq("seller_id", input.seller_id)
        .maybeSingle();

      if (sellerProfile?.ivs_channel_arn) {
        ivs_channel_arn = sellerProfile.ivs_channel_arn;
        ivs_playback_url = sellerProfile.ivs_playback_url ?? null;
        console.log("🎬 createShow: Attaching seller IVS channel:", ivs_channel_arn);
      }
    } catch (profileErr) {
      console.warn("createShow: Failed to fetch seller IVS profile (non-blocking):", profileErr);
    }

    const insertPayload: Record<string, unknown> = {
      seller_id: input.seller_id,
      title: input.title,
      description: input.description ?? null,
      pickup_instructions: input.pickup_instructions ?? null,
      scheduled_start_time: input.scheduled_start ?? null,
      status: "scheduled",
      stream_status: "starting",
      streaming_provider: null,  // Daily-first MVP: null allows HostConsole to set provider on Go Live
      community_id: input.community_id ?? null,  // STEP C4: Persist community_id
      thumbnail_url: input.thumbnail_url ?? null,  // PHASE S1: Persist thumbnail
    };

    // Attach IVS channel if seller has one provisioned
    if (ivs_channel_arn) {
      insertPayload.ivs_channel_arn = ivs_channel_arn;
      insertPayload.ivs_playback_url = ivs_playback_url;
    }
    
    console.log("🧪 createShow INSERT PAYLOAD:", insertPayload);
    console.log("🧪 seller_id being inserted:", input.seller_id);
    console.log("🧪 community_id being inserted:", input.community_id ?? null);
    console.log("🧪 thumbnail_url being inserted:", input.thumbnail_url ?? null);
    console.log("🧪 ivs_channel_arn being inserted:", ivs_channel_arn ?? "(none)");
    
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

