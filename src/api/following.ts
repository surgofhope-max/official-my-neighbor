/**
 * Following API
 *
 * Provides queries for sellers that a user follows.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface FollowedSellerWithSeller {
  id: string;
  buyer_id: string;
  seller_id: string;
  created_at?: string;
  sellers?: Seller | null;
}

export interface Seller {
  id: string;
  user_id: string;
  business_name?: string;
  bio?: string;
  profile_image_url?: string;
  background_image_url?: string;
  status: "pending" | "approved" | "declined" | "suspended";
  stripe_account_id?: string;
  stripe_connected?: boolean;
  created_at?: string;
}

/**
 * Get all sellers that a user is following.
 *
 * @param userId - The user's auth ID (auth.users.id)
 * @returns Array of followed_sellers rows with joined sellers
 *
 * This function:
 * - Never throws
 * - Returns [] for null/empty userId
 * - Returns [] on any error
 */
export async function getFollowingByUserId(
  userId: string | null
): Promise<FollowedSellerWithSeller[]> {
  if (!userId) {
    return [];
  }

  try {
    // Resolve buyer_profiles.id from auth.users.id
    // followed_sellers.buyer_id references buyer_profiles.id (NOT auth.users.id)
    const { data: buyerProfile, error: buyerError } = await supabase
      .from("buyer_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (buyerError || !buyerProfile) {
      return [];
    }

    const { data, error } = await supabase
      .from("followed_sellers")
      .select("*, sellers(*)")
      .eq("buyer_id", buyerProfile.id)
      .order("created_at", { ascending: false });

    if (error) {
      return [];
    }

    return (data as FollowedSellerWithSeller[]) ?? [];
  } catch (err) {
    return [];
  }
}

