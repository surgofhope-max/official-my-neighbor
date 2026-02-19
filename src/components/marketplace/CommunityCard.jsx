import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Radio, Sparkles, Package, Store, Home, ShoppingCart, Truck, Leaf, Video, Key, UserPlus, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ShareButton from "../sharing/ShareButton";

export default function CommunityCard({ community, onClick, followerCount = 0, liveShowCount = 0 }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followRecordId, setFollowRecordId] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    let currentUser = null;

    // Auth check — ONLY this section may set user = null
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        setUser(null);
        return;
      }
      currentUser = data.user;
      setUser(currentUser);
    } catch (err) {
      setUser(null);
      return;
    }

    // Follow status check — MUST NOT affect auth state
    try {
      const { data: followRow, error: followErr } = await supabase
        .from("followed_communities")
        .select("id")
        .eq("user_id", currentUser.id)
        .eq("community_id", community.id)
        .maybeSingle();

      if (followErr) {
        // Fail safely — user remains authenticated
        return;
      }

      if (followRow?.id) {
        setIsFollowing(true);
        setFollowRecordId(followRow.id);
      } else {
        setIsFollowing(false);
        setFollowRecordId(null);
      }
    } catch (err) {
      // Swallow error — user remains authenticated
    }
  };

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        sessionStorage.setItem("login_return_url", window.location.href);
        window.location.href = "/Login";
        return;
      }
      
      const { data, error } = await supabase
        .from("followed_communities")
        .insert({ user_id: user.id, community_id: community.id })
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: (newFollow) => {
      setIsFollowing(true);
      setFollowRecordId(newFollow?.id ?? null);
      queryClient.invalidateQueries({ queryKey: ['followed-communities'] });
      queryClient.invalidateQueries({ queryKey: ['followed-communities', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['buyer-followed-communities', user?.id] });
    },
    onError: () => {
      // Fail safely — do not redirect, do not modify auth state
    }
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      let error;
      if (followRecordId) {
        const result = await supabase
          .from("followed_communities")
          .delete()
          .eq("id", followRecordId);
        error = result.error;
      } else if (user?.id && community?.id) {
        // Fallback: delete by user_id + community_id
        const result = await supabase
          .from("followed_communities")
          .delete()
          .eq("user_id", user.id)
          .eq("community_id", community.id);
        error = result.error;
      }
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      setIsFollowing(false);
      setFollowRecordId(null);
      queryClient.invalidateQueries({ queryKey: ['followed-communities'] });
      queryClient.invalidateQueries({ queryKey: ['followed-communities', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['buyer-followed-communities', user?.id] });
    },
    onError: () => {
      // Fail safely — do not redirect, do not modify auth state
    }
  });

  const handleFollowClick = (e) => {
    e.stopPropagation();
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const getIcon = () => {
    // If no icon name or "None", return null
    if (!community.icon_name || community.icon_name === "None") {
      return null;
    }
    
    const iconMap = {
      'Package': Package,
      'Store': Store,
      'Home': Home,
      'ShoppingCart': ShoppingCart,
      'Sparkles': Sparkles,
      'Truck': Truck,
      'Leaf': Leaf,
      'Video': Video,
      'Key': Key
    };
    const IconComponent = iconMap[community.icon_name] || Package;
    return <IconComponent className="w-8 h-8 text-white" />;
  };

  return (
    <Card
      className="group cursor-pointer border-0 overflow-hidden transition-all duration-300 hover:scale-105 w-full mx-auto"
      style={{
        boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.2)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0px 8px 20px rgba(0, 0, 0, 0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0px 6px 16px rgba(0, 0, 0, 0.2)';
      }}
    >
      {/* Background Section - Fixed aspect ratio */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-t-lg" onClick={onClick}>
        {/* Background Image or Gradient */}
        {community.bg_image_url ? (
          <img
            src={community.bg_image_url}
            alt={community.label}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${community.color_gradient || 'from-purple-500 to-blue-500'}`}></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20"></div>
        
        {/* Icon - Centered (only if icon exists) */}
        {getIcon() && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/50 shadow-xl">
              {getIcon()}
            </div>
          </div>
        )}

        {/* Live Indicator */}
        {liveShowCount > 0 && (
          <Badge className="absolute top-3 right-3 bg-red-500 text-white border-0 animate-pulse z-10 text-xs px-2 py-0.5">
            <Radio className="w-3 h-3 mr-1" />
            {liveShowCount} LIVE
          </Badge>
        )}

      </div>

      {/* COMPRESSED TEXT SECTION - 50% smaller */}
      <CardContent className="p-2.5 bg-white">
        <div onClick={onClick}>
          {/* Community Name - LARGER and more prominent */}
          <h3 className="font-bold text-lg leading-tight text-gray-900 mb-1 group-hover:text-purple-600 transition-colors">
            {community.label || community.name}
          </h3>

          {/* Community Bio - Truncated */}
          {community.bio && (
            <p className="text-gray-600 text-[11px] leading-snug mb-2 line-clamp-2">
              {community.bio}
            </p>
          )}

          {/* Action Row - Horizontal Layout */}
          <div className="flex items-center justify-between gap-2">
            {/* Follower Count */}
            <Badge variant="outline" className="flex items-center gap-1 px-2 py-0.5 h-6 text-[11px] border-gray-300">
              <Users className="w-3 h-3" />
              {followerCount}
            </Badge>

            {/* Follow Button */}
            <Button
              onClick={handleFollowClick}
              disabled={followMutation.isPending || unfollowMutation.isPending}
              size="icon"
              className={`h-7 w-7 rounded-full ${
                isFollowing
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              {followMutation.isPending || unfollowMutation.isPending ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : isFollowing ? (
                <UserCheck className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
            </Button>

            {/* Share Button */}
            <div onClick={(e) => e.stopPropagation()}>
              <ShareButton
                type="community"
                id={community.name}
                title={community.label || community.name}
                description={`Join the ${community.label || community.name} community on myneighbor.live`}
                imageUrl={community.bg_image_url}
                variant="ghost"
                size="icon"
                showLabel={false}
                className="h-7 w-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700"
              />
            </div>
          </div>

          {/* Featured Badge - Hidden but logic preserved */}
          {false && community.is_active && (
            <Badge className="bg-gradient-to-r from-purple-600 to-blue-500 text-white border-0 text-[10px] px-2 py-0 h-5 leading-tight">
              <Sparkles className="w-2.5 h-2.5 mr-1" />
              Featured
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}