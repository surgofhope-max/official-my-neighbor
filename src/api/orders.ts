/**
 * Orders API
 *
 * Provides queries and mutations for order data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";
import { emitAnalyticsEvent } from "./fulfillment";

// TEMP DEBUG FLAG — set to false to silence debug logs
const DEBUG_ORDERS = true;

// ═══════════════════════════════════════════════════════════════════════════════
// VALID ORDER PREDICATE (READ-SIDE ENFORCEMENT)
// ═══════════════════════════════════════════════════════════════════════════════
// An order is VALID if ALL are true:
// 1) buyer_id !== seller_id (no self-purchase)
// 2) status is one of: 'paid', 'fulfilled', 'completed'
//
// This filter excludes legacy self-purchase orders from all live reads.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply the valid-order status filter to a Supabase query.
 * Filters orders to only include valid transaction statuses.
 */
const applyValidOrderStatusFilter = (query: ReturnType<typeof supabase.from>) => {
  return query.in("status", ["paid", "fulfilled", "completed"]);
};

/**
 * Filter out self-purchase orders from results.
 * Applied client-side because Supabase/PostgREST doesn't support
 * column-to-column comparison directly in query filters.
 */
const filterOutSelfPurchaseOrders = <T extends { buyer_id?: string; seller_id?: string }>(
  orders: T[]
): T[] => {
  return orders.filter((order) => order.buyer_id !== order.seller_id);
};

// Error types for order creation
export type OrderErrorType = 
  | "INVENTORY_ERROR" 
  | "RLS_ERROR" 
  | "VALIDATION_ERROR" 
  | "UNKNOWN_ERROR";

export interface OrderError {
  type: OrderErrorType;
  message: string;
  isSoldOut: boolean;
}

export interface CreateOrderResult {
  order: Order | null;
  error: OrderError | null;
}

/**
 * Parse Supabase error to determine if it's an inventory error.
 */
function parseOrderError(error: { message?: string; code?: string }): OrderError {
  const message = error.message || "Unknown error";
  
  // Check for inventory-related errors from our trigger
  if (message.includes("INVENTORY_ERROR")) {
    const isSoldOut = message.includes("Insufficient stock") || 
                      message.includes("not available") ||
                      message.includes("sold_out");
    return {
      type: "INVENTORY_ERROR",
      message: isSoldOut 
        ? "This item is no longer available" 
        : message.replace("INVENTORY_ERROR:", "").trim(),
      isSoldOut,
    };
  }
  
  // RLS policy violation
  if (message.includes("row-level security") || error.code === "42501") {
    return {
      type: "RLS_ERROR",
      message: "You don't have permission to create this order",
      isSoldOut: false,
    };
  }
  
  // Constraint violations
  if (message.includes("violates") || message.includes("constraint")) {
    return {
      type: "VALIDATION_ERROR",
      message: "Order validation failed",
      isSoldOut: false,
    };
  }
  
  return {
    type: "UNKNOWN_ERROR",
    message: "Failed to create order. Please try again.",
    isSoldOut: false,
  };
}

export interface Order {
  id: string;
  batch_id?: string;
  buyer_id: string;
  seller_id: string;
  show_id?: string;
  product_id?: string;
  product_title: string;
  product_image_url?: string;
  price: number;
  delivery_fee?: number;
  quantity?: number;
  status: "pending" | "paid" | "ready" | "picked_up" | "cancelled" | "refunded";
  payment_intent_id?: string;
  stripe_session_id?: string;
  pickup_code?: string;
  pickup_location?: string;
  pickup_notes?: string;
  group_code?: string;
  completion_code?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  created_at?: string;
  paid_at?: string;
  ready_at?: string;
  picked_up_at?: string;
  picked_up_by?: string;
}

export interface CreateOrderInput {
  batch_id: string;
  buyer_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  /** Legacy: seller's auth.users.id — FK target for orders.seller_id (DB constraint) */
  seller_user_id: string;
  /** Canonical: seller's entity ID (sellers.id) — written to orders.seller_entity_id */
  seller_id: string;
  show_id: string;
  product_id: string;
  product_title: string;
  product_image_url?: string;
  price: number;
  delivery_fee?: number;
  pickup_code: string;
  pickup_location?: string;
  pickup_notes?: string;
  group_code: string;
  completion_code: string;
  /** If true, creates order in "pending" status for Stripe payment */
  useLivePayment?: boolean;
}

/**
 * Get all orders for a given batch ID.
 *
 * @param batchId - The batch ID to look up orders for
 * @returns Array of orders in the batch
 *
 * This function:
 * - Never throws
 * - Returns [] for null batchId
 * - Returns [] on any error
 */
