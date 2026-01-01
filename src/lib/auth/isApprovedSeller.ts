/**
 * isApprovedSeller.ts
 *
 * Canonical helper to determine if a user has seller access.
 * Uses Supabase DB as runtime truth (NOT user_metadata).
 *
 * SELLER ACCESS REQUIREMENTS (all must be true):
 *   1. public.users.role === 'seller'
 *   2. sellers.status === 'approved'
 *   3. public.users.seller_onboarding_completed === true
 *   4. public.users.seller_safety_agreed === true
 *
 * NOTE: identity_verified is NOT required (admin-only field).
 * NOTE: Stripe connection is NOT required for seller access.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

/**
 * Result structure for approved seller check.
 */
export interface ApprovedSellerResult {
  /** true if ALL seller access conditions pass */
  ok: boolean;
  /** from public.users.role */
  role: string | null;
  /** from sellers.status */
  sellerStatus: string | null;
  /** sellers.id (entity id) if exists */
  sellerId: string | null;
  /** the full seller row if exists */
  sellerRow: any | null;
  /** human-readable reason for failures */
  reason: string;
}

/**
 * Check if a user has full seller access by querying DB truth.
 *
 * This function:
 * - Never throws
 * - Queries public.users for role + onboarding flags
 * - Queries public.sellers for status
 * - Returns ok=true only if ALL conditions pass:
 *   1. role='seller'
 *   2. status='approved'
 *   3. seller_onboarding_completed=true
 *   4. seller_safety_agreed=true
 *
 * NOTE: identity_verified is NOT required (admin-only field).
 * NOTE: Stripe is NOT checked here (not required for seller access).
 *
 * @param userId - The auth.users.id to check
 * @returns ApprovedSellerResult with detailed status
 */
export async function isApprovedSellerByUserId(
  userId: string | null
): Promise<ApprovedSellerResult> {
  // Default failure result
  const failResult = (reason: string, partial?: Partial<ApprovedSellerResult>): ApprovedSellerResult => ({
    ok: false,
    role: null,
    sellerStatus: null,
    sellerId: null,
    sellerRow: null,
    reason,
    ...partial,
  });

  // Null userId check
  if (!userId) {
    return failResult("no userId provided");
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. Query public.users for role + onboarding flags
    // ═══════════════════════════════════════════════════════════════════════════
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id, role, email, seller_onboarding_completed, seller_safety_agreed")
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.warn("[isApprovedSeller] users query error:", userError.message);
      return failResult(`users query error: ${userError.message}`);
    }

    if (!userRow) {
      return failResult("no public.users row");
    }

    const dbRole = userRow.role as string | null;
    const sellerOnboardingCompleted = userRow.seller_onboarding_completed === true;
    const sellerSafetyAgreed = userRow.seller_safety_agreed === true;
    // NOTE: identity_verified is fetched but NOT required for seller access

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. Query public.sellers for status (by user_id)
    // ═══════════════════════════════════════════════════════════════════════════
    const { data: sellerRow, error: sellerError } = await supabase
      .from("sellers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (sellerError) {
      console.warn("[isApprovedSeller] sellers query error:", sellerError.message);
      return failResult(`sellers query error: ${sellerError.message}`, {
        role: dbRole,
      });
    }

    // No seller row = not a seller
    if (!sellerRow) {
      return failResult("no sellers row", {
        role: dbRole,
      });
    }

    const sellerStatus = sellerRow.status as string | null;
    const sellerId = sellerRow.id as string | null;

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Check ALL seller access conditions
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Helper to log and return result
    const logAndReturn = (result: ApprovedSellerResult): ApprovedSellerResult => {
      console.log(
        `[isApprovedSeller] userId=${userId} users.role=${dbRole} safety=${sellerSafetyAgreed} onboarding=${sellerOnboardingCompleted} sellers.status=${sellerStatus} => ok=${result.ok} reason=${result.reason}`
      );
      return result;
    };
    
    // Condition 1: role must be 'seller'
    if (dbRole !== "seller") {
      return logAndReturn(failResult(`role_not_seller`, {
        role: dbRole,
        sellerStatus,
        sellerId,
        sellerRow,
      }));
    }

    // Condition 2: status must be 'approved'
    if (sellerStatus !== "approved") {
      return logAndReturn(failResult(`status_not_approved`, {
        role: dbRole,
        sellerStatus,
        sellerId,
        sellerRow,
      }));
    }

    // Condition 3: seller_onboarding_completed must be true
    if (!sellerOnboardingCompleted) {
      return logAndReturn(failResult(`seller_onboarding_incomplete`, {
        role: dbRole,
        sellerStatus,
        sellerId,
        sellerRow,
      }));
    }

    // Condition 4: seller_safety_agreed must be true
    if (!sellerSafetyAgreed) {
      return logAndReturn(failResult(`seller_safety_not_agreed`, {
        role: dbRole,
        sellerStatus,
        sellerId,
        sellerRow,
      }));
    }

    // NOTE: identity_verified is NOT required for seller access (admin-only field)
    // Stripe connection is also NOT required (only needed for payment processing)

    // ═══════════════════════════════════════════════════════════════════════════
    // SUCCESS: All conditions pass - seller has full access
    // ═══════════════════════════════════════════════════════════════════════════
    return logAndReturn({
      ok: true,
      role: dbRole,
      sellerStatus,
      sellerId,
      sellerRow,
      reason: "seller_access_ready",
    });

  } catch (err) {
    console.error("[isApprovedSeller] unexpected error:", err);
    return failResult(`unexpected error: ${String(err)}`);
  }
}

/**
 * Check if a user is an admin by querying DB truth.
 *
 * @param userId - The auth.users.id to check
 * @returns true if public.users.role is 'admin' or 'super_admin'
 */
export async function isAdminByUserId(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  try {
    const { data: userRow, error } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (error || !userRow) {
      return false;
    }

    const role = userRow.role as string | null;
    return role === "admin" || role === "super_admin";
  } catch {
    return false;
  }
}

/**
 * Synchronous check for admin using already-loaded user data.
 * Falls back to user_metadata if DB role not available.
 * Prefer isAdminByUserId() for authoritative check.
 *
 * @param user - User object with potential role properties
 * @returns true if user appears to be admin
 */
export function isAdminSync(user: any): boolean {
  if (!user) return false;

  // Prefer explicit role property (from DB join or denormalized)
  const role = user.role 
    || user.user_metadata?.role 
    || user.app_metadata?.role;

  return role === "admin" || role === "super_admin";
}


