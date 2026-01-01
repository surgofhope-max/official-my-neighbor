/**
 * Bookmarked Shows API
 *
 * Provides queries for user's bookmarked shows.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface BookmarkedShow {
  id: string;
  user_id: string;
  show_id: string;
  created_at?: string;
  shows?: Show | null;
}

export interface Show {
  id: string;
  seller_id: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  status?: string;
  stream_status?: string;
  scheduled_start_time?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  created_at?: string;
}

/**
 * Get all bookmarked shows for a specific user.
 *
 * @param userId - The user's auth ID (auth.users.id)
 * @returns Array of bookmarked_shows rows with joined shows
 *
 * This function:
 * - Never throws
 * - Returns [] for null/empty userId
 * - Returns [] on any error
 */
export async function getBookmarkedShowsByUserId(
  userId: string | null
): Promise<BookmarkedShow[]> {
  if (!userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("bookmarked_shows")
      .select("*, shows(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch bookmarked shows by user ID:", error.message);
      return [];
    }

    return (data as BookmarkedShow[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching bookmarked shows:", err);
    return [];
  }
}