export async function getOrdersByBatchId(
  batchId: string | null
): Promise<Order[]> {
  if (!batchId) {
    return [];
  }

  try {
    const baseQuery = supabase
      .from("orders")
      .select("*")
      .eq("batch_id", batchId);

    const { data, error } = await applyValidOrderStatusFilter(baseQuery);

    if (error) {
      console.warn("Failed to fetch orders by batch ID:", error.message);
      return [];
    }

    // Apply self-purchase filter client-side
    return filterOutSelfPurchaseOrders((data as Order[]) ?? []);
  } catch (err) {
    console.warn("Unexpected error fetching orders:", err);
    return [];
  }
}

/**
 * Get all orders for a given buyer user ID.
 *
 * @param buyerId - The buyer's user ID
 * @returns Array of orders, sorted by created_at DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null buyerId
 * - Returns [] on any error
 */
export async function getOrdersByBuyerId(
  buyerId: string | null
): Promise<Order[]> {
  if (!buyerId) {
    return [];
  }

  try {
    const baseQuery = supabase
      .from("orders")
      .select("*")
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false });

    const { data, error } = await applyValidOrderStatusFilter(baseQuery);

    if (error) {
      console.warn("Failed to fetch orders by buyer ID:", error.message);
      return [];
    }

    // Apply self-purchase filter client-side
    return filterOutSelfPurchaseOrders((data as Order[]) ?? []);
  } catch (err) {
    console.warn("Unexpected error fetching orders:", err);
    return [];
  }
}

/**
 * Get a single order by ID.
 *
 * @param orderId - The order ID to look up
 * @returns The order if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for null orderId
 * - Returns null on any error
 */
export async function getOrderById(
  orderId: string | null
): Promise<Order | null> {
  if (!orderId) {
    return null;
  }

  try {
    const baseQuery = supabase
      .from("orders")
      .select("*")
      .eq("id", orderId);

    const { data, error } = await applyValidOrderStatusFilter(baseQuery).maybeSingle();

    if (error) {
      console.warn("Failed to fetch order by ID:", error.message);
      return null;
    }

    // Apply self-purchase filter: return null if order is self-purchase
    if (data && data.buyer_id === data.seller_id) {
      return null;
    }

    return data as Order | null;
  } catch (err) {
    console.warn("Unexpected error fetching order:", err);
    return null;
  }
}

/**
 * Get all orders (for admin dashboard).
 *
 * @returns Array of all orders, sorted by created_at DESC
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Intended for admin use only
 */
export async function getAllOrders(): Promise<Order[]> {
  try {
    const baseQuery = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    const { data, error } = await applyValidOrderStatusFilter(baseQuery);

    if (error) {
      console.warn("Failed to fetch all orders:", error.message);
      return [];
    }

    // Apply self-purchase filter client-side
    return filterOutSelfPurchaseOrders((data as Order[]) ?? []);
  } catch (err) {
    console.warn("Unexpected error fetching all orders:", err);
    return [];
  }
}

/**
 * Create a new order (demo mode - sets status to "paid").
 *
 * @param input - The order data to create
 * @returns The created order, or null on error
 *
 * This function:
 * - Never throws
 * - Returns null on any error
 * - Sets status to "paid" for demo mode (no Stripe)
 *
 * @deprecated Use createOrderWithResult for better error handling
 */
export async function createOrder(
  input: CreateOrderInput
): Promise<Order | null> {
  const result = await createOrderWithResult(input);
  return result.order;
}

/**
 * Create a new order with structured error handling.
 *
 * @param input - The order data to create
 * @returns Object containing order (or null) and error details
 *
 * This function:
 * - Never throws
 * - Returns structured error info for inventory failures
 * - Enables frontend to show "Sold Out" when appropriate
 * - If useLivePayment=true: status="pending" (requires Stripe payment)
 * - If useLivePayment=false: status="paid" (demo mode)
 *
 * QA HARDENING:
 * - Checks for existing pending order for same buyer+product to prevent duplicates
 * - Returns existing pending order if found (allows retry)
 */
