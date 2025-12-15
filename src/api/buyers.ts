/**
 * Buyers API
 *
 * Provides queries and mutations for buyer profile data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface BuyerProfile {
  id: string;
  user_id: string;
  full_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  profile_image_url?: string;
  safety_agreement_accepted?: boolean;
  safety_agreement_accepted_at?: string;
  created_date?: string;
}

export interface CreateBuyerProfileInput {
  user_id: string;
  full_name: string;
  phone: string;
  email: string;
}

/**
 * Get the buyer profile for a given user ID.
 *
 * @param userId - The user ID to look up
 * @returns The buyer profile if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for logged-out users
 * - Returns null if no buyer profile exists
 * - Returns null on any error
 */
export async function getBuyerProfileByUserId(
  userId: string | null
): Promise<BuyerProfile | null> {
  if (!userId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("buyer_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch buyer profile by user ID:", error.message);
      return null;
    }

    return data as BuyerProfile | null;
  } catch (err) {
    console.warn("Unexpected error fetching buyer profile:", err);
    return null;
  }
}

/**
 * Get a buyer profile by profile ID.
 *
 * @param profileId - The buyer profile ID to look up
 * @returns The buyer profile if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null if profileId is null
 * - Returns null if no buyer profile exists
 * - Returns null on any error
 */
export async function getBuyerProfileById(
  profileId: string | null
): Promise<BuyerProfile | null> {
  if (!profileId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("buyer_profiles")
      .select("*")
      .eq("id", profileId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch buyer profile by ID:", error.message);
      return null;
    }

    return data as BuyerProfile | null;
  } catch (err) {
    console.warn("Unexpected error fetching buyer profile by ID:", err);
    return null;
  }
}

/**
 * Create a new buyer profile.
 *
 * @param input - The buyer profile data to create
 * @returns The created profile, or null on error
 *
 * This function:
 * - Never throws
 * - Returns null on any error
 */
export async function createBuyerProfile(
  input: CreateBuyerProfileInput
): Promise<BuyerProfile | null> {
  try {
    const { data, error } = await supabase
      .from("buyer_profiles")
      .insert({
        user_id: input.user_id,
        full_name: input.full_name,
        phone: input.phone,
        email: input.email,
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create buyer profile:", error.message);
      return null;
    }

    return data as BuyerProfile;
  } catch (err) {
    console.warn("Unexpected error creating buyer profile:", err);
    return null;
  }
}

