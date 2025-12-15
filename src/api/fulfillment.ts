/**
 * Fulfillment API
 *
 * Provides seller-side order fulfillment operations:
 * - Pickup verification via completion code
 * - Batch status transitions (pending → ready → picked_up)
 * - Order status updates
 */

import { supabase } from "@/lib/supabase/supabaseClient";
import type { Batch } from "./batches";
import type { Order } from "./orders";

// Fulfillment error types
export type FulfillmentErrorType =
  | "INVALID_CODE"
  | "BATCH_NOT_FOUND"
  | "UNAUTHORIZED"
  | "INVALID_TRANSITION"
  | "ALREADY_COMPLETED"
  | "UNKNOWN_ERROR";

export interface FulfillmentError {
  type: FulfillmentErrorType;
  message: string;
}

export interface FulfillmentResult<T> {
  data: T | null;
  error: FulfillmentError | null;
}

export interface BatchWithOrders extends Batch {
  orders: Order[];
}

// Valid batch status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [], // Terminal state
  completed: [], // Terminal state
  cancelled: [], // Terminal state
};

/**
 * Get all batches for a seller (for fulfillment dashboard).
 *
 * @param sellerId - The seller's ID
 * @returns Array of batches with their orders
 */
export async function getBatchesForSeller(
  sellerId: string | null
): Promise<Batch[]> {
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
      console.warn("Failed to fetch seller batches:", error.message);
      return [];
    }

    return (data as Batch[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching seller batches:", err);
    return [];
  }
}

/**
 * Get batches for a specific show (for HostConsole).
 *
 * @param showId - The show ID
 * @param sellerId - The seller's ID (for authorization)
 * @returns Array of batches for the show
 */