export async function createOrderWithResult(
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  if (DEBUG_ORDERS) {
    console.log("[ORDER] ========================================");
    console.log("[ORDER] createOrderWithResult START");
    console.log("[ORDER] input:", JSON.stringify(input, null, 2));
    console.log("[ORDER] input.batch_id:", input.batch_id, "type:", typeof input.batch_id);
    console.log("[ORDER] input.buyer_id:", input.buyer_id, "type:", typeof input.buyer_id);
    console.log("[ORDER] input.seller_user_id:", input.seller_user_id, "type:", typeof input.seller_user_id);
    console.log("[ORDER] input.seller_id:", input.seller_id, "type:", typeof input.seller_id);
    console.log("[ORDER] input.show_id:", input.show_id, "type:", typeof input.show_id);
    console.log("[ORDER] input.product_id:", input.product_id, "type:", typeof input.product_id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DUAL-WRITE VALIDATION (Step T3.6)
  // Both seller identifiers are required for new orders
  // ═══════════════════════════════════════════════════════════════════════════
  if (!input.seller_user_id) {
    console.error("[ORDER] Missing seller_user_id (legacy auth user ID) - cannot create order");
    return { order: null, error: { type: "VALIDATION_ERROR", message: "Missing seller user ID", isSoldOut: false } };
  }
  if (!input.seller_id) {
    console.error("[ORDER] Missing seller_id (entity ID) - cannot create order");
    return { order: null, error: { type: "VALIDATION_ERROR", message: "Missing seller entity ID", isSoldOut: false } };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELF-PURCHASE GUARD (HARD BLOCK)
  // A user cannot purchase from their own seller account.
  // This preserves integrity across reviews, notifications, and analytics.
  // ═══════════════════════════════════════════════════════════════════════════
  if (input.buyer_id === input.seller_user_id) {
    console.warn("[ORDER] Self-purchase blocked: buyer_id === seller_user_id", {
      buyer_id: input.buyer_id,
      seller_user_id: input.seller_user_id,
    });
    return {
      order: null,
      error: {
        type: "VALIDATION_ERROR",
        message: "You cannot purchase from your own store.",
        isSoldOut: false,
      },
    };
  }

  try {
    // QA HARDENING: Check for existing pending order to prevent duplicates
    // This handles double-click scenarios
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("buyer_id", input.buyer_id)
      .eq("product_id", input.product_id)
      .eq("batch_id", input.batch_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingOrder) {
      // Return existing pending order - allows payment retry
      if (DEBUG_ORDERS) console.log("[ORDER] Returning existing pending order:", existingOrder.id);
      return { order: existingOrder as Order, error: null };
    }

    // Determine status based on payment mode
    const isLivePayment = input.useLivePayment === true;
    const orderStatus = isLivePayment ? "pending" : "paid";
    const paidAt = isLivePayment ? null : new Date().toISOString();

    // ═══════════════════════════════════════════════════════════════════════════
    // DUAL-WRITE (Step T3.6): Write both seller identifiers
    // - seller_id: legacy auth.users.id (DB FK constraint)
    // - seller_entity_id: canonical sellers.id (new canonical reference)
    // ═══════════════════════════════════════════════════════════════════════════
    const insertPayload = {
      batch_id: input.batch_id,
      buyer_id: input.buyer_id,
      seller_id: input.seller_user_id,        // Legacy: auth.users.id (DB FK)
      seller_entity_id: input.seller_id,      // Canonical: sellers.id (entity PK)
      product_id: input.product_id,
      show_id: input.show_id,
      completion_code: input.completion_code,
      price: input.price,
      delivery_fee: input.delivery_fee ?? 0,
      status: orderStatus,
    };

    if (DEBUG_ORDERS) {
      console.log("[ORDER] INSERT payload:", JSON.stringify(insertPayload, null, 2));
    }

    const { data, error } = await supabase
      .from("orders")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      if (DEBUG_ORDERS) {
        console.error("[ORDER] INSERT FAILED - Full error object:");
        console.error("[ORDER]   message:", error.message);
        console.error("[ORDER]   code:", error.code);
        console.error("[ORDER]   details:", error.details);
        console.error("[ORDER]   hint:", error.hint);
        console.error("[ORDER]   full:", JSON.stringify(error, null, 2));
      }
      const parsedError = parseOrderError(error);
      console.warn("Failed to create order:", parsedError.message);
      if (DEBUG_ORDERS) {
        console.log("[ORDER] createOrderWithResult END: FAILED");
        console.log("[ORDER] ========================================");
      }
      return { order: null, error: parsedError };
    }

    if (DEBUG_ORDERS) {
      console.log("[ORDER] INSERT SUCCESS - order.id:", data?.id);
      console.log("[ORDER] createOrderWithResult END: SUCCESS");
      console.log("[ORDER] ========================================");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ANALYTICS: Emit order_created event (fail-open, non-blocking)
    // Emits EXACTLY once per successful order insert
    // Payload includes price for GMV calculation
    // ─────────────────────────────────────────────────────────────────────────
    emitAnalyticsEvent("order_created", {
      order_id: data.id,
      buyer_id: input.buyer_id,
      seller_user_id: input.seller_user_id,  // Legacy: auth.users.id
      seller_id: input.seller_id,            // Canonical: sellers.id (entity PK)
      show_id: input.show_id,
      batch_id: input.batch_id,
      actor_user_id: input.buyer_id,  // Buyer is the actor
      metadata: {
        price: input.price,
        product_id: input.product_id,
        delivery_fee: input.delivery_fee ?? 0,
      },
    });

    return { order: data as Order, error: null };
  } catch (err) {
    if (DEBUG_ORDERS) {
      console.error("[ORDER] EXCEPTION:", err);
      console.log("[ORDER] createOrderWithResult END: EXCEPTION");
      console.log("[ORDER] ========================================");
    }
    console.warn("Unexpected error creating order:", err);
    return {
      order: null,
      error: {
        type: "UNKNOWN_ERROR",
        message: "An unexpected error occurred",
        isSoldOut: false,
      },
    };
  }
}

