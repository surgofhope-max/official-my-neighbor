/**
 * Route Guards
 *
 * Centralized route protection helpers for frontend access control.
 * These are UI-level guards only - backend RLS provides actual enforcement.
 */

import type { User } from "@supabase/supabase-js";

export interface Seller {
  id: string;
  status: "pending" | "approved" | "declined" | "suspended";
  [key: string]: unknown;
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
 * Check if user is an approved seller.
 *
 * @param user - The current user object (or null)
 * @param seller - The seller profile (or null)
 * @returns true if user is an approved seller or admin, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false if not authenticated
 * - Returns true for admin users (admin bypass)
 * - Returns true for approved sellers
 * - Returns false for pending/declined/suspended sellers
 */
export function requireSeller(
  user: User | null | undefined,
  seller: Seller | null | undefined
): boolean {
  // Not authenticated
  if (!requireAuth(user)) {
    return false;
  }

  // Admin bypass - admins can access seller routes
  if (isAdmin(user)) {
    return true;
  }

  // Must have a seller profile
  if (!seller) {
    return false;
  }

  // Seller must be approved
  return seller.status === "approved";
}

/**
 * Check if user is an admin.
 *
 * @param user - The current user object (or null)
 * @returns true if user is an admin, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false for null/undefined user
 * - Checks user.role or user.user_metadata.role
 */
export function requireAdmin(user: User | null | undefined): boolean {
  if (!requireAuth(user)) {
    return false;
  }

  // Check role in multiple locations (Supabase stores it in user_metadata)
  const role = (user as any)?.role || (user as any)?.user_metadata?.role;
  return role === "admin";
}

/**
 * Alias for requireAdmin for consistency.
 */
export function isAdmin(user: User | null | undefined): boolean {
  return requireAdmin(user);
}

/**
 * Check if user can access a specific route.
 *
 * @param routeName - The name of the route/page
 * @param user - The current user object (or null)
 * @param seller - The seller profile (or null)
 * @returns true if access is allowed, false otherwise
 *
 * This function:
 * - Never throws
 * - Provides centralized route access logic
 */
export function canAccessRoute(
  routeName: string,
  user: User | null | undefined,
  seller: Seller | null | undefined
): boolean {
  // Public routes - always accessible
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

  // Auth-required routes (buyer level)
  const authRoutes = [
    "BuyerProfile",
    "BuyerOrders",
    "Messages",
    "Notifications",
  ];

  if (authRoutes.includes(routeName)) {
    return requireAuth(user);
  }

  // Seller routes - require approved seller or admin
  const sellerRoutes = [
    "SellerDashboard",
    "SellerProducts",
    "SellerOrders",
    "SellerShows",
    "HostConsole",
    "SellerAnalytics",
    "SellerSettings",
  ];

  if (sellerRoutes.includes(routeName)) {
    return requireSeller(user, seller);
  }

  // Admin routes - require admin role
  const adminRoutes = [
    "AdminDashboard",
    "AdminSellers",
    "AdminAnalytics",
    "AdminGIVITracker",
    "AdminSellerData",
    "ManageUsers",
    "GIVIDiagnostics",
    "ShowVideoDebug",
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







