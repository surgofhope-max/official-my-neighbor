import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { requireSellerAsync, isAdmin, isSuperAdmin } from "@/lib/auth/routeGuards";

/**
 * Hook to check seller onboarding state (INFORMATIONAL ONLY)
 * 
 * STEP 3 REFACTOR: This hook NO LONGER blocks or redirects.
 * Seller access gating is handled by Option B in each page's loadUser/loadSeller.
 * 
 * This hook returns onboarding metadata for UI messaging purposes ONLY:
 * - Show banners about incomplete onboarding steps
 * - Display pending approval messages
 * - Indicate safety agreement status for informational purposes
 * 
 * Returns { isLoading, user, seller, onboardingInfo }
 */
export default function useSellerOnboardingCheck() {
  const [state, setState] = useState({
    isLoading: true,
    user: null,
    seller: null,
    onboardingInfo: {
      isApprovedSeller: false,
      sellerStatus: null,
      // These are now INFORMATIONAL ONLY - not used for gating
      safetyAgreed: false,
      onboardingCompleted: false,
      onboardingReset: false,
    }
  });

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      // Get current user
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        setState({
          isLoading: false,
          user: null,
          seller: null,
          onboardingInfo: {
            isApprovedSeller: false,
            sellerStatus: null,
            safetyAgreed: false,
            onboardingCompleted: false,
            onboardingReset: false,
          }
        });
        return;
      }

      const currentUser = data.user;

      // Read metadata for INFORMATIONAL purposes only
      const safetyAgreed = currentUser.user_metadata?.seller_safety_agreed === true;
      const onboardingCompleted = currentUser.user_metadata?.seller_onboarding_completed === true;
      const onboardingReset = currentUser.user_metadata?.seller_onboarding_reset === true;

      // Check for admin/superadmin
      if (isSuperAdmin(currentUser) || isAdmin(currentUser)) {
        // Load seller for admin
        const { data: sellerProfile } = await supabase
          .from("sellers")
          .select("*")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        setState({
          isLoading: false,
          user: currentUser,
          seller: sellerProfile,
          onboardingInfo: {
            isApprovedSeller: true, // Admin bypass
            sellerStatus: sellerProfile?.status || null,
            safetyAgreed,
            onboardingCompleted,
            onboardingReset,
          }
        });
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // OPTION B CHECK: Query DB for role + seller status (INFORMATIONAL)
      // ═══════════════════════════════════════════════════════════════════════════
      const sellerCheck = await requireSellerAsync(currentUser.id);

      setState({
        isLoading: false,
        user: currentUser,
        seller: sellerCheck.sellerRow,
        onboardingInfo: {
          isApprovedSeller: sellerCheck.ok,
          sellerStatus: sellerCheck.sellerStatus,
          safetyAgreed,
          onboardingCompleted,
          onboardingReset,
        }
      });

    } catch (error) {
      console.error("[useSellerOnboardingCheck] Error:", error);
      setState({
        isLoading: false,
        user: null,
        seller: null,
        onboardingInfo: {
          isApprovedSeller: false,
          sellerStatus: null,
          safetyAgreed: false,
          onboardingCompleted: false,
          onboardingReset: false,
        }
      });
    }
  };

  return state;
}
