/**
 * Seller Batches API
 *
 * Provides read-only queries for seller batch data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface SellerBatch {
  id: string;
  buyer_user_id: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  seller_id: string;
  show_id: string;
  show_title?: string;
  status: "pending" | "ready" | "partial" | "completed" | "cancelled";
  total_items: number;
  total_amount: number;
  completion_code?: string;
  pickup_location?: string;
  pickup_notes?: string;
  created_date?: string;
  completed_at?: string;
  completed_by?: string;
}

/**
 * Get all batches for a given seller ID.
 *
 * @param sellerId - The seller ID to look up batches for
 * @returns Array of batches, sorted by created_date DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null sellerId
 * - Returns [] on any error
 */
export async function getBatchesBySellerId(
  sellerId: string | null
): Promise<SellerBatch[]> {
  if (!sellerId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch batches by seller ID:", error.message);
      return [];
    }

    return (data as SellerBatch[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching seller batches:", err);
    return [];
  }
}

/**
 * Get a single batch by ID (for seller context).
 *
 * @param batchId - The batch ID to look up
 * @returns The batch if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for null batchId
 * - Returns null on any error
 */
export async function getSellerBatchById(
  batchId: string | null
): Promise<SellerBatch | null> {
  if (!batchId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch batch by ID:", error.message);
      return null;
    }

    return data as SellerBatch | null;
  } catch (err) {
    console.warn("Unexpected error fetching batch:", err);
    return null;
  }
}







