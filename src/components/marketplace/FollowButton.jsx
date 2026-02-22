import React, { useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// BUYER PROFILE BOOTSTRAP HELPER
// Creates buyer_profiles row if missing (one-time, gated by auth)
// ═══════════════════════════════════════════════════════════════════════════
async function ensureBuyerProfile(user) {
  // Guard: only for authenticated users
  if (!user?.id) {
    return null;
  }

  // 1) Try to fetch existing buyer profile
  const { data: existing, error: fetchError } = await supabase
    .from("buyer_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    if (import.meta.env.DEV) {
      console.error("[BuyerProfileBootstrap] Fetch error:", fetchError.message);
    }
    return null;
  }

  // 2) If found, return it
  if (existing) {
    if (import.meta.env.DEV) {
      console.log("[BuyerProfileBootstrap]", { action: "existing", userId: user.id, buyerProfileId: existing.id });
    }
    return existing;
  }

  // 3) Not found: create minimal buyer profile row
  const { data: created, error: insertError } = await supabase
    .from("buyer_profiles")
    .insert({ user_id: user.id })
    .select("id")
    .single();

  if (insertError) {
    if (import.meta.env.DEV) {
      console.error("[BuyerProfileBootstrap] Insert error:", insertError.message, insertError.code);
    }
    return null;
  }

  if (import.meta.env.DEV) {
    console.log("[BuyerProfileBootstrap]", { action: "created", userId: user.id, buyerProfileId: created.id });
  }

  return created;
}

