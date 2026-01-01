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
  /** Legacy: auth.users.id — used for DB FK (orders.seller_id -> users.id) */
  seller_id: string;
  /** Canonical: sellers.id (entity PK) — preferred for reads, nullable for legacy orders */
  seller_entity_id?: string | null;
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
  created_at?: string;
  paid_at?: string;
  ready_at?: string;
  picked_up_at?: string;
}

/**
 * Get all orders for a given seller using BOTH canonical and legacy IDs.
 *
 * READ PATH STRATEGY (Step T3.5):
 * - Primary: orders.seller_entity_id = seller.id (canonical, entity PK)
 * - Fallback: orders.seller_id = seller.user_id (legacy, auth user ID)
 *
 * This handles:
 * - New orders: have seller_entity_id set
 * - Legacy orders: only have seller_id (auth user ID)
 *
 * @param sellerEntityId - The seller's entity ID (sellers.id) — CANONICAL
 * @param sellerUserId - The seller's auth user ID (sellers.user_id) — LEGACY fallback
 * @returns Array of orders, sorted by created_at DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null IDs
 * - Returns [] on any error
 */
export async function getOrdersBySeller(
  sellerEntityId: string | null,
  sellerUserId: string | null
): Promise<SellerOrder[]> {
  if (!sellerEntityId && !sellerUserId) {
    return [];
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // READ PATH: Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
    // 
    // Query logic:
    // - seller_entity_id = sellerEntityId (new orders)
    // - OR seller_id = sellerUserId (legacy orders where seller_entity_id is NULL)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Build OR condition using Supabase's .or() method
    let orConditions: string[] = [];
    
    if (sellerEntityId) {
      orConditions.push(`seller_entity_id.eq.${sellerEntityId}`);
    }
    
    if (sellerUserId) {
      // Legacy fallback: match seller_id (user_id) for orders without seller_entity_id
      orConditions.push(`and(seller_entity_id.is.null,seller_id.eq.${sellerUserId})`);
    }

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(orConditions.join(","))
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch orders by seller:", error.message);
      return [];
    }

    return (data as SellerOrder[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching seller orders:", err);
    return [];
  }
}

/**
 * @deprecated Use getOrdersBySeller() instead for canonical entity ID support.
 * 
 * Get all orders for a given seller ID (LEGACY - user_id only).
 *
 * @param sellerId - The seller's auth user ID (public.users.id)
 *                   DB FK: orders.seller_id -> public.users.id
 *                   Pass seller.user_id, NOT seller.id
 * @returns Array of orders, sorted by created_at DESC
 */
export async function getOrdersBySellerId(
  sellerId: string | null
): Promise<SellerOrder[]> {
  if (!sellerId) {
    return [];
  }

  try {
    // LEGACY: Query by seller_id (auth user ID) only
    // This is kept for backwards compatibility during T3 migration
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

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







