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
export function isBuyerAccessReady(
  user: UserOnboardingState | null | undefined,
  buyerProfile: BuyerProfile | null | undefined
): boolean {
  return !!buyerProfile && user?.buyer_safety_agreed === true;
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
 * Check if seller has completed onboarding and can access seller dashboard.
 *
 * Requirements:
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
 * @returns true if seller access is ready
 */
export function isSellerAccessReady(
  user: UserOnboardingState | null | undefined,
  seller: SellerProfile | null | undefined
): boolean {
  return (
    !!seller &&
    seller.status === "approved" &&
    user?.seller_onboarding_completed === true &&
    user?.seller_safety_agreed === true
  );
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
 * @returns true if seller payment is ready
 */
export function isSellerPaymentReady(
  user: UserOnboardingState | null | undefined,
  seller: SellerProfile | null | undefined
): boolean {
  return (
    isSellerAccessReady(user, seller) &&
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
    buyerSafetyAgreed: user?.buyer_safety_agreed === true,
    buyerAccessReady: isBuyerAccessReady(user, buyerProfile),

    // Seller Application
    hasSellerProfile: !!seller,
    sellerStatus: seller?.status ?? null,

    // Seller Access
    sellerApproved: seller?.status === "approved",
    sellerOnboardingCompleted: user?.seller_onboarding_completed === true,
    sellerSafetyAgreed: user?.seller_safety_agreed === true,
    identityVerified: user?.identity_verified === true,
    sellerAccessReady: isSellerAccessReady(user, seller),

    // Seller Payment
    stripeConnected: !!(seller?.stripe_account_id || seller?.stripe_connected),
    sellerPaymentReady: isSellerPaymentReady(user, seller),
  };
}

