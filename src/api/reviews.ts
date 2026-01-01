/**
 * Reviews API
 *
 * Handles buyer reviews for completed and verified orders.
 * - One review per order
 * - Only buyer can create review
 * - Reviews are immutable once published
 */

import { supabase } from "@/lib/supabase/supabaseClient";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Review {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  product_id: string | null;
  star_rating: number;
  review_text: string | null;
  buyer_name: string | null;
  buyer_profile_image_url: string | null;
  is_published: boolean;
  created_date: string;
  updated_at: string;
}

export interface ReviewWithDetails extends Review {
  buyer_name?: string;
  buyer_avatar?: string;
  product_title?: string;
  product_image?: string;
}

export interface CreateReviewInput {
  order_id: string;
  buyer_id: string;
  seller_id: string;
  product_id?: string | null;
  star_rating: number;
  review_text?: string | null;
  buyer_name?: string | null;
  buyer_profile_image_url?: string | null;
}

export interface ReviewResult {
  success: boolean;
  review?: Review;
  error?: string;
}

export interface SellerRatingStats {
  average_rating: number;
  review_count: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ELIGIBILITY CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an order is eligible for review
 * - Order must be completed (status === 'completed')
 * - No existing review for this order (enforced by DB unique constraint)
 * 
 * NOTE: Verification check removed — eligibility is based on order.status only.
 */
export async function isOrderReviewEligible(orderId: string): Promise<boolean> {
  if (!orderId) return false;

  // Fetch order status directly
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.warn("Error checking review eligibility:", orderError?.message);
    return false;
  }

  // Eligible only if order is completed
  return order.status === "completed";
}

/**
 * Get all review-eligible orders for a buyer
 */
export async function getReviewEligibleOrders(
  buyerProfileId: string
): Promise<Array<{
  order_id: string;
  seller_id: string;
  product_id: string | null;
  completed_at: string;
  verified_at: string;
  has_review: boolean;
}>> {
  if (!buyerProfileId) return [];

  const { data, error } = await supabase.rpc("get_buyer_review_eligible_orders", {
    p_buyer_id: buyerProfileId,
  });

  if (error) {
    console.warn("Error fetching review eligible orders:", error.message);
    return [];
  }

  return data || [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUYER QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get review for a specific order (if exists)
 */
export async function getReviewForOrder(orderId: string): Promise<Review | null> {
  if (!orderId) return null;

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to fetch review:", error.message);
    return null;
  }

  return data as Review | null;
}

/**
 * Get all reviews submitted by a buyer
 */
export async function getReviewsByBuyer(
  buyerProfileId: string
): Promise<Review[]> {
  if (!buyerProfileId) return [];

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("buyer_id", buyerProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Failed to fetch buyer reviews:", error.message);
    return [];
  }

  return (data as Review[]) || [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all reviews for a seller (published only for public, all for seller)
 */
export async function getReviewsForSeller(
  sellerId: string,
  options?: { limit?: number; offset?: number }
): Promise<ReviewWithDetails[]> {
  if (!sellerId) return [];

  let query = supabase
    .from("reviews")
    .select(`
      *,
      buyer_profiles(full_name, profile_image_url),
      products(title, images)
    `)
    .eq("seller_id", sellerId)
    .eq("is_published", true)
    .order("created_date", { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Failed to fetch seller reviews:", error.message);
    return [];
  }

  // Map to ReviewWithDetails
  return (data || []).map((row: any) => ({
    ...row,
    buyer_name: row.buyer_name || row.buyer_profiles?.full_name || "Anonymous",
    buyer_avatar: row.buyer_profile_image_url || row.buyer_profiles?.profile_image_url,
    product_title: row.products?.title,
    product_image: row.products?.images?.[0],
    buyer_profiles: undefined,
    products: undefined,
  }));
}

/**
 * Get seller rating statistics
 */
export async function getSellerRatingStats(
  sellerId: string
): Promise<SellerRatingStats> {
  if (!sellerId) {
    return { average_rating: 0, review_count: 0 };
  }

  const { data, error } = await supabase
    .from("sellers")
    .select("average_rating, review_count")
    .eq("id", sellerId)
    .single();

  if (error || !data) {
    return { average_rating: 0, review_count: 0 };
  }

  return {
    average_rating: data.average_rating || 0,
    review_count: data.review_count || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get published reviews for a product
 */
export async function getReviewsForProduct(
  productId: string,
  options?: { limit?: number }
): Promise<ReviewWithDetails[]> {
  if (!productId) return [];

  let query = supabase
    .from("reviews")
    .select(`
      *,
      buyer_profiles(full_name, profile_image_url)
    `)
    .eq("product_id", productId)
    .eq("is_published", true)
    .order("created_date", { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Failed to fetch product reviews:", error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    ...row,
    buyer_name: row.buyer_name || row.buyer_profiles?.full_name || "Anonymous",
    buyer_avatar: row.buyer_profile_image_url || row.buyer_profiles?.profile_image_url,
    buyer_profiles: undefined,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUYER MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Submit a review for an order
 * 
 * Requirements:
 * - Order must be completed (status === 'completed')
 * - No existing review for this order (enforced by DB unique constraint)
 * - Caller must be the buyer
 */
export async function submitReview(
  input: CreateReviewInput
): Promise<ReviewResult> {
  const { 
    order_id, 
    buyer_id, 
    seller_id, 
    product_id, 
    star_rating, 
    review_text,
    buyer_name,
    buyer_profile_image_url,
  } = input;

  // Validate rating
  if (!star_rating || star_rating < 1 || star_rating > 5) {
    return { success: false, error: "Rating must be between 1 and 5" };
  }

  // Check eligibility: order must exist and be completed
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", order_id)
    .single();

  if (orderError || !order) {
    return { success: false, error: "Order not found." };
  }

  if (order.status !== "completed") {
    return {
      success: false,
      error: "Order is not eligible for review. It must be completed before leaving a review."
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESOLVE seller_user_id → sellers.id (FK constraint requires sellers.id)
  // ─────────────────────────────────────────────────────────────────────────────
  const { data: sellerRow, error: sellerErr } = await supabase
    .from("sellers")
    .select("id")
    .eq("user_id", seller_id)
    .single();

  if (sellerErr || !sellerRow) {
    console.error("Seller profile not found for review", {
      seller_user_id: seller_id,
      error: sellerErr,
    });
    return {
      success: false,
      error: "Seller profile not found. Cannot submit review.",
    };
  }

  const sellerProfileId = sellerRow.id;

  // Insert the review
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      order_id,
      buyer_id,
      seller_id: sellerProfileId,
      star_rating,
      review_text: review_text?.trim() || null,
      buyer_name: buyer_name || null,
      buyer_profile_image_url: buyer_profile_image_url || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to submit review:", error);
    
    // Check for duplicate
    if (error.code === "23505") {
      return { success: false, error: "You've already reviewed this order" };
    }
    
    return { success: false, error: error.message };
  }

  return {
    success: true,
    review: data as Review,
  };
}

