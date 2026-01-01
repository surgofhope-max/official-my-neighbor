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
import { createPickupCompletedNotification } from "./notifications";

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

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS EVENTS (SHADOW MODE - FAIL-OPEN DB INSERT)
// Append-only event emission for analytics tracking.
// Events are inserted into public.analytics_events table.
// FAIL-OPEN: Errors are caught and logged, never thrown or blocking.
//
// Table schema (FINAL):
//   event_type, event_at, actor_user_id, buyer_id, seller_user_id,
//   seller_id, show_id, batch_id, order_id, payload, source, schema_version
// ═══════════════════════════════════════════════════════════════════════════

export type AnalyticsEventType = 
  | "batch_picked_up"
  | "orders_completed"
  | "batch_cancelled"
  | "order_refunded";

export interface AnalyticsEventPayload {
  batch_id?: string;
  order_id?: string;           // Single order ID (use first if multiple)
  order_ids?: string[];        // Multiple order IDs (stored in payload)
  seller_id?: string;          // Seller entity ID (public.sellers.id)
  seller_user_id?: string;     // Seller user ID (auth.users.id)
  buyer_id?: string;           // Buyer user ID (auth.users.id)
  actor_user_id?: string;      // User who triggered the event
  show_id?: string;
  event_at?: string;
  metadata?: Record<string, unknown>;  // Extra context (stored in payload)
}

/**
 * Emit an analytics event via Edge Function (server-side insert).
 * 
 * Calls emit-analytics-event Edge Function which uses service role to insert.
 * FAIL-OPEN: Errors are caught and logged, never thrown.
 * Does NOT block fulfillment or any calling code.
 * 
 * @param type - The event type (required)
 * @param payload - Event payload with context (defaults to {})
 */
