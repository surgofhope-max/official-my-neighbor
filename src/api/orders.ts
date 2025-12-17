/**
 * Orders API
 *
 * Provides queries and mutations for order data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

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
  created_date?: string;
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
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("batch_id", batchId);

    if (error) {
      console.warn("Failed to fetch orders by batch ID:", error.message);
      return [];
    }

    return (data as Order[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching orders:", err);
    return [];
  }
}

/**
 * Get all orders for a given buyer user ID.
 *
 * @param buyerId - The buyer's user ID
 * @returns Array of orders, sorted by created_date DESC
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
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("buyer_id", buyerId)
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch orders by buyer ID:", error.message);
      return [];
    }

    return (data as Order[]) ?? [];
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
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch order by ID:", error.message);
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
 * @returns Array of all orders, sorted by created_date DESC
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 * - Intended for admin use only
 */
export async function getAllOrders(): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch all orders:", error.message);
      return [];
    }

    return (data as Order[]) ?? [];
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
      console.log("Returning existing pending order:", existingOrder.id);
      return { order: existingOrder as Order, error: null };
    }

    // Determine status based on payment mode
    const isLivePayment = input.useLivePayment === true;
    const orderStatus = isLivePayment ? "pending" : "paid";
    const paidAt = isLivePayment ? null : new Date().toISOString();

    const { data, error } = await supabase
      .from("orders")
      .insert({
        batch_id: input.batch_id,
        buyer_id: input.buyer_id,
        buyer_name: input.buyer_name,
        buyer_email: input.buyer_email,
        buyer_phone: input.buyer_phone,
        seller_id: input.seller_id,
        show_id: input.show_id,
        product_id: input.product_id,
        product_title: input.product_title,
        product_image_url: input.product_image_url || null,
        price: input.price,
        delivery_fee: input.delivery_fee || 0,
        pickup_code: input.pickup_code,
        pickup_location: input.pickup_location || "",
        pickup_notes: input.pickup_notes || "",
        group_code: input.group_code,
        completion_code: input.completion_code,
        quantity: 1, // Explicit quantity for inventory trigger
        status: orderStatus,
        paid_at: paidAt,
      })
      .select()
      .single();

    if (error) {
      const parsedError = parseOrderError(error);
      console.warn("Failed to create order:", parsedError.message);
      return { order: null, error: parsedError };
    }

    return { order: data as Order, error: null };
  } catch (err) {
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