export async function getBatchesForShow(
  showId: string | null,
  sellerId: string | null
): Promise<Batch[]> {
  if (!showId || !sellerId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("show_id", showId)
      .eq("seller_id", sellerId)
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch show batches:", error.message);
      return [];
    }

    return (data as Batch[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching show batches:", err);
    return [];
  }
}

/**
 * Get orders for a batch.
 *
 * @param batchId - The batch ID
 * @returns Array of orders in the batch
 */
export async function getOrdersForBatch(
  batchId: string | null
): Promise<Order[]> {
  if (!batchId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_date", { ascending: true });

    if (error) {
      console.warn("Failed to fetch batch orders:", error.message);
      return [];
    }

    return (data as Order[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching batch orders:", err);
    return [];
  }
}

/**
 * Verify pickup code and complete batch pickup.
 *
 * @param completionCode - The 9-digit completion code from buyer
 * @param sellerId - The seller's ID (for authorization)
 * @param isAdmin - Whether the user is an admin (for override)
 * @returns The completed batch or error
 */
export async function verifyPickupCode(
  completionCode: string,
  sellerId: string | null,
  isAdmin: boolean = false
): Promise<FulfillmentResult<BatchWithOrders>> {
  if (!completionCode || completionCode.length < 6) {
    return {
      data: null,
      error: {
        type: "INVALID_CODE",
        message: "Please enter a valid completion code",
      },
    };
  }

  if (!sellerId && !isAdmin) {
    return {
      data: null,
      error: {
        type: "UNAUTHORIZED",
        message: "Seller authorization required",
      },
    };
  }

  try {
    // Find batch by completion code
    let query = supabase
      .from("batches")
      .select("*")
      .eq("completion_code", completionCode);

    // Non-admin sellers can only see their own batches
    if (!isAdmin && sellerId) {
      query = query.eq("seller_id", sellerId);
    }

    const { data: batches, error: batchError } = await query;

    if (batchError) {
      console.warn("Failed to find batch:", batchError.message);
      return {
        data: null,
        error: {
          type: "BATCH_NOT_FOUND",
          message: "No batch found with this code",
        },
      };
    }

    if (!batches || batches.length === 0) {
      return {
        data: null,
        error: {
          type: "INVALID_CODE",
          message: "Invalid completion code. Please check and try again.",
        },
      };
    }

    const batch = batches[0] as Batch;

    // Check if already completed
    if (batch.status === "picked_up" || batch.status === "completed") {
      return {
        data: null,
        error: {
          type: "ALREADY_COMPLETED",
          message: "This batch has already been picked up",
        },
      };
    }

    // Get orders for this batch
    const orders = await getOrdersForBatch(batch.id);

    return {
      data: { ...batch, orders },
      error: null,
    };
  } catch (err) {
    console.warn("Unexpected error verifying pickup code:", err);
    return {
      data: null,
      error: {
        type: "UNKNOWN_ERROR",
        message: "An unexpected error occurred",
      },
    };
  }
}

/**
 * Mark a batch as ready for pickup.
 *
 * @param batchId - The batch ID
 * @param sellerId - The seller's ID (for authorization)
 * @returns The updated batch or error
 */
export async function markBatchReady(
  batchId: string,
  sellerId: string
): Promise<FulfillmentResult<Batch>> {
  return updateBatchStatus(batchId, sellerId, "ready");
}

/**
 * Input for completing a batch pickup (Base44 parity).
 */
export interface CompleteBatchPickupInput {
  batchId: string;
  sellerId: string | null;
  sellerEmail: string;
  sellerName: string;
  isAdmin?: boolean;
}

/**
 * Result of completing a batch pickup (Base44 parity).
 */
export interface CompleteBatchPickupResult {
  batch: Batch | null;
  ordersUpdated: number;
  notificationSent: boolean;
  error: FulfillmentError | null;
}

/**
 * Complete a batch pickup following EXACT Base44 mutation order:
 * 
 * 1. Update EACH order:
 *    - status = "picked_up"
 *    - picked_up_at = now()
 *    - picked_up_by = seller.email
 * 
 * 2. Update batch:
 *    - status = "completed"
 *    - completed_at = now()
 *    - completed_by = seller.email
 * 
 * 3. Create review_request notification for buyer
 *
 * @param input - The completion input with seller details
 * @returns Result with updated batch, order count, and notification status
 */
export async function completeBatchPickup(
  input: CompleteBatchPickupInput
): Promise<CompleteBatchPickupResult> {
  const { batchId, sellerId, sellerEmail, sellerName, isAdmin = false } = input;

  if (!batchId) {
    return {
      batch: null,
      ordersUpdated: 0,
      notificationSent: false,
      error: {
        type: "BATCH_NOT_FOUND",
        message: "Batch ID is required",
      },
    };
  }

  try {
    // Fetch the batch first
    const { data: batch, error: fetchError } = await supabase
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (fetchError || !batch) {
      return {
        batch: null,
        ordersUpdated: 0,
        notificationSent: false,
        error: {
          type: "BATCH_NOT_FOUND",
          message: "Batch not found",
        },
      };
    }

    // Authorization check (admin can complete any batch)
    if (!isAdmin && batch.seller_id !== sellerId) {
      return {
        batch: null,
        ordersUpdated: 0,
        notificationSent: false,
        error: {
          type: "UNAUTHORIZED",
          message: "You are not authorized to complete this batch",
        },
      };
    }

    // Validate status transition
    const currentStatus = batch.status;
    if (currentStatus === "picked_up" || currentStatus === "completed") {
      return {
        batch: null,
        ordersUpdated: 0,
        notificationSent: false,
        error: {
          type: "ALREADY_COMPLETED",
          message: "This batch has already been completed",
        },
      };
    }

    const now = new Date().toISOString();
    const completedBy = sellerEmail;

    // ─────────────────────────────────────────────────────────────────────
    // STEP A: Update EACH order in batch (Base44 order)
    // ─────────────────────────────────────────────────────────────────────
    const { data: updatedOrders, error: ordersError } = await supabase
      .from("orders")
      .update({
        status: "picked_up",
        picked_up_at: now,
        picked_up_by: completedBy,
      })
      .eq("batch_id", batchId)
      .in("status", ["paid", "ready"])
      .select();

    if (ordersError) {
      console.warn("Failed to update orders:", ordersError.message);
    }

    const ordersUpdated = updatedOrders?.length || 0;
    const firstOrder = updatedOrders?.[0];

    // ─────────────────────────────────────────────────────────────────────
    // STEP B: Update batch to "completed" (Base44 uses "completed", not "picked_up")
    // ─────────────────────────────────────────────────────────────────────
    const { data: updatedBatch, error: updateError } = await supabase
      .from("batches")
      .update({
        status: "completed",
        picked_up_at: now, // Also set picked_up_at for compatibility
      })
      .eq("id", batchId)
      .select()
      .single();

    if (updateError) {
      console.warn("Failed to complete batch:", updateError.message);
      return {
        batch: null,
        ordersUpdated,
        notificationSent: false,
        error: {
          type: "UNKNOWN_ERROR",
          message: "Failed to complete batch pickup",
        },
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP C: Create notifications for buyer (Base44 parity)
    // ─────────────────────────────────────────────────────────────────────
    let notificationSent = false;
    
    // Get buyer_id from batch (could be buyer_id or buyer_user_id)
    const buyerUserId = batch.buyer_user_id || batch.buyer_id;
    
    if (buyerUserId && firstOrder) {
      try {
        // C.1: Create "Order Completed" notification (order_update type)
        // Check for existing to ensure idempotency
        const { data: existingOrderNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", buyerUserId)
          .eq("type", "order_update")
          .contains("metadata", { batch_id: batchId, event: "order_completed" })
          .maybeSingle();

        if (!existingOrderNotif) {
          await supabase
            .from("notifications")
            .insert({
              user_id: buyerUserId,
              title: "Order Completed",
              body: `Your order from ${sellerName} has been marked picked up.`,
              type: "order_update",
              metadata: {
                seller_id: batch.seller_id,
                seller_name: sellerName,
                order_id: firstOrder.id,
                batch_id: batchId,
                event: "order_completed",
              },
              read: false,
              read_at: null,
            });
        }

        // C.2: Create "Leave a Review" notification (review_request type)
        // Check for existing to ensure idempotency
        const { data: existingReviewNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", buyerUserId)
          .eq("type", "review_request")
          .contains("metadata", { batch_id: batchId })
          .maybeSingle();

        if (!existingReviewNotif) {
          const { error: notifError } = await supabase
            .from("notifications")
            .insert({
              user_id: buyerUserId,
              title: "Leave a Review",
              body: `Your order from ${sellerName} is complete. Tap to leave a review.`,
              type: "review_request",
              metadata: {
                seller_id: batch.seller_id,
                seller_name: sellerName,
                order_id: firstOrder.id,
                batch_id: batchId,
              },
              read: false,
              read_at: null,
            });

          if (notifError) {
            console.warn("Failed to create review notification:", notifError.message);
          } else {
            notificationSent = true;
          }
        }
      } catch (notifErr) {
        console.warn("Unexpected error creating notification:", notifErr);
      }
    }

    // Log admin override for audit
    if (isAdmin && sellerId !== batch.seller_id) {
      console.log(
        `[AUDIT] Admin (${sellerEmail}) completed batch ${batchId} for seller ${batch.seller_id}`
      );
    }

    return {
      batch: updatedBatch as Batch,
      ordersUpdated,
      notificationSent,
      error: null,
    };
  } catch (err) {
    console.warn("Unexpected error completing batch:", err);
    return {
      batch: null,
      ordersUpdated: 0,
      notificationSent: false,
      error: {
        type: "UNKNOWN_ERROR",
        message: "An unexpected error occurred",
      },
    };
  }
}

/**
 * Auto-sync healing: Fix orders in completed batches that are still "paid".
 * 
 * Base44 behavior: Every 5 seconds, for each batch where status === "completed":
 * If ANY order.status === "paid", auto-update those orders:
 *   - status = "picked_up"
 *   - picked_up_at = batch.completed_at (or batch.picked_up_at)
 *   - picked_up_by = "auto-sync"
 *
 * @param sellerId - The seller's ID to scope the sync
 * @returns Number of orders healed
 */
export async function autoSyncHealOrders(
  sellerId: string | null
): Promise<number> {
  if (!sellerId) {
    return 0;
  }

  try {
    // Find completed batches with orders still in "paid" status
    const { data: batches, error: batchError } = await supabase
      .from("batches")
      .select("id, picked_up_at")
      .eq("seller_id", sellerId)
      .eq("status", "completed");

    if (batchError || !batches || batches.length === 0) {
      return 0;
    }

    let totalHealed = 0;

    for (const batch of batches) {
      const { data: healedOrders, error: healError } = await supabase
        .from("orders")
        .update({
          status: "picked_up",
          picked_up_at: batch.picked_up_at || new Date().toISOString(),
          picked_up_by: "auto-sync",
        })
        .eq("batch_id", batch.id)
        .eq("status", "paid")
        .select();

      if (!healError && healedOrders) {
        totalHealed += healedOrders.length;
      }
    }

    if (totalHealed > 0) {
      console.log(`[AUTO-SYNC] Healed ${totalHealed} orders for seller ${sellerId}`);
    }

    return totalHealed;
  } catch (err) {
    console.warn("Unexpected error in auto-sync heal:", err);
    return 0;
  }
}

/**
 * Auto-sync healing for buyer side.
 * 
 * @param buyerId - The buyer's user ID
 * @returns Number of orders healed
 */
export async function autoSyncHealBuyerOrders(
  buyerId: string | null
): Promise<number> {
  if (!buyerId) {
    return 0;
  }

  try {
    // Find completed batches for this buyer
    const { data: batches, error: batchError } = await supabase
      .from("batches")
      .select("id, picked_up_at")
      .or(`buyer_id.eq.${buyerId},buyer_user_id.eq.${buyerId}`)
      .eq("status", "completed");

    if (batchError || !batches || batches.length === 0) {
      return 0;
    }

    let totalHealed = 0;

    for (const batch of batches) {
      const { data: healedOrders, error: healError } = await supabase
        .from("orders")
        .update({
          status: "picked_up",
          picked_up_at: batch.picked_up_at || new Date().toISOString(),
          picked_up_by: "auto-sync",
        })
        .eq("batch_id", batch.id)
        .eq("status", "paid")
        .select();

      if (!healError && healedOrders) {
        totalHealed += healedOrders.length;
      }
    }

    if (totalHealed > 0) {
      console.log(`[AUTO-SYNC] Healed ${totalHealed} orders for buyer ${buyerId}`);
    }

    return totalHealed;
  } catch (err) {
    console.warn("Unexpected error in buyer auto-sync heal:", err);
    return 0;
  }
}

/**
 * Update batch status with validation.
 *
 * @param batchId - The batch ID
 * @param sellerId - The seller's ID (for authorization)
 * @param newStatus - The new status to set
 * @returns The updated batch or error
 */
export async function updateBatchStatus(
  batchId: string,
  sellerId: string,
  newStatus: Batch["status"]
): Promise<FulfillmentResult<Batch>> {
  if (!batchId || !sellerId) {
    return {
      data: null,
      error: {
        type: "BATCH_NOT_FOUND",
        message: "Batch ID and seller ID are required",
      },
    };
  }

  try {
    // Fetch the batch first
    const { data: batch, error: fetchError } = await supabase
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .eq("seller_id", sellerId)
      .single();

    if (fetchError || !batch) {
      return {
        data: null,
        error: {
          type: "BATCH_NOT_FOUND",
          message: "Batch not found or unauthorized",
        },
      };
    }

    // Validate status transition
    const currentStatus = batch.status;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return {
        data: null,
        error: {
          type: "INVALID_TRANSITION",
          message: `Cannot change status from ${currentStatus} to ${newStatus}`,
        },
      };
    }

    // Build update payload
    const updates: Record<string, unknown> = {
      status: newStatus,
    };

    // Add timestamp based on new status
    if (newStatus === "ready") {
      updates.ready_at = new Date().toISOString();
    } else if (newStatus === "picked_up") {
      updates.picked_up_at = new Date().toISOString();
    }

    // Update batch
    const { data: updatedBatch, error: updateError } = await supabase
      .from("batches")
      .update(updates)
      .eq("id", batchId)
      .select()
      .single();

    if (updateError) {
      console.warn("Failed to update batch status:", updateError.message);
      return {
        data: null,
        error: {
          type: "UNKNOWN_ERROR",
          message: "Failed to update batch status",
        },
      };
    }

    // Update orders in batch to match
    if (newStatus === "ready" || newStatus === "picked_up") {
      const orderUpdates: Record<string, unknown> = {
        status: newStatus,
      };
      if (newStatus === "ready") {
        orderUpdates.ready_at = new Date().toISOString();
      } else if (newStatus === "picked_up") {
        orderUpdates.picked_up_at = new Date().toISOString();
      }

      await supabase
        .from("orders")
        .update(orderUpdates)
        .eq("batch_id", batchId)
        .in("status", ["paid", "ready"]); // Only update paid/ready orders
    }

    return {
      data: updatedBatch as Batch,
      error: null,
    };
  } catch (err) {
    console.warn("Unexpected error updating batch status:", err);
    return {
      data: null,
      error: {
        type: "UNKNOWN_ERROR",
        message: "An unexpected error occurred",
      },
    };
  }
}

/**
 * Mark an individual order as ready.
 *
 * @param orderId - The order ID
 * @param sellerId - The seller's ID (for authorization)
 * @returns The updated order or error
 */
export async function markOrderReady(
  orderId: string,
  sellerId: string
): Promise<FulfillmentResult<Order>> {
  if (!orderId || !sellerId) {
    return {
      data: null,
      error: {
        type: "BATCH_NOT_FOUND",
        message: "Order ID and seller ID are required",
      },
    };
  }

  try {
    const { data: order, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "ready",
        ready_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("seller_id", sellerId)
      .eq("status", "paid") // Can only mark paid orders as ready
      .select()
      .single();

    if (updateError) {
      console.warn("Failed to mark order ready:", updateError.message);
      return {
        data: null,
        error: {
          type: "UNKNOWN_ERROR",
          message: "Failed to mark order as ready",
        },
      };
    }

    return {
      data: order as Order,
      error: null,
    };
  } catch (err) {
    console.warn("Unexpected error marking order ready:", err);
    return {
      data: null,
      error: {
        type: "UNKNOWN_ERROR",
        message: "An unexpected error occurred",
      },
    };
  }
}

/**
 * Get fulfillment stats for a show.
 *
 * @param showId - The show ID
 * @param sellerId - The seller's ID
 * @returns Stats object with counts
 */
export async function getFulfillmentStats(
  showId: string | null,
  sellerId: string | null
): Promise<{
  totalBatches: number;
  pendingBatches: number;
  readyBatches: number;
  completedBatches: number;
  totalOrders: number;
  totalRevenue: number;
}> {
  const defaultStats = {
    totalBatches: 0,
    pendingBatches: 0,
    readyBatches: 0,
    completedBatches: 0,
    totalOrders: 0,
    totalRevenue: 0,
  };

  if (!showId || !sellerId) {
    return defaultStats;
  }

  try {
    const { data: batches, error } = await supabase
      .from("batches")
      .select("status, total_items, total_amount")
      .eq("show_id", showId)
      .eq("seller_id", sellerId);

    if (error || !batches) {
      return defaultStats;
    }

    return {
      totalBatches: batches.length,
      pendingBatches: batches.filter((b) => b.status === "pending").length,
      readyBatches: batches.filter((b) => b.status === "ready").length,
      completedBatches: batches.filter(
        (b) => b.status === "picked_up" || b.status === "completed"
      ).length,
      totalOrders: batches.reduce((sum, b) => sum + (b.total_items || 0), 0),
      totalRevenue: batches.reduce((sum, b) => sum + (b.total_amount || 0), 0),
    };
  } catch (err) {
    console.warn("Unexpected error getting fulfillment stats:", err);
    return defaultStats;
  }
}