export async function emitAnalyticsEvent(
  type: AnalyticsEventType | string,
  payload: AnalyticsEventPayload = {}
): Promise<void> {
  // Validate event_type is required
  if (!type) {
    console.error("[analytics_events] event_type is required, skipping");
    return;
  }

  try {
    const eventAt = payload.event_at || new Date().toISOString();
    
    // Build payload JSON (contains order_ids array, metadata, and any extra context)
    const payloadJson: Record<string, unknown> = {};
    if (payload.order_ids && payload.order_ids.length > 0) {
      payloadJson.order_ids = payload.order_ids;
    }
    if (payload.metadata) {
      payloadJson.metadata = payload.metadata;
    }

    // Get current user access token if available (for Authorization header)
    let accessToken: string | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      accessToken = sessionData?.session?.access_token || null;
    } catch {
      // Ignore - will proceed without Authorization header
    }

    // Build request headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // POST to Edge Function (server-side insert with service role)
    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emit-analytics-event`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event_type: type,
        event_at: eventAt,
        actor_user_id: payload.actor_user_id || null,
        buyer_id: payload.buyer_id || null,
        seller_user_id: payload.seller_user_id || null,
        seller_id: payload.seller_id || null,
        show_id: payload.show_id || null,
        batch_id: payload.batch_id || null,
        order_id: payload.order_id || (payload.order_ids?.[0]) || null,
        payload: Object.keys(payloadJson).length > 0 ? payloadJson : {},
        source: "fulfillment",
        schema_version: 1,
      }),
    });

    if (!response.ok) {
      // Log error but do NOT throw - fail-open
      const errorText = await response.text().catch(() => "unknown");
      console.error("[analytics_events] Edge function failed:", response.status, errorText);
    }
  } catch (err) {
    // Analytics should NEVER block fulfillment operations - fail-open
    console.error("[analytics_events] Edge function call failed:", err);
  }
}

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
      .order("created_at", { ascending: false });

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
      .order("created_at", { ascending: false });

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
      .order("created_at", { ascending: true });

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
    // ─────────────────────────────────────────────────────────────────────
    // STEP 0: Fetch the batch first
    // ─────────────────────────────────────────────────────────────────────
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

    const currentStatus = batch.status;
    console.log("[Pickup] batchStatus:", currentStatus);

    // ─────────────────────────────────────────────────────────────────────
    // IDEMPOTENCY: If batch already completed → return success (no-op)
    // ─────────────────────────────────────────────────────────────────────
    if (currentStatus === "picked_up" || currentStatus === "completed") {
      console.log("[Pickup] Batch already completed, returning success (idempotent)");
      return {
        batch: batch as Batch,
        ordersUpdated: 0,
        notificationSent: false,
        error: null, // No error - idempotent success
      };
    }

    const now = new Date().toISOString();
    const completedBy = sellerEmail;

    // ─────────────────────────────────────────────────────────────────────
    // STEP A: Fetch orders for this batch to determine eligibility
    // ─────────────────────────────────────────────────────────────────────
    const { data: batchOrders, error: ordersFetchError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("batch_id", batchId);

    if (ordersFetchError) {
      console.warn("[Pickup] Failed to fetch orders:", ordersFetchError.message);
    }

    const allOrders = batchOrders || [];
    const eligibleOrders = allOrders.filter(o => o.status === "paid" || o.status === "ready");
    const skippedOrders = allOrders.filter(o => o.status !== "paid" && o.status !== "ready");

    console.log("[Pickup] eligibleOrders count:", eligibleOrders.length);
    console.log("[Pickup] skippedOrders count:", skippedOrders.length);

    // ─────────────────────────────────────────────────────────────────────
    // STEP B: Update ONLY eligible orders (status = 'paid' or 'ready')
    // ─────────────────────────────────────────────────────────────────────
    let updatedOrders: any[] = [];
    let ordersUpdated = 0;

    if (eligibleOrders.length > 0) {
      const eligibleOrderIds = eligibleOrders.map(o => o.id);
      
      const { data: updated, error: ordersError } = await supabase
        .from("orders")
        .update({
          status: "fulfilled",
          picked_up_at: now,
          picked_up_by: completedBy,
        })
        .in("id", eligibleOrderIds)
        .select();

      if (ordersError) {
        console.warn("[Pickup] Failed to update orders:", ordersError.message);
      } else {
        updatedOrders = updated || [];
        ordersUpdated = updatedOrders.length;

        // ─────────────────────────────────────────────────────────────────────
        // STEP B.2: IMMEDIATELY FINALIZE TO COMPLETED (TERMINAL STATE)
        // Seller verification = completion. Reviews unlock. No hanging orders.
        // ─────────────────────────────────────────────────────────────────────
        if (ordersUpdated > 0) {
          const { error: completedError } = await supabase
            .from("orders")
            .update({
              status: "completed",
              completed_at: now,
            })
            .in("id", eligibleOrderIds);

          if (completedError) {
            console.warn("[Pickup] Failed to finalize orders to completed:", completedError.message);
          } else {
            console.log("[Pickup] Orders finalized to completed:", eligibleOrderIds.length);
          }
        }
      }
    }

    console.log("[Pickup] ordersUpdated:", ordersUpdated);

    const firstOrder = updatedOrders[0] || allOrders[0];

    // ─────────────────────────────────────────────────────────────────────
    // ANALYTICS: Emit orders_fulfilled for EACH order that was updated
    // GUARDS:
    //   - Only orders with previous status 'paid'/'ready' were updated
    //   - This point reached ONLY after successful DB update
    //   - No emission for already-fulfilled orders (filtered by .in() above)
    // EMIT EXACTLY ONCE per order.
    // ─────────────────────────────────────────────────────────────────────
    if (updatedOrders && updatedOrders.length > 0) {
      for (const order of updatedOrders) {
        emitAnalyticsEvent("orders_fulfilled", {
          order_id: order.id,
          batch_id: batchId,
          buyer_id: batch.buyer_id,
          seller_id: batch.seller_id,           // Entity ID (public.sellers.id)
          seller_user_id: null,                 // Not directly available
          show_id: batch.show_id,
          actor_user_id: sellerId,              // Seller who completed the pickup
          event_at: now,
          metadata: {
            product_id: order.product_id,
            price: order.price,
            completed_by: completedBy,
          },
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP C: Update batch to "completed" (only if not already terminal)
    // This avoids batches_unique_active conflicts
    // ─────────────────────────────────────────────────────────────────────
    let updatedBatch = batch;
    
    // Only update batch if it's not already in a terminal state
    if (currentStatus !== "completed" && currentStatus !== "picked_up") {
      // Guard: Check if a completed batch already exists for same buyer/seller/show
      // to avoid unique constraint violation on (buyer_id, seller_id, show_id, status)
      const { data: existingCompletedBatch, error: existingErr } = await supabase
        .from("batches")
        .select("id, status")
        .eq("buyer_id", batch.buyer_id)
        .eq("seller_id", batch.seller_id)
        .eq("show_id", batch.show_id)
        .eq("status", "completed")
        .maybeSingle();

      if (existingErr) {
        console.warn("[Pickup] Failed to check existing completed batch:", existingErr.message);
        // Fail-open: continue with update attempt
      }

      // If a different batch is already completed for this buyer/seller/show, skip update
      if (existingCompletedBatch && existingCompletedBatch.id !== batchId) {
        console.log("[Pickup] Completed batch already exists; skipping status update to avoid unique conflict");
        // Keep updatedBatch = batch (no update performed)
      } else {
        // Safe to update: no conflicting completed batch exists
        const { data: batchUpdateResult, error: updateError } = await supabase
          .from("batches")
          .update({
            status: "completed",
            picked_up_at: now, // Also set picked_up_at for compatibility
          })
          .eq("id", batchId)
          .select()
          .single();

        if (updateError) {
          console.warn("[Pickup] Failed to complete batch:", updateError.message);
          // Don't fail the whole operation - batch may have been updated by another process
        } else if (batchUpdateResult) {
          updatedBatch = batchUpdateResult;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP D: Create notifications for buyer (Base44 parity)
    // ONLY send notifications if orders were actually transitioned
    // FAIL-SAFE: Notification failures must never block fulfillment
    // ─────────────────────────────────────────────────────────────────────
    let notificationSent = false;
    
    // FIX: Use buyer_id only (buyer_user_id does not exist in batches table)
    const buyerUserId = batch.buyer_id;
    
    // Helper: validate UUID format to prevent DB constraint violations
    const isUuid = (v: unknown): v is string =>
      typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    
    // Only send notifications if:
    // - At least one order was newly transitioned
    // - buyerUserId is a valid UUID (prevents NOT NULL constraint violation)
    if (firstOrder && ordersUpdated > 0 && buyerUserId && isUuid(buyerUserId)) {
      // D.1: Create "Order Completed" notification (order_update type)
      try {
        const { data: existingOrderNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", buyerUserId)
          .eq("type", "order_update")
          .contains("metadata", { batch_id: batchId, event: "order_completed" })
          .maybeSingle();

        if (!existingOrderNotif) {
          const { error: orderNotifErr } = await supabase
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
          if (orderNotifErr) {
            console.warn("[Pickup] Failed to create order_completed notification:", orderNotifErr.message);
          }
        }
      } catch (e) {
        console.warn("[Pickup] Unexpected error creating order_completed notification:", e);
      }

      // D.2: Create "Leave a Review" notification (review_request type)
      try {
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
            console.warn("[Pickup] Failed to create review_request notification:", notifError.message);
          } else {
            notificationSent = true;
          }
        }
      } catch (e) {
        console.warn("[Pickup] Unexpected error creating review_request notification:", e);
      }

      // D.3: Create "Order picked up" notification (pickup_completed type)
      try {
        await createPickupCompletedNotification({
          buyerUserId,
          sellerId: batch.seller_id,
          sellerName,
          batchId,
          showId: batch.show_id,
        });
      } catch (e) {
        console.warn("[Pickup] Unexpected error creating pickup_completed notification:", e);
      }
    } else if (ordersUpdated > 0) {
      // Orders were updated but notifications skipped due to invalid buyerUserId
      console.warn("[Pickup] Skipping buyer notifications (missing/invalid buyerUserId)", {
        buyerUserId,
        ordersUpdated,
        hasBuyerUserId: !!buyerUserId,
        isValidUuid: isUuid(buyerUserId),
      });
    }

    // Log admin override for audit
    if (isAdmin && sellerId !== batch.seller_id) {
      console.log(
        `[AUDIT] Admin (${sellerEmail}) completed batch ${batchId} for seller ${batch.seller_id}`
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP E: Emit analytics events (fail-open, non-blocking)
    // ONLY emit if orders were actually transitioned (not on idempotent retries)
    // ─────────────────────────────────────────────────────────────────────
    const orderIds = updatedOrders.map((o: Order) => o.id);
    
    // E.1: Emit batch_picked_up event - ONLY if orders were transitioned
    if (ordersUpdated > 0) {
      emitAnalyticsEvent("batch_picked_up", {
        batch_id: batchId,
        buyer_id: buyerUserId,
        seller_id: batch.seller_id,           // Entity ID (public.sellers.id)
        seller_user_id: sellerEmail ? null : null,  // User ID not directly available
        show_id: batch.show_id,
        actor_user_id: sellerId,              // Seller who completed the pickup
        event_at: now,
        metadata: {
          completed_by: completedBy,
          total_items: batch.total_items,
          total_amount: batch.total_amount,
          orders_count: ordersUpdated,
          previous_status: currentStatus,     // For audit trail
        },
      });

      // E.2: Emit orders_completed event (one per batch, contains all order IDs)
      if (orderIds.length > 0) {
        emitAnalyticsEvent("orders_completed", {
          batch_id: batchId,
          order_ids: orderIds,
          buyer_id: buyerUserId,
          seller_id: batch.seller_id,
          show_id: batch.show_id,  // Added for show-level attribution
          actor_user_id: sellerId,
          event_at: now,
          metadata: {
            completed_by: completedBy,
          },
        });
      }
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
 * @param sellerId - The seller entity ID (public.sellers.id)
 *                   NOTE: batches.seller_id uses seller entity id, NOT user id
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
    // FIX: Use select("*") instead of partial select — PostgREST rejects
    // partial selects like "id, picked_up_at" when combined with filters
    const { data: batches, error: batchError } = await supabase
      .from("batches")
      .select("*")
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
    // FIX: Use select("*") instead of partial select — PostgREST rejects
    // partial selects like "id, picked_up_at" when combined with filters
    // FIX: Use buyer_id only (buyer_user_id does not exist in batches table)
    const { data: batches, error: batchError } = await supabase
      .from("batches")
      .select("*")
      .eq("buyer_id", buyerId)
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

