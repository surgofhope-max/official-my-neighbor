/**
 * Followers API
 *
 * Provides queries for seller followers data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface FollowedSeller {
  id: string;
  buyer_id: string;
  seller_id: string;
  created_at?: string;
  buyer_profiles?: BuyerProfile | null;
}

export interface BuyerProfile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  profile_image_url?: string;
  created_at?: string;
}

/**
 * Get all followers for a specific seller.
 *
 * @param sellerId - The seller's entity ID (sellers.id)
 * @returns Array of followed_sellers rows with joined buyer_profiles
 *
 * This function:
 * - Never throws
 * - Returns [] for null/empty sellerId
 * - Returns [] on any error
 */
export async function getFollowersBySellerId(
  sellerId: string | null
): Promise<FollowedSeller[]> {
  if (!sellerId) {
    return [];
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // [FOLLOWERS API AUDIT] — TEMPORARY LOGGING (REMOVE AFTER DEBUG)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FOLLOWERS API] Querying for seller_id:', sellerId);
    
    const { data, error } = await supabase
      .from("followed_sellers")
      .select("*, buyer_profiles(*)")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    console.log('[FOLLOWERS API] Query result:', { data, error, count: data?.length });

    if (error) {
      console.warn("Failed to fetch followers by seller ID:", error.message, error);
      return [];
    }

    return (data as FollowedSeller[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching followers:", err);
    return [];
  }
}

