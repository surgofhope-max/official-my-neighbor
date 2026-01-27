/**
 * Followed Communities API
 *
 * Provides queries for user's followed communities.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface FollowedCommunity {
  id: string;
  user_id: string;
  community_id: string;
  created_at?: string;
  communities?: Community | null;
}

export interface Community {
  id: string;
  name: string;
  label?: string;
  description?: string;
  icon?: string;
  image_url?: string;
  created_at?: string;
}

/**
 * Get all followed communities for a specific user.
 *
 * @param userId - The user's auth ID (auth.users.id)
 * @returns Array of followed_communities rows with joined communities
 *
 * This function:
 * - Never throws
 * - Returns [] for null/empty userId
 * - Returns [] on any error
 */
export async function getFollowedCommunitiesByUserId(
  userId: string | null
): Promise<FollowedCommunity[]> {
  if (!userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("followed_communities")
      .select("*, communities(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch followed communities by user ID:", error.message);
      return [];
    }

    return (data as FollowedCommunity[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching followed communities:", err);
    return [];
  }
}













