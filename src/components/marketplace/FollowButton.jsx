import React from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck } from "lucide-react";

export default function FollowButton({ seller, user, variant = "default", size = "default", className = "" }) {
  const queryClient = useQueryClient();

  // FIXED: Early return if seller is null
  if (!seller || !seller.id) {
    return null;
  }

  // Check if user is following this seller
  const { data: followData = [] } = useQuery({
    queryKey: ['is-following', user?.id, seller?.id],
    queryFn: async () => {
      if (!user?.id || !seller?.id) return [];
      return await base44.entities.FollowedSeller.filter({
        buyer_id: user.id,
        seller_id: seller.id
      });
    },
    enabled: !!user?.id && !!seller?.id
  });

  const isFollowing = followData.length > 0;

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: () => {
      if (!user?.id || !seller?.id) {
        throw new Error("User or seller information is missing");
      }
      return base44.entities.FollowedSeller.create({
        buyer_id: user.id,
        seller_id: seller.id
      });
    },
    onSuccess: () => {
      // FIXED: Invalidate ALL follower-related queries for consistency
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers'] });
      queryClient.invalidateQueries({ queryKey: ['seller-followers'] });
      queryClient.invalidateQueries({ queryKey: ['seller-follower-count'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-nearme'] });
      queryClient.invalidateQueries({ queryKey: ['seller-following'] });
    }
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (followData[0]?.id) {
        await base44.entities.FollowedSeller.delete(followData[0].id);
      }
    },
    onSuccess: () => {
      // FIXED: Invalidate ALL follower-related queries for consistency
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers'] });
      queryClient.invalidateQueries({ queryKey: ['seller-followers'] });
      queryClient.invalidateQueries({ queryKey: ['seller-follower-count'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-nearme'] });
      queryClient.invalidateQueries({ queryKey: ['seller-following'] });
    }
  });

  const handleClick = async (e) => {
    e.stopPropagation();
    
    if (!user) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }

    // SAFETY CHECK: Verify buyer safety agreement before following
    if (user.buyer_safety_agreed !== true) {
      window.location.href = `/BuyerSafetyAgreement?redirect=Marketplace`;
      return;
    }

    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const isPending = followMutation.isPending || unfollowMutation.isPending;

  return (
    <Button
      variant={isFollowing ? "outline" : variant}
      size={size}
      onClick={handleClick}
      disabled={isPending}
      className={`${className} ${isFollowing ? "border-purple-500 text-purple-600" : ""}`}
    >
      {isPending ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
      ) : isFollowing ? (
        <>
          <UserCheck className="w-4 h-4 mr-2" />
          Following
        </>
      ) : (
        <>
          <UserPlus className="w-4 h-4 mr-2" />
          Follow
        </>
      )}
    </Button>
  );
}