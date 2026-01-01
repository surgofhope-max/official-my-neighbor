/**
 * Route Guards
 *
 * Centralized route protection helpers for frontend access control.
 * These are UI-level guards only - backend RLS provides actual enforcement.
 *
 * LOCKED RULE (Option B):
 * User is a seller in UI IF AND ONLY IF:
 *   1. public.users.role === 'seller'
 *   2. sellers.status === 'approved'
 *
 * ACCESS TIERS (see onboardingState.ts):
 * - Viewer: Anyone (no requirements)
 * - Buyer: isBuyerAccessReady
 * - Seller Dashboard: isSellerAccessReady (no Stripe required)
 * - Seller Payment: isSellerPaymentReady (Stripe required)
 */

import type { User } from "@supabase/supabase-js";
import {
  isApprovedSellerByUserId,
  isAdminByUserId,
  type ApprovedSellerResult,
} from "./isApprovedSeller";
import {
  isBuyerAccessReady,
  isSellerAccessReady,
  isSellerPaymentReady,
  type UserOnboardingState,
  type BuyerProfile,
  type SellerProfile,
} from "./onboardingState";

// Re-export onboarding helpers for convenience
export {
  isBuyerAccessReady,
  isSellerAccessReady,
  isSellerPaymentReady,
} from "./onboardingState";

export interface Seller {
  id: string;
  status: "pending" | "approved" | "declined" | "suspended";
  user_id?: string;
  stripe_account_id?: string | null;
  stripe_connected?: boolean;
  [key: string]: unknown;
}

// Re-export for convenience
export type { ApprovedSellerResult };

/**
 * Get user role from metadata.
 * Checks multiple locations for role: user_metadata, app_metadata, and direct property.
 */
function getUserRole(user: User | null | undefined): string | null {
  if (!user) return null;
  return (user as any)?.user_metadata?.role 
    || (user as any)?.app_metadata?.role 
    || (user as any)?.role 
    || null;
}

/**
 * Check if user is a SUPER_ADMIN.
 *
 * SUPER_ADMIN has full system authority and bypasses ALL product gating:
 * - viewer, buyer, seller restrictions
 * - onboarding requirements
 * - safety agreements
 * - approval status checks
 *
 * @param user - The current user object (or null)
 * @returns true if user is super_admin, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false for null/undefined user
 * - Checks user_metadata.role for "super_admin"
 */
export function isSuperAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = getUserRole(user);
  return role === "super_admin";
}

/**
 * Check if user is authenticated.
 *
 * @param user - The current user object (or null)
 * @returns true if user is logged in, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false for null/undefined user
 */
export function requireAuth(user: User | null | undefined): boolean {
  return user !== null && user !== undefined;
}

/**
 * Check if user is an approved seller (SYNCHRONOUS version).
 *
 * LOCKED RULE (Option B):
 * User is a seller in UI IF AND ONLY IF:
 *   1. public.users.role === 'seller'
 *   2. sellers.status === 'approved'
 *
 * This sync version checks seller.status but relies on caller to verify
 * that dbRole is 'seller'. Use requireSellerAsync() for full DB verification.
 *
 * @param user - The current user object (or null)
 * @param seller - The seller profile (or null)
 * @param dbRole - The user's role from public.users (optional, for Option B enforcement)
 * @returns true if user is an approved seller or admin, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false if not authenticated
 * - Returns true for super_admin (full bypass)
 * - Returns true for admin users (admin bypass)
 * - Returns true for approved sellers with role='seller'
 * - Returns false for pending/declined/suspended sellers
 */
export function requireSeller(
  user: User | null | undefined,
  seller: Seller | null | undefined,
  dbRole?: string | null
): boolean {
  // Not authenticated
  if (!requireAuth(user)) {
    return false;
  }

  // SUPER_ADMIN bypass - full system authority
  if (isSuperAdmin(user)) {
    return true;
  }

  // Admin bypass - admins can access seller routes
  if (isAdmin(user)) {
    return true;
  }

  // Must have a seller profile
  if (!seller) {
    return false;
  }

  // OPTION B ENFORCEMENT: If dbRole is provided, require role='seller'
  if (dbRole !== undefined && dbRole !== "seller") {
    return false;
  }

  // Seller must be approved
  return seller.status === "approved";
}

