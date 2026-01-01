/**
 * Sellers API
 *
 * Provides read-only queries for seller data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface Seller {
  id: string;
  user_id: string;
  business_name: string;
  contact_phone?: string;
  contact_email?: string;
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_zip?: string;
  pickup_notes?: string;
  stripe_account_id?: string;
  stripe_connected?: boolean;
  stripe_connected_at?: string;
  status: "pending" | "approved" | "declined" | "suspended";
  status_reason?: string;
  profile_image_url?: string;
  bio?: string;
  total_sales?: number;
  total_revenue?: number;
  created_by?: string;
  created_date?: string;
  // Avatar inheritance fields (computed at fetch time)
  buyer_profile_image_url?: string;
  effective_profile_image_url?: string;
}

// Raw seller row with nested buyer_profile for join queries
interface SellerWithBuyerProfile {
  id: string;
  user_id: string;
  business_name: string;
  contact_phone?: string;
  contact_email?: string;
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_zip?: string;
  pickup_notes?: string;
  stripe_account_id?: string;
  stripe_connected?: boolean;
  stripe_connected_at?: string;
  status: "pending" | "approved" | "declined" | "suspended";
  status_reason?: string;
  profile_image_url?: string;
  bio?: string;
  total_sales?: number;
  total_revenue?: number;
  created_by?: string;
  created_date?: string;
  buyer_profiles?: { profile_image_url?: string } | null;
}

/**
 * Compute effective profile image with buyer fallback
 */
function computeEffectiveAvatar(raw: SellerWithBuyerProfile): Seller {
  const buyerAvatar = raw.buyer_profiles?.profile_image_url || null;
  const effective = raw.profile_image_url || buyerAvatar || undefined;
  
  // Remove the nested buyer_profiles from the result
  const { buyer_profiles, ...sellerFields } = raw;
  
  return {
    ...sellerFields,
    buyer_profile_image_url: buyerAvatar || undefined,
    effective_profile_image_url: effective,
    // Override profile_image_url with effective for backward compatibility
    profile_image_url: effective,
  };
}

/**
 * Get the seller record for a given user ID.
 *
 * @param userId - The user ID to look up
 * @returns The seller record if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for logged-out users
 * - Returns null if no seller record exists
 * - Returns null on any error
 * - Includes buyer avatar fallback via effective_profile_image_url
 */
export async function getSellerByUserId(
  userId: string | null
): Promise<Seller | null> {
  if (!userId) {
    return null;
  }

  try {
    // Fetch seller and buyer profile separately (no FK required)
    const [sellerRes, buyerRes] = await Promise.all([
      supabase
        .from("sellers")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("buyer_profiles")
        .select("profile_image_url")
        .eq("user_id", userId)
        .maybeSingle()
    ]);

    if (sellerRes.error) {
      console.warn("Failed to fetch seller by user ID:", sellerRes.error.message);
      return null;
    }

    if (!sellerRes.data) return null;
    
    // Attach buyer profile for avatar inheritance
    const raw: SellerWithBuyerProfile = {
      ...sellerRes.data,
      buyer_profiles: buyerRes.data || null
    };
    
    return computeEffectiveAvatar(raw);
  } catch (err) {
    console.warn("Unexpected error fetching seller:", err);
    return null;
  }
}

/**
 * Get a seller record by seller ID.
 *
 * @param sellerId - The seller ID to look up
 * @returns The seller record if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null if sellerId is null
 * - Returns null if no seller record exists
 * - Returns null on any error
 * - Includes buyer avatar fallback via effective_profile_image_url
 */
export async function getSellerById(
  sellerId: string | null
): Promise<Seller | null> {
  if (!sellerId) {
    return null;
  }

  try {
    // NORMALIZED: sellerId is sellers.id (not user_id)
    // First fetch seller, then buyer profile by user_id
    const { data: sellerData, error: sellerError } = await supabase
      .from("sellers")
      .select("*")
      .eq("id", sellerId)
      .maybeSingle();

    if (sellerError) {
      console.warn("Failed to fetch seller by ID:", sellerError.message);
      return null;
    }

    if (!sellerData) return null;
    
    // Fetch buyer profile for avatar inheritance
    const { data: buyerData } = await supabase
      .from("buyer_profiles")
      .select("profile_image_url")
      .eq("user_id", sellerData.user_id)
      .maybeSingle();
    
    // Attach buyer profile for avatar inheritance
    const raw: SellerWithBuyerProfile = {
      ...sellerData,
      buyer_profiles: buyerData || null
    };
    
    return computeEffectiveAvatar(raw);
  } catch (err) {
    console.warn("Unexpected error fetching seller by ID:", err);
    return null;
  }
}

/**
 * Get all sellers (for admin dashboard).
 *
 * @returns Array of all sellers, sorted by created_at DESC
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Intended for admin use only
 */
export async function getAllSellers(): Promise<Seller[]> {
  try {
    const { data, error } = await supabase
      .from("sellers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch all sellers:", error.message);
      return [];
    }

    return (data as Seller[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching all sellers:", err);
    return [];
  }
}







