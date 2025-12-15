/**
 * Seller Orders API
 *
 * Provides read-only queries for seller order data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface SellerOrder {
  id: string;
  batch_id?: string;
  buyer_id: string;
  seller_id: string;
  show_id?: string;
  product_id?: string;
  product_title: string;
  product_image_url?: string;
  price: number;
  quantity: number;
  status: "pending" | "paid" | "ready" | "picked_up" | "cancelled" | "refunded";
  payment_intent_id?: string;
  stripe_session_id?: string;
  pickup_notes?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  created_date?: string;
  paid_at?: string;
  ready_at?: string;
  picked_up_at?: string;
}

/**
 * Get all orders for a given seller ID.
 *
 * @param sellerId - The seller ID to look up orders for
 * @returns Array of orders, sorted by created_date DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null sellerId
 * - Returns [] on any error
 */
export async function getOrdersBySellerId(
  sellerId: string | null
): Promise<SellerOrder[]> {
  if (!sellerId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch orders by seller ID:", error.message);
      return [];
    }

    return (data as SellerOrder[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching seller orders:", err);
    return [];
  }
}

/**
 * Get all orders for a given batch ID (seller context).
 *
 * @param batchId - The batch ID to look up orders for
 * @returns Array of orders in the batch
 *
 * This function:
 * - Never throws
 * - Returns [] for null batchId
 * - Returns [] on any error
 */
export async function getSellerOrdersByBatchId(
  batchId: string | null
): Promise<SellerOrder[]> {
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

    return (data as SellerOrder[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching orders by batch:", err);
    return [];
  }
}

/**
 * Get a single order by ID (for seller context).
 *
 * @param orderId - The order ID to look up
 * @returns The order if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for null orderId
 * - Returns null on any error
 */
export async function getSellerOrderById(
  orderId: string | null
): Promise<SellerOrder | null> {
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

    return data as SellerOrder | null;
  } catch (err) {
    console.warn("Unexpected error fetching order:", err);
    return null;
  }
}







