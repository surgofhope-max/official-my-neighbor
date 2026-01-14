/**
 * Onboarding State Machine
 *
 * Canonical readiness helpers for access control.
 * These are pure functions with NO side effects.
 *
 * ACCESS TIERS:
 * - Viewer: Anyone (no requirements)
 * - Buyer: Has buyer profile + safety agreed
 * - Seller Access: Approved + onboarding complete + safety agreed
 * - Seller Payment: Seller Access + Stripe connected
 *
 * NOTE: identity_verified is NOT required for seller access (admin-only field).
 */

// ═══════════════════════════════════════════════════════════════════════════
// FORENSIC LOGGING HELPER (gated behind localStorage flag)
// Enable with: localStorage.setItem("LM_FORENSIC", "1")
// ═══════════════════════════════════════════════════════════════════════════
const LM_FORENSIC = () =>
  typeof window !== "undefined" && window.localStorage?.getItem("LM_FORENSIC") === "1";

// ─────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────

export interface UserOnboardingState {
  id?: string;
  buyer_safety_agreed?: boolean;
  seller_safety_agreed?: boolean;
  seller_onboarding_completed?: boolean;
  identity_verified?: boolean;
  [key: string]: unknown;
}

export interface BuyerProfile {
  id?: string;
  user_id?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  [key: string]: unknown;
}

