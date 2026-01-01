/**
 * Batches API
 *
 * Provides queries and mutations for batch data.
 * Batches group orders by buyer + show.
 *
 * Schema (Supabase `batches` table):
 * - id (uuid)
 * - buyer_id (uuid) — FK to public.users.id
 * - seller_id (uuid)
 * - show_id (uuid)
 * - batch_number (text)
 * - completion_code (text)
 * - status (text)
 * - total_items (integer)
 * - total_amount (numeric)
 * - completed_at (timestamptz)
 * - completed_by (text)
 * - created_at (timestamptz)
 * - updated_at (timestamptz)
 *
 * IDENTITY MODEL:
 * - public.users.id === auth.users.id (same UUID)
 * - auth_user_id maps DIRECTLY to buyer_id
 * - public.users row is guaranteed at signup/login via auth trigger
 * - No client-side identity provisioning required
 */

import { supabase } from "@/lib/supabase/supabaseClient";
import { emitAnalyticsEvent } from "./fulfillment";

// TEMP DEBUG FLAG — set to false to silence debug logs
const DEBUG_BATCH = true;

export interface Batch {
  id: string;
  buyer_id: string;
  seller_id: string;
  show_id: string;
  batch_number?: string;
  completion_code?: string;
  status: "pending" | "active" | "ready" | "completed" | "picked_up" | "cancelled";
  total_items: number;
  total_amount: number;
  completed_at?: string;
  completed_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateBatchInput {
  /** The auth.users.id — maps directly to public.users.id / buyer_id */
  auth_user_id: string;
  seller_id: string;
  show_id: string;
  batch_number: string;
  completion_code: string;
}

export interface UpdateBatchInput {
  total_items?: number;
  total_amount?: number;
  status?: Batch["status"];
  completed_at?: string;
}

/**
 * Get all batches for a given buyer.
 *
 * @param authUserId - The buyer's auth.users.id (= public.users.id)
 * @returns Array of batches, sorted by created_at DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null userId
 * - Returns [] on any error
 */
export async function getBatchesByBuyerId(
  authUserId: string | null
): Promise<Batch[]> {
  if (!authUserId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("buyer_id", authUserId)
      .order("created_at", { ascending: false });

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
 * @param authUserId - The buyer's auth.users.id (= public.users.id)
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
  authUserId: string | null,
  sellerId: string | null,
  showId: string | null
): Promise<Batch | null> {
  if (DEBUG_BATCH) {
    console.log("[BATCH] findActiveBatch called", {
      authUserId,
      sellerId,
      showId,
    });
  }

  if (!authUserId || !sellerId || !showId) {
    if (DEBUG_BATCH) console.log("[BATCH] findActiveBatch: missing params, returning null");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("buyer_id", authUserId)
      .eq("seller_id", sellerId)
      .eq("show_id", showId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (DEBUG_BATCH) console.error("[BATCH] findActiveBatch error:", error);
      console.warn("Failed to find active batch:", error.message);
      return null;
    }

    if (DEBUG_BATCH) {
      console.log("[BATCH] findActiveBatch result:", data ? "FOUND" : "NOT FOUND", data?.id);
    }

    return data as Batch | null;
  } catch (err) {
    if (DEBUG_BATCH) console.error("[BATCH] findActiveBatch exception:", err);
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
  const payload = {
    buyer_id: input.auth_user_id,
    seller_id: input.seller_id,
    show_id: input.show_id,
    batch_number: input.batch_number,
    completion_code: input.completion_code,
    status: "active",
    total_items: 0,
    total_amount: 0,
  };

  if (DEBUG_BATCH) {
    console.log("[BATCH] createBatch called with input:", input);
    console.log("[BATCH] createBatch INSERT payload:", payload);
    console.log("[BATCH] createBatch buyer_id value:", payload.buyer_id, "type:", typeof payload.buyer_id);
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (DEBUG_BATCH) {
        console.error("[BATCH] createBatch FAILED:", {
          errorMessage: error.message,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
          fullError: error,
        });
      }
      console.warn("Failed to create batch:", error.message);
      return null;
    }

    if (DEBUG_BATCH) {
      console.log("[BATCH] createBatch SUCCESS:", data?.id);
    }

    return data as Batch;
  } catch (err) {
    if (DEBUG_BATCH) console.error("[BATCH] createBatch exception:", err);
    console.warn("Unexpected error creating batch:", err);
    return null;
  }
}

/**
 * Update an existing batch.
 *
 * @param batchId - The batch ID to update
 * @param updates - The fields to update (total_items, total_amount, status, completed_at)
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

  if (DEBUG_BATCH) {
    console.log("[BATCH] updateBatch called:", { batchId, updates });
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .update(updates)
      .eq("id", batchId)
      .select()
      .single();

    if (error) {
      if (DEBUG_BATCH) console.error("[BATCH] updateBatch FAILED:", error);
      console.warn("Failed to update batch:", error.message);
      return null;
    }

    if (DEBUG_BATCH) console.log("[BATCH] updateBatch SUCCESS:", data?.id);

    return data as Batch;
  } catch (err) {
    if (DEBUG_BATCH) console.error("[BATCH] updateBatch exception:", err);
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
 * - Never throws (catches and returns null batch)
 * - Returns null batch on any error
 */
export async function findOrCreateBatch(
  input: CreateBatchInput
): Promise<{ batch: Batch | null; isNew: boolean }> {
  if (DEBUG_BATCH) {
    console.log("[BATCH] ========================================");
    console.log("[BATCH] findOrCreateBatch START");
    console.log("[BATCH] input:", JSON.stringify(input, null, 2));
    console.log("[BATCH] auth_user_id:", input.auth_user_id);
    console.log("[BATCH] seller_id:", input.seller_id);
    console.log("[BATCH] show_id:", input.show_id);
  }

  // First, try to find an existing active batch
  const existingBatch = await findActiveBatch(
    input.auth_user_id,
    input.seller_id,
    input.show_id
  );

  if (existingBatch) {
    if (DEBUG_BATCH) {
      console.log("[BATCH] findOrCreateBatch: FOUND existing batch:", existingBatch.id);
      console.log("[BATCH] ========================================");
    }
    return { batch: existingBatch, isNew: false };
  }

  if (DEBUG_BATCH) {
    console.log("[BATCH] findOrCreateBatch: No existing batch, creating new...");
  }

  // No active batch found, create a new one
  const newBatch = await createBatch(input);

  if (DEBUG_BATCH) {
    console.log("[BATCH] findOrCreateBatch END:", newBatch ? "SUCCESS" : "FAILED");
    console.log("[BATCH] ========================================");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS: Emit batch_created event (fail-open, non-blocking)
  // Emits ONLY when a NEW batch is created, NOT when existing batch is reused
  // ─────────────────────────────────────────────────────────────────────────
  if (newBatch) {
    emitAnalyticsEvent("batch_created", {
      batch_id: newBatch.id,
      buyer_id: input.auth_user_id,
      seller_id: input.seller_id,  // Entity ID (public.sellers.id)
      seller_user_id: null,        // Not available at batch creation
      show_id: input.show_id,
      actor_user_id: input.auth_user_id,  // Buyer is the actor
    });
  }

  return { batch: newBatch, isNew: true };
}
