/**
 * Effective User Context Utility
 *
 * Provides a unified way to determine the "effective" user ID
 * for data scoping, supporting admin impersonation.
 *
 * This utility is foundational and must be used by all future
 * Supabase queries that need user-scoped data.
 */

import type { User } from "@supabase/supabase-js";

export interface EffectiveUserContext {
  effectiveUserId: string | null;
  isImpersonating: boolean;
  impersonatedUserId: string | null;
  impersonatedSellerId: string | null;
  impersonatedUserEmail: string | null;
}

/**
 * Session storage keys used for admin impersonation
 */
const IMPERSONATION_KEYS = {
  userId: "admin_impersonate_user_id",
  sellerId: "admin_impersonate_seller_id",
  userEmail: "admin_impersonate_user_email",
} as const;

/**
 * Safely read a value from sessionStorage.
 * Returns null if not found or if sessionStorage is unavailable.
 */
function safeGetSessionStorage(key: string): string | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) {
      return null;
    }
    const value = sessionStorage.getItem(key);
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Safely determine if the user has admin role.
 * Checks user_metadata.role and app_metadata.role.
 * Returns false if role cannot be determined.
 */
function isAdminUser(user: User | null): boolean {
  if (!user) {
    return false;
  }

  try {
    // Check user_metadata first (common location)
    const userMetadataRole = user.user_metadata?.role;
    if (userMetadataRole === "admin") {
      return true;
    }

    // Check app_metadata (alternative location)
    const appMetadataRole = user.app_metadata?.role;
    if (appMetadataRole === "admin") {
      return true;
    }

    // Check direct role property if it exists
    const directRole = (user as unknown as { role?: string }).role;
    if (directRole === "admin") {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get the effective user context for data scoping.
 *
 * @param user - The current authenticated Supabase user, or null if logged out
 * @returns EffectiveUserContext with resolved effective user ID and impersonation state
 *
 * Rules:
 * - If user is null → effectiveUserId is null
 * - If user is admin AND impersonation keys exist → use impersonated user ID
 * - Otherwise → use authenticated user's ID
 */
export function getEffectiveUserContext(user: User | null): EffectiveUserContext {
  // Default context for logged-out users
  if (!user) {
    return {
      effectiveUserId: null,
      isImpersonating: false,
      impersonatedUserId: null,
      impersonatedSellerId: null,
      impersonatedUserEmail: null,
    };
  }

  // Read impersonation keys from sessionStorage
  const impersonatedUserId = safeGetSessionStorage(IMPERSONATION_KEYS.userId);
  const impersonatedSellerId = safeGetSessionStorage(IMPERSONATION_KEYS.sellerId);
  const impersonatedUserEmail = safeGetSessionStorage(IMPERSONATION_KEYS.userEmail);

  // Check if user is admin and impersonation is active
  const userIsAdmin = isAdminUser(user);
  const hasImpersonationTarget = impersonatedUserId !== null;
  const isImpersonating = userIsAdmin && hasImpersonationTarget;

  // Determine effective user ID
  const effectiveUserId = isImpersonating ? impersonatedUserId : user.id;

  return {
    effectiveUserId,
    isImpersonating,
    impersonatedUserId: isImpersonating ? impersonatedUserId : null,
    impersonatedSellerId: isImpersonating ? impersonatedSellerId : null,
    impersonatedUserEmail: isImpersonating ? impersonatedUserEmail : null,
  };
}







