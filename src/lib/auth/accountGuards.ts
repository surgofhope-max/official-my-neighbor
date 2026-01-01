// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT GUARDS: Platform-level suspension enforcement
//
// These guards are used by write actions to enforce suspension semantics:
// - Suspended accounts cannot perform ANY write operations
// - Guards return a consistent error message for UX
// - Guards are pure functions - they don't fetch data, just check state
//
// Usage:
//   const { canProceed, error } = checkAccountActive(user);
//   if (!canProceed) {
//     toast({ title: "Action Blocked", description: error, variant: "destructive" });
//     return;
//   }
// ═══════════════════════════════════════════════════════════════════════════

export interface AccountGuardResult {
  canProceed: boolean;
  error: string | null;
}

/**
 * Check if user account is active and can perform actions
 * @param user - User object with account_status field
 * @returns { canProceed: boolean, error: string | null }
 */
export function checkAccountActive(user: { account_status?: string } | null): AccountGuardResult {
  if (!user) {
    return {
      canProceed: false,
      error: "You must be logged in to perform this action."
    };
  }

  const status = user.account_status || "active";
  
  if (status === "suspended") {
    return {
      canProceed: false,
      error: "Account is suspended. Action not allowed."
    };
  }

  // Future-proofing for 'banned' status
  if (status === "banned") {
    return {
      canProceed: false,
      error: "Account access has been revoked."
    };
  }

  // Account is active
  return {
    canProceed: true,
    error: null
  };
}

/**
 * Check if a user can perform buyer actions (checkout, chat, reviews, etc.)
 * @param user - User object with account_status field
 * @returns { canProceed: boolean, error: string | null }
 */
export function checkBuyerActionAllowed(user: { account_status?: string } | null): AccountGuardResult {
  return checkAccountActive(user);
}

/**
 * Check if a user can perform seller actions (create products, go live, etc.)
 * @param user - User object with account_status field
 * @returns { canProceed: boolean, error: string | null }
 */
export function checkSellerActionAllowed(user: { account_status?: string } | null): AccountGuardResult {
  return checkAccountActive(user);
}

/**
 * Async version that fetches account_status from Supabase
 * Use this when you don't have the user object with account_status already loaded
 */
export async function checkAccountActiveAsync(
  supabase: any,
  userId: string
): Promise<AccountGuardResult> {
  if (!userId) {
    return {
      canProceed: false,
      error: "You must be logged in to perform this action."
    };
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("account_status")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[AccountGuard] Failed to fetch account status:", error);
      // Fail closed - deny action if we can't verify status
      return {
        canProceed: false,
        error: "Unable to verify account status. Please try again."
      };
    }

    return checkAccountActive(user);
  } catch (err) {
    console.error("[AccountGuard] Exception checking account status:", err);
    return {
      canProceed: false,
      error: "Unable to verify account status. Please try again."
    };
  }
}

/**
 * Standard error message for suspended accounts
 */
export const SUSPENDED_ERROR_MESSAGE = "Account is suspended. Action not allowed.";





