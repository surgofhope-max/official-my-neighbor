/**
 * Seller Batches API
 *
 * Provides read-only queries for seller batch data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface SellerBatch {
  id: string;
  buyer_id: string;  // FIX: Correct column name (not buyer_user_id)
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
  created_at?: string;
  completed_at?: string;
  completed_by?: string;
  picked_up_at?: string;
}

/**
 * Get all batches for a given seller ID.
 *
 * @param sellerId - The seller entity ID (public.sellers.id)
 *                   NOTE: batches.seller_id uses seller entity id, NOT user id
 * @returns Array of batches, sorted by created_at DESC
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
      .order("created_at", { ascending: false });

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
 * Get all fulfillment batches for a specific show.
 *
 * Fulfillment batches are show-scoped but NOT show-lifecycle-scoped.
 * This means we return ALL batches for the show regardless of:
 * - Show status (live, ended, cancelled, scheduled)
 * - Batch completion status
 * - Analytics counts
 *
 * @param sellerId - The seller entity ID (public.sellers.id)
 *                   NOTE: batches.seller_id uses seller entity id, NOT user id
 * @param showId - The show ID to get batches for
 * @returns Array of batches for the show, sorted by created_at DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null sellerId or showId
 * - Returns [] on any error
 * - Does NOT filter by batch status — fulfillment visibility is unconditional
 */
export async function getFulfillmentBatchesForShow(
  sellerId: string | null,
  showId: string | null
): Promise<SellerBatch[]> {
  if (!sellerId || !showId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("show_id", showId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch fulfillment batches for show:", error.message);
      return [];
    }

    return (data as SellerBatch[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching fulfillment batches:", err);
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







