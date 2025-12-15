/**
 * Batches API
 *
 * Provides queries and mutations for batch data.
 * Batches group orders by buyer + show.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface Batch {
  id: string;
  buyer_id?: string; // Legacy field name
  buyer_user_id?: string; // Newer field name
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  seller_id: string;
  show_id: string;
  show_title?: string;
  seller_name?: string;
  batch_number?: string;
  completion_code?: string;
  status: "pending" | "ready" | "completed" | "picked_up" | "cancelled";
  total_items: number;
  total_amount: number;
  pickup_notes?: string;
  pickup_location?: string;
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_zip?: string;
  created_date?: string;
  ready_at?: string;
  picked_up_at?: string;
}

export interface CreateBatchInput {
  buyer_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  seller_id: string;
  show_id: string;
  batch_number: string;
  completion_code: string;
  pickup_location?: string;
  pickup_notes?: string;
}

export interface UpdateBatchInput {
  total_items?: number;
  total_amount?: number;
  status?: Batch["status"];
}

/**
 * Get all batches for a given buyer user ID.
 *
 * @param buyerUserId - The buyer's user ID
 * @returns Array of batches, sorted by created_date DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null userId
 * - Returns [] on any error
 */
export async function getBatchesByBuyerId(
  buyerUserId: string | null
): Promise<Batch[]> {
  if (!buyerUserId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("buyer_user_id", buyerUserId)
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch batches by buyer ID:", error.message);
      return [];
    }

    return (data as Batch[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching batches:", err);
    return [];
  }
}

/**
 * Get a single batch by ID.
 *
 * @param batchId - The batch ID to look up
 * @returns The batch if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for null batchId
 * - Returns null on any error
 */
export async function getBatchById(
  batchId: string | null
): Promise<Batch | null> {
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

    return data as Batch | null;
  } catch (err) {
    console.warn("Unexpected error fetching batch:", err);
    return null;
  }
}

/**
 * Find an active batch for a buyer + seller + show combination.
 *
 * @param buyerId - The buyer's user ID
 * @param sellerId - The seller ID
 * @param showId - The show ID
 * @returns The active batch if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null if no active batch exists
 * - Returns null on any error
 */
export async function findActiveBatch(
  buyerId: string | null,
  sellerId: string | null,
  showId: string | null
): Promise<Batch | null> {
  if (!buyerId || !sellerId || !showId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("buyer_id", buyerId)
      .eq("seller_id", sellerId)
      .eq("show_id", showId)
      .neq("status", "completed")
      .neq("status", "picked_up")
      .order("created_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Failed to find active batch:", error.message);
      return null;
    }

    return data as Batch | null;
  } catch (err) {
    console.warn("Unexpected error finding active batch:", err);
    return null;
  }
}

/**
 * Create a new batch.
 *
 * @param input - The batch data to create
 * @returns The created batch, or null on error
 *
 * This function:
 * - Never throws
 * - Returns null on any error
 */
export async function createBatch(
  input: CreateBatchInput
): Promise<Batch | null> {
  try {
    const { data, error } = await supabase
      .from("batches")
      .insert({
        buyer_id: input.buyer_id,
        buyer_name: input.buyer_name,
        buyer_email: input.buyer_email,
        buyer_phone: input.buyer_phone,
        seller_id: input.seller_id,
        show_id: input.show_id,
        batch_number: input.batch_number,
        completion_code: input.completion_code,
        pickup_location: input.pickup_location || "",
        pickup_notes: input.pickup_notes || "",
        total_items: 0,
        total_amount: 0,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create batch:", error.message);
      return null;
    }

    return data as Batch;
  } catch (err) {
    console.warn("Unexpected error creating batch:", err);
    return null;
  }
}

/**
 * Update an existing batch.
 *
 * @param batchId - The batch ID to update
 * @param updates - The fields to update
 * @returns The updated batch, or null on error
 *
 * This function:
 * - Never throws
 * - Returns null on any error
 */
export async function updateBatch(
  batchId: string | null,
  updates: UpdateBatchInput
): Promise<Batch | null> {
  if (!batchId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .update(updates)
      .eq("id", batchId)
      .select()
      .single();

    if (error) {
      console.warn("Failed to update batch:", error.message);
      return null;
    }

    return data as Batch;
  } catch (err) {
    console.warn("Unexpected error updating batch:", err);
    return null;
  }
}

/**
 * Find or create a batch for checkout.
 *
 * @param input - The batch creation input
 * @returns An object with the batch and whether it was newly created
 *
 * This function:
 * - Never throws
 * - Returns null batch on any error
 */
export async function findOrCreateBatch(
  input: CreateBatchInput
): Promise<{ batch: Batch | null; isNew: boolean }> {
  // First, try to find an existing active batch
  const existingBatch = await findActiveBatch(
    input.buyer_id,
    input.seller_id,
    input.show_id
  );

  if (existingBatch) {
    return { batch: existingBatch, isNew: false };
  }

  // No active batch found, create a new one
  const newBatch = await createBatch(input);
  return { batch: newBatch, isNew: true };
}

