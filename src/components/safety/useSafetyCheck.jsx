import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabaseApi as base44 } from "@/api/supabaseClient";

/**
 * Hook to check if user has agreed to buyer safety terms
 * Redirects to BuyerSafetyAgreement if not agreed
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
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        if (currentUser.buyer_safety_agreed !== true) {
          // Redirect to safety agreement with return URL
          navigate(createPageUrl(`BuyerSafetyAgreement?redirect=${currentPage}`), { replace: true });
          return;
        }

        setIsAgreed(true);
      } catch (error) {
        // User not logged in - redirect to login
        base44.auth.redirectToLogin(createPageUrl(currentPage));
      }
      setIsChecking(false);
    };

    checkSafety();
  }, [currentPage, navigate]);

  return { isChecking, isAgreed, user };
}

/**
 * Hook to check if user has agreed to seller safety terms
 * Redirects to SellerSafetyAgreement if not agreed
 * 
 * @returns {{ isChecking: boolean, isAgreed: boolean, user: object | null }}
 */
export function useSellerSafetyCheck() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isAgreed, setIsAgreed] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkSafety = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        // Admin users bypass seller safety check
        if (currentUser.role === "admin") {
          setIsAgreed(true);
          setIsChecking(false);
          return;
        }

        if (currentUser.seller_safety_agreed !== true) {
          // Redirect to seller safety agreement
          navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
          return;
        }

        setIsAgreed(true);
      } catch (error) {
        // User not logged in - redirect to login
        base44.auth.redirectToLogin(createPageUrl("SellerDashboard"));
      }
      setIsChecking(false);
    };

    checkSafety();
  }, [navigate]);

  return { isChecking, isAgreed, user };
}

/**
 * Function to check buyer safety before an action (non-hook version)
 * Use this for event handlers like button clicks
 * 
 * @param {function} navigate - React Router navigate function
 * @param {string} currentPage - Current page for redirect back
 * @returns {Promise<boolean>} - True if user has agreed, false if redirected
 */
export async function checkBuyerSafetyBeforeAction(navigate, currentPage = "Marketplace") {
  try {
    const user = await base44.auth.me();
    
    if (user.buyer_safety_agreed !== true) {
      navigate(createPageUrl(`BuyerSafetyAgreement?redirect=${currentPage}`));
      return false;
    }
    
    return true;
  } catch (error) {
    base44.auth.redirectToLogin(createPageUrl(currentPage));
    return false;
  }
}

/**
 * Function to check seller safety before an action (non-hook version)
 * 
 * @param {function} navigate - React Router navigate function
 * @returns {Promise<boolean>} - True if user has agreed, false if redirected
 */
export async function checkSellerSafetyBeforeAction(navigate) {
  try {
    const user = await base44.auth.me();
    
    // Admin bypasses
    if (user.role === "admin") return true;
    
    if (user.seller_safety_agreed !== true) {
      navigate(createPageUrl("SellerSafetyAgreement"));
      return false;
    }
    
    return true;
  } catch (error) {
    base44.auth.redirectToLogin(createPageUrl("SellerDashboard"));
    return false;
  }
}