import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/supabaseClient";

export function useViewerBanCheck(sellerId, viewerId) {
  const { data: ban, isLoading } = useQuery({
    queryKey: ['viewer-ban-check', sellerId, viewerId],
    queryFn: async () => {
      if (!sellerId || !viewerId) return null;
      const { data } = await supabase
        .from('viewer_bans')
        .select('id, ban_type')
        .eq('seller_id', sellerId)
        .eq('viewer_id', viewerId)
        .maybeSingle();
      return data;
    },
    enabled: !!sellerId && !!viewerId
  });

  return {
    isBanned: !!ban,
    banType: ban?.ban_type,
    ban,
    isLoading
  };
}
