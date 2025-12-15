import { useQuery } from "@tanstack/react-query";
import { supabaseApi as base44 } from "@/api/supabaseClient";

/**
 * Hook to check if a buyer is banned by a specific seller
 * @param {string} sellerId - The seller ID
 * @param {string} buyerId - The buyer ID to check
 * @returns {Object} { isBanned, banLevel, isLoading }
 */
export function useBuyerBanCheck(sellerId, buyerId) {
  const { data: banRecord, isLoading } = useQuery({
    queryKey: ['buyer-ban-check', sellerId, buyerId],
    queryFn: async () => {
      if (!sellerId || !buyerId) return null;
      const bans = await base44.entities.SellerBannedBuyer.filter({
        seller_id: sellerId,
        buyer_id: buyerId
      });
      return bans.length > 0 ? bans[0] : null;
    },
    enabled: !!sellerId && !!buyerId,
    staleTime: 30000 // Cache for 30 seconds
  });

  return {
    isBanned: !!banRecord,
    banLevel: banRecord?.ban_level || null,
    banReason: banRecord?.reason || null,
    isLoading
  };
}

/**
 * Async function to check if a buyer is banned (for use outside React components)
 * @param {string} sellerId - The seller ID
 * @param {string} buyerId - The buyer ID to check
 * @returns {Promise<Object>} { isBanned, banLevel, banReason }
 */
export async function checkBuyerBan(sellerId, buyerId) {
  if (!sellerId || !buyerId) {
    return { isBanned: false, banLevel: null, banReason: null };
  }

  try {
    const bans = await base44.entities.SellerBannedBuyer.filter({
      seller_id: sellerId,
      buyer_id: buyerId
    });
    
    if (bans.length > 0) {
      return {
        isBanned: true,
        banLevel: bans[0].ban_level,
        banReason: bans[0].reason
      };
    }
    
    return { isBanned: false, banLevel: null, banReason: null };
  } catch (error) {
    console.error("Error checking buyer ban:", error);
    return { isBanned: false, banLevel: null, banReason: null };
  }
}