export default function FollowButton({ seller, initialFollowStatus, variant = "default", size = "default", className = "", iconOnly = false }) {
  const queryClient = useQueryClient();
  
  // Optimistic UI state
  const [optimisticFollowing, setOptimisticFollowing] = useState(null);

  // FIXED: Early return if seller is null
  if (!seller || !seller.id) {
    return null;
  }

  // Fetch current user internally (self-contained component)
  const { data: user, isLoading: isAuthLoading } = useQuery({
    queryKey: ['current-user-follow'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) return null;
      return data.user;
    },
    retry: false,
    staleTime: 300000
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Fetch buyer_profiles.id for current user
  // IMPORTANT: followed_sellers.buyer_id references buyer_profiles.id (NOT auth.users.id)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: buyerProfile } = useQuery({
    queryKey: ['buyer-profile-for-follow', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("buyer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) {
        console.warn("[FollowButton] Buyer profile query error:", error.message);
        return null;
      }
      
      return data; // { id: buyer_profiles.id } or null
    },
    enabled: !!user?.id,
    staleTime: 300000 // Cache for 5 minutes
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Check if user is following this seller
  // Uses buyer_profiles.id (NOT auth.users.id)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: followData, isLoading: followLoading } = useQuery({
    queryKey: ['is-following', buyerProfile?.id, seller?.id],
    queryFn: async () => {
      if (!buyerProfile?.id || !seller?.id) return null;
      
      const { data, error } = await supabase
        .from("followed_sellers")
        .select("id")
        .eq("buyer_id", buyerProfile.id)
        .eq("seller_id", seller.id)
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.warn("[FollowButton] Follow status query error:", error.message);
        return null;
      }
      
      return data; // Will be { id: ... } if following, null if not
    },
    enabled: !!buyerProfile?.id && !!seller?.id
  });

  // Determine isFollowing: use optimistic state if set, otherwise use query result
  const isFollowingFromQuery = !!followData;
  const isFollowing = optimisticFollowing !== null ? optimisticFollowing : isFollowingFromQuery;

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Follow mutation
  // Uses buyer_profiles.id (NOT auth.users.id)
  // IDEMPOTENT: 409 Conflict / 23505 duplicate key treated as SUCCESS
  // Accepts optional { buyerProfileId } to support bootstrap flow
  // ═══════════════════════════════════════════════════════════════════════════
  const followMutation = useMutation({
    mutationFn: async ({ buyerProfileId } = {}) => {
      // Use passed buyerProfileId or fall back to query result
      const resolvedBuyerId = buyerProfileId;
      
      if (!resolvedBuyerId || !seller?.id) {
        throw new Error("Buyer profile or seller information is missing");
      }
      
      if (import.meta.env.DEV) {
        console.log('[FollowMutation]', { action: 'follow', sellerId: seller.id, buyerProfileId: resolvedBuyerId });
      }
      
      const { data, error } = await supabase
        .from("followed_sellers")
        .insert({
          buyer_id: resolvedBuyerId,
          seller_id: seller.id
        })
        .select()
        .single();
      
      if (error) {
        // Check for duplicate key (already following) - treat as success
        // PostgreSQL code 23505 = unique_violation
        // HTTP 409 = Conflict
        const isDuplicateKey = error.code === '23505' || 
                               error.message?.includes('duplicate') ||
                               error.message?.includes('unique constraint');
        
        if (isDuplicateKey) {
          if (import.meta.env.DEV) {
            console.log('[FollowConflictHandled]', { buyerId: resolvedBuyerId, sellerId: seller.id });
          }
          // Return a success-like result; the follow already exists
          return { alreadyFollowing: true };
        }
        
        // For other errors, throw with error object to preserve code
        const err = new Error(error.message);
        err.code = error.code;
        throw err;
      }
      
      return data;
    },
    onMutate: () => {
      // Optimistic: immediately show as following
      setOptimisticFollowing(true);
    },
    onSuccess: () => {
      // Clear optimistic state and invalidate queries
      // This runs for both new follows AND idempotent conflict resolutions
      setOptimisticFollowing(null);
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers'] });
      queryClient.invalidateQueries({ queryKey: ['seller-storefront-card'] }); // Refresh seller_cards for follower_count
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-nearme'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-profile-for-follow'] }); // Refresh buyer profile cache
    },
    onError: (error) => {
      // Revert optimistic state on error (non-duplicate errors only)
      setOptimisticFollowing(null);
      if (import.meta.env.DEV) {
        console.error('[FollowMutation] Follow error:', error.message);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Unfollow mutation
  // Uses buyer_profiles.id (NOT auth.users.id)
  // Accepts optional { buyerProfileId } to support bootstrap flow
  // ═══════════════════════════════════════════════════════════════════════════
  const unfollowMutation = useMutation({
    mutationFn: async ({ buyerProfileId } = {}) => {
      // Use passed buyerProfileId or fall back to query result
      const resolvedBuyerId = buyerProfileId || buyerProfile?.id;
      
      if (!resolvedBuyerId || !seller?.id) {
        throw new Error("Buyer profile or seller information is missing");
      }
      
      if (import.meta.env.DEV) {
        console.log('[FollowMutation]', { action: 'unfollow', sellerId: seller.id, buyerProfileId: resolvedBuyerId });
      }
      
      const { error } = await supabase
        .from("followed_sellers")
        .delete()
        .eq("buyer_id", resolvedBuyerId)
        .eq("seller_id", seller.id);
      
      if (error) {
        throw new Error(error.message);
      }
    },
    onMutate: () => {
      // Optimistic: immediately show as not following
      setOptimisticFollowing(false);
    },
    onSuccess: () => {
      // Clear optimistic state and invalidate queries
      setOptimisticFollowing(null);
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers'] });
      queryClient.invalidateQueries({ queryKey: ['seller-storefront-card'] }); // Refresh seller_cards for follower_count
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['followed-sellers-nearme'] });
    },
    onError: (error) => {
      // Revert optimistic state on error
      setOptimisticFollowing(null);
      if (import.meta.env.DEV) {
        console.error('[FollowMutation] Unfollow error:', error.message);
      }
    }
  });

  const handleClick = async (e) => {
    e.stopPropagation();
    
    if (isAuthLoading) return;
    
    if (!user) {
      sessionStorage.setItem("login_return_url", window.location.href);
      window.location.href = "/Login";
      return;
    }

    // SAFETY CHECK: Verify buyer safety agreement before following
    if (user.user_metadata?.buyer_safety_agreed !== true) {
      window.location.href = `/BuyerSafetyAgreement?redirect=Marketplace`;
      return;
    }

    // Resolve buyer profile: use existing or bootstrap if missing
    let resolvedBuyerProfileId = buyerProfile?.id;
    
    if (!resolvedBuyerProfileId) {
      // BOOTSTRAP: Create buyer profile if missing (one-time, gated)
      const bootstrappedProfile = await ensureBuyerProfile(user);
      
      if (!bootstrappedProfile?.id) {
        if (import.meta.env.DEV) {
          console.error('[FollowButton] Failed to bootstrap buyer profile for user:', user.id);
        }
        return;
      }
      
      resolvedBuyerProfileId = bootstrappedProfile.id;
      
      // Invalidate buyer profile query so future renders have the new profile
      queryClient.invalidateQueries({ queryKey: ['buyer-profile-for-follow', user.id] });
    }

    // Execute follow or unfollow with resolved buyer profile ID
    if (isFollowing) {
      unfollowMutation.mutate({ buyerProfileId: resolvedBuyerProfileId });
    } else {
      followMutation.mutate({ buyerProfileId: resolvedBuyerProfileId });
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
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : isFollowing ? (
        <>
          <UserCheck className={`w-4 h-4 ${iconOnly ? "" : "mr-2"}`} />
          {!iconOnly && "Following"}
        </>
      ) : (
        <>
          <UserPlus className={`w-4 h-4 ${iconOnly ? "" : "mr-2"}`} />
          {!iconOnly && "Follow"}
        </>
      )}
    </Button>
  );
}