/**
 * Check if user is an approved seller (ASYNC version using DB truth).
 *
 * LOCKED RULE (Option B):
 * User is a seller in UI IF AND ONLY IF:
 *   1. public.users.role === 'seller'
 *   2. sellers.status === 'approved'
 *
 * This version queries the database directly for authoritative checks.
 *
 * @param userId - The auth.users.id to check
 * @returns Promise<ApprovedSellerResult> with full details
 */
export async function requireSellerAsync(
  userId: string | null
): Promise<ApprovedSellerResult> {
  return isApprovedSellerByUserId(userId);
}

/**
 * Check if user is an admin using DB truth (ASYNC).
 *
 * @param userId - The auth.users.id to check
 * @returns Promise<boolean> true if admin or super_admin
 */
export async function requireAdminAsync(userId: string | null): Promise<boolean> {
  return isAdminByUserId(userId);
}

/**
 * Check if user is an admin (or super_admin).
 *
 * @param user - The current user object (or null)
 * @returns true if user is an admin or super_admin, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false for null/undefined user
 * - Checks user.role or user.user_metadata.role
 * - super_admin implicitly includes admin privileges
 */
export function requireAdmin(user: User | null | undefined): boolean {
  if (!requireAuth(user)) {
    return false;
  }

  // SUPER_ADMIN has all admin privileges
  if (isSuperAdmin(user)) {
    return true;
  }

  // Check role in multiple locations (Supabase stores it in user_metadata)
  const role = getUserRole(user);
  return role === "admin";
}

/**
 * Alias for requireAdmin for consistency.
 */
export function isAdmin(user: User | null | undefined): boolean {
  return requireAdmin(user);
}

/**
 * Check if user has full seller access (can access seller dashboard).
 *
 * Uses canonical onboarding state machine.
 * Stripe is NOT required for seller dashboard access.
 *
 * @param user - The current user object (with onboarding flags)
 * @param seller - The seller profile (or null)
 * @returns true if seller can access dashboard
 */
export function requireSellerAccess(
  user: (User & UserOnboardingState) | null | undefined,
  seller: Seller | null | undefined
): boolean {
  // Not authenticated
  if (!requireAuth(user)) {
    return false;
  }

  // SUPER_ADMIN bypass
  if (isSuperAdmin(user)) {
    return true;
  }

  // Admin bypass
  if (isAdmin(user)) {
    return true;
  }

  // Use canonical onboarding state machine
  return isSellerAccessReady(user as UserOnboardingState, seller as SellerProfile);
}

/**
 * Check if seller can process payments (Stripe required).
 *
 * Uses canonical onboarding state machine.
 *
 * @param user - The current user object (with onboarding flags)
 * @param seller - The seller profile (or null)
 * @returns true if seller can process payments
 */
export function requireSellerPayment(
  user: (User & UserOnboardingState) | null | undefined,
  seller: Seller | null | undefined
): boolean {
  // Not authenticated
  if (!requireAuth(user)) {
    return false;
  }

  // SUPER_ADMIN bypass
  if (isSuperAdmin(user)) {
    return true;
  }

  // Admin bypass
  if (isAdmin(user)) {
    return true;
  }

  // Use canonical onboarding state machine
  return isSellerPaymentReady(user as UserOnboardingState, seller as SellerProfile);
}

/**
 * Check if user can access buyer checkout features.
 *
 * Uses canonical onboarding state machine.
 *
 * @param user - The current user object (with onboarding flags)
 * @param buyerProfile - The buyer profile (or null)
 * @returns true if buyer can checkout
 */