export interface SellerProfile {
  id?: string;
  user_id?: string;
  status?: "pending" | "approved" | "declined" | "suspended" | string;
  stripe_account_id?: string | null;
  stripe_connected?: boolean;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// BUYER ACCESS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Check if user has completed buyer onboarding and can access buyer features.
 *
 * Requirements:
 * - Has a buyer profile (buyer_profiles row exists)
 * - Has agreed to buyer safety terms
 *
 * @param user - The user object with onboarding flags
 * @param buyerProfile - The buyer_profiles row (or null)
 * @returns true if buyer access is ready
 */
/**
 * Get buyer_safety_agreed from user object (checks both direct property and user_metadata)
 */
function getBuyerSafetyAgreed(user: UserOnboardingState | null | undefined): boolean {
  if (!user) return false;
  // Check direct property first (from public.users), then user_metadata (from auth)
  return user.buyer_safety_agreed === true || (user as any).user_metadata?.buyer_safety_agreed === true;
}

/**
 * Get seller_onboarding_completed from user object (checks both direct property and user_metadata)
 * This mirrors the buyer safety pattern for consistency.
 */
export function getSellerOnboardingCompleted(user: UserOnboardingState | null | undefined): boolean {
  if (!user) return false;
  // Check direct property first (from public.users), then user_metadata (from auth)
  return user.seller_onboarding_completed === true || (user as any).user_metadata?.seller_onboarding_completed === true;
}

/**
 * Get seller_safety_agreed from user object (checks both direct property and user_metadata)
 * This mirrors the buyer safety pattern for consistency.
 */
export function getSellerSafetyAgreed(user: UserOnboardingState | null | undefined): boolean {
  if (!user) return false;
  // Check direct property first (from public.users), then user_metadata (from auth)
  return user.seller_safety_agreed === true || (user as any).user_metadata?.seller_safety_agreed === true;
}

export function isBuyerAccessReady(
  user: UserOnboardingState | null | undefined,
  buyerProfile: BuyerProfile | null | undefined
): boolean {
  return !!buyerProfile && getBuyerSafetyAgreed(user);
}

// ─────────────────────────────────────────────────────────────────────────
// SELLER APPLICATION
// ─────────────────────────────────────────────────────────────────────────

/**
 * Check if a seller application exists (regardless of status).
 *
 * @param seller - The sellers row (or null)
 * @returns true if seller profile exists
 */
export function isSellerApplicationExists(
  seller: SellerProfile | null | undefined
): boolean {
  return !!seller;
}

// ─────────────────────────────────────────────────────────────────────────
// SELLER ACCESS (No Stripe Required)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Check if buyer profile is complete (required fields present).
 *
 * @param buyerProfile - The buyer_profiles row (or null)
 * @returns true if buyer profile has all required fields
 */
export function isBuyerProfileComplete(
  buyerProfile: BuyerProfile | null | undefined
): boolean {
  if (!buyerProfile) {
    console.warn("[GATE FAIL] isBuyerProfileComplete", { reason: "buyerProfile is null/undefined" });
    return false;
  }
  const complete = !!(
    buyerProfile.full_name &&
    buyerProfile.phone &&
    buyerProfile.email
  );
  if (!complete) {
    console.warn("[GATE FAIL] isBuyerProfileComplete", { 
      reason: "missing required fields",
      full_name: !!buyerProfile.full_name,
      phone: !!buyerProfile.phone,
      email: !!buyerProfile.email
    });
  }
  return complete;
}

/**
 * Check if seller has completed onboarding and can access seller dashboard.
 *
 * Requirements:
 * - PREREQUISITE: Buyer profile is complete (full_name, phone, email)
 * - PREREQUISITE: User has agreed to buyer safety terms
 * - Has a seller profile
 * - Seller status is "approved"
 * - User has completed seller onboarding
 * - User has agreed to seller safety terms
 *
 * NOTE: identity_verified is NOT required (admin-only field).
 * NOTE: Stripe is NOT required for seller access. Sellers can manage their
 * dashboard, products, and shows without Stripe. Stripe is only required
 * for payment processing.
 *
 * @param user - The user object with onboarding flags
 * @param seller - The sellers row (or null)
 * @param buyerProfile - The buyer_profiles row (or null) - REQUIRED for seller access
 * @returns true if seller access is ready
 */
export function isSellerAccessReady(
  user: UserOnboardingState | null | undefined,
  seller: SellerProfile | null | undefined,
  buyerProfile?: BuyerProfile | null | undefined
): boolean {
  // PREREQUISITE: Buyer profile must be complete before seller access
  // NOTE: Buyer safety is NOT required for seller access (only for checkout/cart)
  if (!isBuyerProfileComplete(buyerProfile)) {
    console.warn("[GATE FAIL] isSellerAccessReady", { reason: "buyerProfile incomplete" });
    if (LM_FORENSIC()) {
      console.warn("[GATE FORENSIC][isSellerAccessReady FAIL]", {
        ts: new Date().toISOString(),
        fail_reason: "buyer_profile_incomplete",
        user_id: (user as any)?.id,
        user_email: (user as any)?.email,
        user_role: (user as any)?.role,
        user_meta_role: (user as any)?.user_metadata?.role,
        seller_safety_db: (user as any)?.seller_safety_agreed,
        seller_safety_meta: (user as any)?.user_metadata?.seller_safety_agreed,
        seller_onboarding_db: (user as any)?.seller_onboarding_completed,
        seller_onboarding_meta: (user as any)?.user_metadata?.seller_onboarding_completed,
        buyerProfile_exists: !!buyerProfile,
        buyerProfile_user_id: (buyerProfile as any)?.user_id,
        buyerProfile_full_name: (buyerProfile as any)?.full_name,
        buyerProfile_phone: (buyerProfile as any)?.phone,
        buyerProfile_email: (buyerProfile as any)?.email,
        seller_exists: !!seller,
        seller_status: (seller as any)?.status,
        seller_user_id: (seller as any)?.user_id,
      });
    }
    return false;
  }
  
  // Use helpers that check both DB fields AND user_metadata
  const sellerOnboardingDone = getSellerOnboardingCompleted(user);
  const sellerSafetyDone = getSellerSafetyAgreed(user);
  
  const ready = (
    !!seller &&
    seller.status === "approved" &&
    sellerOnboardingDone &&
    sellerSafetyDone
  );
  
  if (!ready) {
    console.warn("[GATE FAIL] isSellerAccessReady", { 
      reason: "seller conditions not met",
      hasSeller: !!seller,
      sellerStatus: seller?.status,
      seller_onboarding_completed: sellerOnboardingDone,
      seller_safety_agreed: sellerSafetyDone,
      seller_onboarding_db: user?.seller_onboarding_completed,
      seller_onboarding_meta: (user as any)?.user_metadata?.seller_onboarding_completed,
      seller_safety_db: user?.seller_safety_agreed,
      seller_safety_meta: (user as any)?.user_metadata?.seller_safety_agreed
    });
    if (LM_FORENSIC()) {
      // Determine specific failure reason
      let fail_reason = "unknown";
      if (!seller) fail_reason = "seller_missing";
      else if (seller.status !== "approved") fail_reason = "seller_not_approved";
      else if (!sellerOnboardingDone) fail_reason = "seller_onboarding_not_completed";
      else if (!sellerSafetyDone) fail_reason = "seller_safety_not_agreed";
      
      console.warn("[GATE FORENSIC][isSellerAccessReady FAIL]", {
        ts: new Date().toISOString(),
        fail_reason,
        user_id: (user as any)?.id,
        user_email: (user as any)?.email,
        user_role: (user as any)?.role,
        user_meta_role: (user as any)?.user_metadata?.role,
        buyer_safety_db: (user as any)?.buyer_safety_agreed,
        buyer_safety_meta: (user as any)?.user_metadata?.buyer_safety_agreed,
        seller_safety_db: (user as any)?.seller_safety_agreed,
        seller_safety_meta: (user as any)?.user_metadata?.seller_safety_agreed,
        seller_onboarding_db: (user as any)?.seller_onboarding_completed,
        seller_onboarding_meta: (user as any)?.user_metadata?.seller_onboarding_completed,
        buyerProfile_exists: !!buyerProfile,
        buyerProfile_user_id: (buyerProfile as any)?.user_id,
        buyerProfile_full_name: (buyerProfile as any)?.full_name,
        buyerProfile_phone: (buyerProfile as any)?.phone,
        buyerProfile_email: (buyerProfile as any)?.email,
        seller_exists: !!seller,
        seller_status: (seller as any)?.status,
        seller_user_id: (seller as any)?.user_id,
      });
    }
  }
  
  // SUCCESS LOG
  if (ready && LM_FORENSIC()) {
    console.warn("[GATE FORENSIC][isSellerAccessReady PASS]", {
      ts: new Date().toISOString(),
      user_id: (user as any)?.id,
      seller_status: (seller as any)?.status,
      buyerProfile_user_id: (buyerProfile as any)?.user_id,
      buyer_safety_db: (user as any)?.buyer_safety_agreed,
      buyer_safety_meta: (user as any)?.user_metadata?.buyer_safety_agreed,
      seller_onboarding_db: (user as any)?.seller_onboarding_completed,
      seller_safety_db: (user as any)?.seller_safety_agreed,
    });
  }
  
  return ready;
}

// ─────────────────────────────────────────────────────────────────────────
// SELLER PAYMENT (Stripe Required)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Check if seller can receive payments (Stripe connected).
 *
 * Requirements:
 * - All seller access requirements met
 * - Stripe account is connected
 *
 * This is required for:
 * - Receiving payments from buyers
 * - Processing checkout
 * - Payouts
 *
 * @param user - The user object with onboarding flags
 * @param seller - The sellers row (or null)
 * @param buyerProfile - The buyer_profiles row (or null)
 * @returns true if seller payment is ready
 */
export function isSellerPaymentReady(
  user: UserOnboardingState | null | undefined,
  seller: SellerProfile | null | undefined,
  buyerProfile?: BuyerProfile | null | undefined
): boolean {
  return (
    isSellerAccessReady(user, seller, buyerProfile) &&
    !!(seller?.stripe_account_id || seller?.stripe_connected)
  );
}

// ─────────────────────────────────────────────────────────────────────────
// READINESS SUMMARY (for debugging/display)
// ─────────────────────────────────────────────────────────────────────────

export interface OnboardingReadinessSummary {
  // Buyer
  hasBuyerProfile: boolean;
  buyerSafetyAgreed: boolean;
  buyerAccessReady: boolean;

