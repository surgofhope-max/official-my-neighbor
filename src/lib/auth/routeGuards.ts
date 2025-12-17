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
 * Check if user is an approved seller.
 *
 * @param user - The current user object (or null)
 * @param seller - The seller profile (or null)
 * @returns true if user is an approved seller or admin, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false if not authenticated
 * - Returns true for super_admin (full bypass)
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

  // Seller must be approved
  return seller.status === "approved";
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
 * - SUPER_ADMIN can access ALL routes
 */
export function canAccessRoute(
  routeName: string,
  user: User | null | undefined,
  seller: Seller | null | undefined
): boolean {
  // SUPER_ADMIN bypass - can access ALL routes
  if (isSuperAdmin(user)) {
    return true;
  }

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







