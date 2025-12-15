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
 */
export async function getSellerByUserId(
  userId: string | null
): Promise<Seller | null> {
  if (!userId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("sellers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch seller by user ID:", error.message);
      return null;
    }

    return data as Seller | null;
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
 */
export async function getSellerById(
  sellerId: string | null
): Promise<Seller | null> {
  if (!sellerId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("sellers")
      .select("*")
      .eq("id", sellerId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch seller by ID:", error.message);
      return null;
    }

    return data as Seller | null;
  } catch (err) {
    console.warn("Unexpected error fetching seller by ID:", err);
    return null;
  }
}