  // Seller Application
  hasSellerProfile: boolean;
  sellerStatus: string | null;

  // Seller Access
  sellerApproved: boolean;
  sellerOnboardingCompleted: boolean;
  sellerSafetyAgreed: boolean;
  identityVerified: boolean;
  sellerAccessReady: boolean;

  // Seller Payment
  stripeConnected: boolean;
  sellerPaymentReady: boolean;
}

/**
 * Get a complete summary of onboarding readiness.
 * Useful for debugging and admin displays.
 *
 * @param user - The user object with onboarding flags
 * @param buyerProfile - The buyer_profiles row (or null)
 * @param seller - The sellers row (or null)
 * @returns Complete readiness summary
 */
export function getOnboardingReadiness(
  user: UserOnboardingState | null | undefined,
  buyerProfile: BuyerProfile | null | undefined,
  seller: SellerProfile | null | undefined
): OnboardingReadinessSummary {
  return {
    // Buyer
    hasBuyerProfile: !!buyerProfile,
    buyerSafetyAgreed: getBuyerSafetyAgreed(user),
    buyerAccessReady: isBuyerAccessReady(user, buyerProfile),

    // Seller Application
    hasSellerProfile: !!seller,
    sellerStatus: seller?.status ?? null,

    // Seller Access
    sellerApproved: seller?.status === "approved",
    sellerOnboardingCompleted: user?.seller_onboarding_completed === true,
    sellerSafetyAgreed: user?.seller_safety_agreed === true,
    identityVerified: user?.identity_verified === true,
    sellerAccessReady: isSellerAccessReady(user, seller, buyerProfile),

    // Seller Payment
    stripeConnected: !!(seller?.stripe_account_id || seller?.stripe_connected),
    sellerPaymentReady: isSellerPaymentReady(user, seller, buyerProfile),
  };
}

