import { useQuery } from "@tanstack/react-query";
import { supabaseApi as base44 } from "@/api/supabaseClient";

export function useViewerBanCheck(sellerId, viewerId) {
  const { data: ban, isLoading } = useQuery({
    queryKey: ['viewer-ban-check', sellerId, viewerId],
    queryFn: async () => {
      if (!sellerId || !viewerId) return null;
      const bans = await base44.entities.ViewerBan.filter({
        seller_id: sellerId,
        viewer_id: viewerId
      });
      return bans.length > 0 ? bans[0] : null;
    },
    enabled: !!sellerId && !!viewerId,
    staleTime: 10000
  });

  return {
    isBanned: !!ban,
    banType: ban?.ban_type,
    ban,
    isLoading
  };
}