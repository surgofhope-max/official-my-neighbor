/**
 * Order Verifications API
 *
 * Handles physical handoff verification between buyer and seller.
 * - Buyer receives verification code on order completion
 * - Seller enters code to confirm physical receipt
 */

import { supabase } from "@/lib/supabase/supabaseClient";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface OrderVerification {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  verification_code: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerificationResult {
  success: boolean;
  error?: string;
  verified_at?: string;
  order_id?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUYER QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get verification for a specific order (Buyer view - includes code)
 */
export async function getVerificationForOrder(
  orderId: string
): Promise<OrderVerification | null> {
  if (!orderId) return null;

  const { data, error } = await supabase
    .from("order_verifications")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to fetch verification:", error.message);
    return null;
  }

  return data as OrderVerification | null;
}

/**
 * Get all verifications for a buyer (for Buyer Orders page)
 */
export async function getVerificationsForBuyer(
  buyerProfileId: string
): Promise<OrderVerification[]> {
  if (!buyerProfileId) return [];

  const { data, error } = await supabase
    .from("order_verifications")
    .select("*")
    .eq("buyer_id", buyerProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Failed to fetch buyer verifications:", error.message);
    return [];
  }

  return (data as OrderVerification[]) || [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all pending verifications for a seller (awaiting verification)
 */
export async function getPendingVerificationsForSeller(
  sellerId: string
): Promise<OrderVerification[]> {
  if (!sellerId) return [];

  const { data, error } = await supabase
    .from("order_verifications")
    .select("*")
    .eq("seller_id", sellerId)
    .is("verified_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Failed to fetch pending verifications:", error.message);
    return [];
  }

  return (data as OrderVerification[]) || [];
}

/**
 * Get verification status for a seller's order (without showing the code)
 */
export async function getVerificationStatusForSeller(
  orderId: string,
  sellerId: string
): Promise<{ exists: boolean; verified: boolean; verified_at: string | null }> {
  if (!orderId || !sellerId) {
    return { exists: false, verified: false, verified_at: null };
  }

  const { data, error } = await supabase
    .from("order_verifications")
    .select("id, verified_at")
    .eq("order_id", orderId)
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error || !data) {
    return { exists: false, verified: false, verified_at: null };
  }

  return {
    exists: true,
    verified: data.verified_at !== null,
    verified_at: data.verified_at,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify an order with the buyer's verification code
 * 
 * @param orderId - The order to verify
 * @param verificationCode - The 6-digit code provided by buyer
 * @returns Result with success status and optional error
 */
export async function verifyOrderWithCode(
  orderId: string,
  verificationCode: string
): Promise<VerificationResult> {
  if (!orderId || !verificationCode) {
    return { success: false, error: "Order ID and verification code are required" };
  }

  // Trim and normalize the code
  const normalizedCode = verificationCode.trim();

  // Call the database function
  const { data, error } = await supabase.rpc("verify_order_with_code", {
    p_order_id: orderId,
    p_verification_code: normalizedCode,
  });

  if (error) {
    console.error("Verification RPC error:", error);
    return { success: false, error: error.message };
  }

  // The function returns JSONB
  const result = data as VerificationResult;
  return result;
}

/**
 * Alternative: Direct update method (if RPC is not available)
 * Validates and updates verification in a single transaction
 */
export async function verifyOrderDirect(
  orderId: string,
  verificationCode: string,
  sellerId: string
): Promise<VerificationResult> {
  if (!orderId || !verificationCode || !sellerId) {
    return { success: false, error: "Missing required fields" };
  }

  // First, verify the code matches
  const { data: verification, error: fetchError } = await supabase
    .from("order_verifications")
    .select("id, verification_code, verified_at")
    .eq("order_id", orderId)
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (fetchError || !verification) {
    return { success: false, error: "Verification not found" };
  }

  if (verification.verified_at) {
    return { success: false, error: "Order already verified" };
  }

  if (verification.verification_code !== verificationCode.trim()) {
    return { success: false, error: "Invalid verification code" };
  }

  // Update to mark as verified
  const { data: updated, error: updateError } = await supabase
    .from("order_verifications")
    .update({ 
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", verification.id)
    .select()
    .single();

  if (updateError) {
    console.error("Verification update error:", updateError);
    return { success: false, error: updateError.message };
  }

  return {
    success: true,
    verified_at: updated.verified_at,
    order_id: orderId,
  };
}