export function requireBuyerCheckout(
  user: (User & UserOnboardingState) | null | undefined,
  buyerProfile: BuyerProfile | null | undefined
): boolean {
  // Not authenticated
  if (!requireAuth(user)) {
    return false;
  }

  // SUPER_ADMIN bypass
  if (isSuperAdmin(user)) {
    return true;
  }

  // Admin bypass
  if (isAdmin(user)) {
    return true;
  }

  // Use canonical onboarding state machine
  return isBuyerAccessReady(user as UserOnboardingState, buyerProfile);
}

/**
 * Check if user can access a specific route.
 *
 * @param routeName - The name of the route/page
 * @param user - The current user object (or null)
 * @param seller - The seller profile (or null)
 * @param buyerProfile - The buyer profile (or null, optional)
 * @returns true if access is allowed, false otherwise
 *
 * This function:
 * - Never throws
 * - Provides centralized route access logic
 * - SUPER_ADMIN can access ALL routes
 * - Uses canonical onboarding state machine
 */
export function canAccessRoute(
  routeName: string,
  user: (User & UserOnboardingState) | null | undefined,
  seller: Seller | null | undefined,
  buyerProfile?: BuyerProfile | null | undefined
): boolean {
  // SUPER_ADMIN bypass - can access ALL routes
  if (isSuperAdmin(user)) {
    return true;
  }

  // Public routes - always accessible (Viewer tier)
  const publicRoutes = [
    "Marketplace",
    "Communities",
    "CommunityPage",
    "SellerStorefront",
    "LiveShow",
    "LiveShows",
    "NearMe",
    "Login",
    "Sellers",
  ];

  if (publicRoutes.includes(routeName)) {
    return true;
  }

  // Auth-required routes (buyer level, but no onboarding check)
  const authRoutes = [
    "BuyerProfile",
    "BuyerOrders",
    "Messages",
    "Notifications",
  ];

  if (authRoutes.includes(routeName)) {
    return requireAuth(user);
  }

  // Buyer checkout routes - require isBuyerAccessReady
  const buyerCheckoutRoutes = [
    "Checkout",
    "Cart",
  ];

  if (buyerCheckoutRoutes.includes(routeName)) {
    return requireBuyerCheckout(user, buyerProfile);
  }

  // Seller dashboard routes - require isSellerAccessReady (NO Stripe required)
  const sellerDashboardRoutes = [
    "SellerDashboard",
    "SellerProducts",
    "SellerOrders",
    "SellerShows",
    "HostConsole",
    "SellerAnalytics",
    "SellerSettings",
  ];

  if (sellerDashboardRoutes.includes(routeName)) {
    return requireSellerAccess(user, seller);
  }

  // Seller payment routes - require isSellerPaymentReady (Stripe required)
  const sellerPaymentRoutes = [
    "SellerPayouts",
    "SellerStripeConnect",
  ];

  if (sellerPaymentRoutes.includes(routeName)) {
    return requireSellerPayment(user, seller);
  }

  // Admin routes - require admin role (unchanged)
  const adminRoutes = [
    "AdminDashboard",
    "AdminSellers",
    "AdminAnalytics",
    "AdminGIVITracker",
    "AdminSellerData",
    "ManageUsers",
    "GIVIDiagnostics",
    "ShowVideoDebug",
    "AdminReports",
  ];

  if (adminRoutes.includes(routeName)) {
    return requireAdmin(user);
  }

  // Onboarding routes - require auth only
  const onboardingRoutes = [
    "SellerOnboarding",
    "SellerSafetyAgreement",
  ];

  if (onboardingRoutes.includes(routeName)) {
    return requireAuth(user);
  }

  // Default: allow access (unknown routes may be public)
  return true;
}

/**
 * Get the redirect destination for unauthorized access.
 *
 * @param routeName - The route that was denied
 * @param user - The current user object (or null)
 * @returns The route name to redirect to
 */
export function getUnauthorizedRedirect(
  routeName: string,
  user: User | null | undefined
): string {
  // Not logged in - redirect to Marketplace (not Login, per requirements)
  if (!requireAuth(user)) {
    return "Marketplace";
  }

  // Logged in but not authorized - redirect to appropriate page
  return "Marketplace";
}







