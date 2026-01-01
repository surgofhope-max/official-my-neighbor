import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabase/supabaseClient";

/**
 * Hook to check if user has agreed to buyer safety terms
 * Redirects to BuyerSafetyAgreement if not agreed
 * 
 * NOTE: This is for BUYER flows only. Seller gating uses Option B (DB truth).
 * 
 * @param {string} currentPage - Current page name for redirect back
 * @returns {{ isChecking: boolean, isAgreed: boolean, user: object | null }}
 */
export function useBuyerSafetyCheck(currentPage = "Marketplace") {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isAgreed, setIsAgreed] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkSafety = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          // User not logged in - redirect to login
          sessionStorage.setItem("login_return_url", createPageUrl(currentPage));
          window.location.href = "/Login";
          return;
        }
        const currentUser = data.user;
        setUser(currentUser);

        if (currentUser.user_metadata?.buyer_safety_agreed !== true) {
          // Redirect to safety agreement with return URL
          navigate(createPageUrl(`BuyerSafetyAgreement?redirect=${currentPage}`), { replace: true });
          return;
        }

        setIsAgreed(true);
      } catch (error) {
        // User not logged in - redirect to login
        sessionStorage.setItem("login_return_url", createPageUrl(currentPage));
        window.location.href = "/Login";
      }
      setIsChecking(false);
    };

    checkSafety();
  }, [currentPage, navigate]);

  return { isChecking, isAgreed, user };
}

/**
 * Hook to check seller safety agreement status (INFORMATIONAL ONLY)
 * 
 * STEP 3 REFACTOR: This hook NO LONGER blocks or redirects for sellers.
 * Seller access gating is handled by Option B in each page's loadUser/loadSeller.
 * 
 * Returns safety metadata for informational UI purposes only.
 * 
 * @returns {{ isChecking: boolean, isAgreed: boolean, user: object | null }}
 */
export function useSellerSafetyCheck() {
  const [isChecking, setIsChecking] = useState(true);
  const [isAgreed, setIsAgreed] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkSafety = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          setIsChecking(false);
          return;
        }
        const currentUser = data.user;
        setUser(currentUser);

        // Admin users always pass (informational)
        if (currentUser.user_metadata?.role === "admin") {
          setIsAgreed(true);
          setIsChecking(false);
          return;
        }

        // Check metadata for informational purposes
        setIsAgreed(currentUser.user_metadata?.seller_safety_agreed === true);
      } catch (error) {
        console.error("[useSellerSafetyCheck] Error:", error);
      }
      setIsChecking(false);
    };

    checkSafety();
  }, []);

  return { isChecking, isAgreed, user };
}

/**
 * Function to check buyer safety before an action (non-hook version)
 * Use this for event handlers like button clicks
 * 
 * NOTE: This is for BUYER flows only. Seller gating uses Option B (DB truth).
 * 
 * @param {function} navigate - React Router navigate function
 * @param {string} currentPage - Current page for redirect back
 * @returns {Promise<boolean>} - True if user has agreed, false if redirected
 */
export async function checkBuyerSafetyBeforeAction(navigate, currentPage = "Marketplace") {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      sessionStorage.setItem("login_return_url", createPageUrl(currentPage));
      window.location.href = "/Login";
      return false;
    }
    const user = data.user;
    
    if (user.user_metadata?.buyer_safety_agreed !== true) {
      navigate(createPageUrl(`BuyerSafetyAgreement?redirect=${currentPage}`));
      return false;
    }
    
    return true;
  } catch (error) {
    sessionStorage.setItem("login_return_url", createPageUrl(currentPage));
    window.location.href = "/Login";
    return false;
  }
}

/**
 * Function to check seller safety status (INFORMATIONAL ONLY)
 * 
 * STEP 3 REFACTOR: This function NO LONGER blocks or redirects.
 * Seller access gating is handled by Option B in each page's loadUser/loadSeller.
 * 
 * Returns true if safety agreed (informational), but does NOT redirect.
 * 
 * @param {function} navigate - React Router navigate function (unused, kept for API compat)
 * @returns {Promise<boolean>} - True if safety agreed (informational only)
 */
export async function checkSellerSafetyBeforeAction(navigate) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return false;
    }
    const user = data.user;
    
    // Admin bypasses (informational)
    if (user.user_metadata?.role === "admin") return true;
    
    // Return safety status for informational purposes
    return user.user_metadata?.seller_safety_agreed === true;
  } catch (error) {
    return false;
  }
}
