/**
 * Viewer Bans API
 *
 * Provides queries for seller viewer bans.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface ViewerBan {
  id: string;
  seller_id: string;
  viewer_id: string;
  ban_type: "chat" | "view" | "full";
  reason?: string;
  created_at?: string;
}

/**
 * Get all viewer bans for a specific seller.
 *
 * @param sellerId - The seller's entity ID (sellers.id)
 * @returns Array of viewer_bans rows
 *
 * This function:
 * - Never throws
 * - Returns [] for null/empty sellerId
 * - Returns [] on any error
 */
export async function getViewerBansBySellerId(
  sellerId: string | null
): Promise<ViewerBan[]> {
  if (!sellerId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("viewer_bans")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch viewer bans by seller ID:", error.message);
      return [];
    }

    return (data as ViewerBan[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching viewer bans:", err);
    return [];
  }
}












