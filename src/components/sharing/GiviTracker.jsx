import { useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for functions

/**
 * GIVI Tracker Component
 * Automatically tracks referral clicks when a user lands on a page via shared link
 * Place this component on pages that support GIVI tracking (LiveShow, CommunityPage, etc.)
 */
export default function GiviTracker({ type, id }) {
  useEffect(() => {
    trackReferral();
  }, [type, id]);

  const trackReferral = async () => {
    try {
      // Parse URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const referrerId = urlParams.get('ref');
      const giviCode = urlParams.get('givi');

      // Only track if both ref and givi parameters are present
      if (!referrerId || !giviCode) {
        return;
      }

      console.log('🎁 GIVI referral detected:', { referrerId, giviCode, type, id });

      // Get current user (if logged in)
      let currentUser = null;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user) {
          currentUser = data.user;
        }
      } catch (error) {
        // User not logged in, that's ok
      }

      // Get visitor IP (client-side approximation)
      let visitorIp = null;
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        visitorIp = ipData.ip;
      } catch (error) {
        console.log('Could not get visitor IP:', error);
      }

      // Call backend to track GIVI entry
      const response = await base44.functions.invoke('trackGiviShare', {
        showId: type === 'show' ? id : null,
        referrerId: referrerId,
        referralCode: giviCode,
        visitorUserId: currentUser?.id || null,
        visitorIp: visitorIp
      });

      console.log('✅ GIVI tracking response:', response.data);

      // Store tracking in localStorage to prevent duplicate tracking
      const trackingKey = `givi_tracked_${giviCode}`;
      localStorage.setItem(trackingKey, 'true');

    } catch (error) {
      console.error('❌ Error tracking GIVI referral:', error);
    }
  };

  return null; // This is a utility component, renders nothing
}