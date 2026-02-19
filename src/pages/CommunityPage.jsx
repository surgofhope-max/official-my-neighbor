import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { SHOWS_PUBLIC_FIELDS } from "@/api/shows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, ArrowLeft, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import CommunityView from "../components/community/CommunityView";
import GiviTracker from "../components/sharing/GiviTracker";

// Community quotes library - EXPANDED
const communityQuotes = {
  all: "Where every find has a story and every shop feels like home.",
  stores: "Where every wrench has a story and every deal sparks something new.",
  yard_sales: "One neighbor's clutter is another neighbor's treasure. Shop it live, grab it local, laugh about it later.",
  swap_meets: "Hunt live, score local, brag instantly.",
  vintage: "Local legends never go out of style — shop live, find stories that last.",
  az_offroad: "Built for dirt, dust, and deals that roll right into your driveway.",
  farmers_market: "Grow connections, plant smiles, and pick up your next project down the street.",
  plant_animal: "For the ones who wag, chirp, and steal our hearts — and our couch space.",
  infomercial: "Live demos, real results, pickup today — because waiting for shipping is so last decade.",
  open_house: "Walk through virtually, decide locally, move in with confidence.",
  fitness: "Push limits, find your crew, and pick up gear that keeps you going strong.",
  
  // NEW: Additional Communities
  tools: "Where every wrench has a story and every deal sparks something new.",
  health: "For the ones who wag, chirp, and steal our hearts — and our couch space.",
  home_garden: "Grow connections, plant smiles, and pick up your next project down the street.",
  collectibles: "Hunt live, score local, brag instantly.",
  charity: "Give back, shop local, change lives — one purchase at a time.",
  electronics: "Tech that works, deals that click, pickup that's instant.",
  apparel: "Style meets street — try it virtually, grab it locally, wear it proudly.",
  pawn_shops: "Treasure hunting made easy — deals on everything, pickup around the corner.",
};

const getCommunityQuote = (communityName) => {
  return communityQuotes[communityName?.toLowerCase()] || communityQuotes.all;
};

// Fallback community data if not found in database - EXPANDED
const fallbackCommunities = {
  all: { name: "all", label: "All", icon_name: "Package", color_gradient: "from-purple-500 to-blue-500" },
  stores: { name: "stores", label: "Stores", icon_name: "Store", color_gradient: "from-blue-500 to-cyan-500" },
  yard_sales: { name: "yard_sales", label: "Yard Sales", icon_name: "Home", color_gradient: "from-green-500 to-emerald-500" },
  swap_meets: { name: "swap_meets", label: "Swap Meets", icon_name: "ShoppingCart", color_gradient: "from-orange-500 to-red-500" },
  vintage: { name: "vintage", label: "Vintage", icon_name: "Sparkles", color_gradient: "from-amber-500 to-yellow-500" },
  az_offroad: { name: "az_offroad", label: "AZ Off-Road", icon_name: "Truck", color_gradient: "from-red-500 to-orange-500" },
  farmers_market: { name: "farmers_market", label: "Farmer's Market", icon_name: "Leaf", color_gradient: "from-lime-500 to-green-500" },
  plant_animal: { name: "plant_animal", label: "Plant & Animal", icon_name: "Leaf", color_gradient: "from-teal-500 to-cyan-500" },
  infomercial: { name: "infomercial", label: "Infomercial", icon_name: "Video", color_gradient: "from-indigo-500 to-purple-500" },
  open_house: { name: "open_house", label: "Open House", icon_name: "Key", color_gradient: "from-pink-500 to-rose-500" },
  fitness: { name: "fitness", label: "Fitness", icon_name: "Heart", color_gradient: "from-red-500 to-pink-500" },
  
  // NEW: Additional Communities
  tools: { name: "tools", label: "Tools", icon_name: "Wrench", color_gradient: "from-gray-500 to-slate-500" },
  health: { name: "health", label: "Health & Wellness", icon_name: "Heart", color_gradient: "from-rose-500 to-pink-500" },
  home_garden: { name: "home_garden", label: "Home & Garden", icon_name: "Home", color_gradient: "from-green-500 to-emerald-500" },
  collectibles: { name: "collectibles", label: "Collectibles", icon_name: "Gem", color_gradient: "from-purple-500 to-indigo-500" },
  charity: { name: "charity", label: "Charity", icon_name: "Heart", color_gradient: "from-red-500 to-rose-500" },
  electronics: { name: "electronics", label: "Electronics", icon_name: "Package", color_gradient: "from-blue-500 to-indigo-500" },
  apparel: { name: "apparel", label: "Apparel", icon_name: "ShoppingCart", color_gradient: "from-fuchsia-500 to-purple-500" },
  pawn_shops: { name: "pawn_shops", label: "Pawn Shops", icon_name: "Store", color_gradient: "from-yellow-500 to-orange-500" },
};

export default function CommunityPage() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const communityName = urlParams.get('community');

  console.log("🔍 CommunityPage - Loading community:", communityName);

  // Handle back navigation
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(createPageUrl("Communities"));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E.1 PART A: Fetch community from Supabase by slug (communities.name)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: dbCommunity, isLoading: communityLoading, error: communityError } = useQuery({
    queryKey: ['community-by-slug', communityName],
    queryFn: async () => {
      if (!communityName) return null;
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📡 [CommunityPage] Querying Supabase for slug:", communityName);
      
      // Query Supabase directly by slug (communities.name), case-insensitive via ilike
      const { data, error } = await supabase
        .from("communities")
        .select("id,name,label,bio,icon_name,bg_image_url,color_gradient,zip_code")
        .ilike("name", communityName)
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) {
        console.error("❌ [CommunityPage] Supabase query error:", error.message);
        return null;
      }
      
      if (data) {
        console.log("✅ [CommunityPage] MATCH FOUND in Supabase:");
        console.log("   ID:", data.id);
        console.log("   Name:", data.name);
        console.log("   Label:", data.label);
      } else {
        console.log("❌ [CommunityPage] No community found for slug:", communityName);
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      return data || null;
    },
    enabled: !!communityName
  });

  // Use database community or fallback to hardcoded data ONLY if DB returns null
  const community = dbCommunity || (communityName ? fallbackCommunities[communityName?.toLowerCase()] : null);

  // Log source of truth
  if (dbCommunity) {
    console.log("🎯 [CommunityPage] Using DB community | ID:", dbCommunity.id);
  } else if (community) {
    console.warn("[CommunityPage] community not found in DB, using fallback");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C5: Community matching helper
  // Prefer community_id (canonical), fallback to legacy string matching
  // ═══════════════════════════════════════════════════════════════════════════
  const matchesCommunity = (show, communityId, communityNameStr) => {
    // Canonical: show.community_id === community.id
    if (show.community_id && communityId) {
      return show.community_id === communityId;
    }
    // Legacy fallback: show.community_id is null, match by string name
    if (!show.community_id && communityNameStr) {
      return show.community?.toLowerCase() === communityNameStr.toLowerCase();
    }
    return false;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E.1 PART A: Fetch shows from Supabase with community_id + legacy fallback
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: liveShows = [], isLoading: liveShowsLoading } = useQuery({
    queryKey: ['community-live-shows', communityName, dbCommunity?.id],
    queryFn: async () => {
      if (!communityName) return [];
      console.log("📡 [CommunityPage] Fetching live shows | community:", communityName, "| ID:", dbCommunity?.id);
      
      // Fetch all live shows from Supabase
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_PUBLIC_FIELDS)
        .eq("status", "live")
        .order("viewer_count", { ascending: false });
      
      if (error) {
        console.error("❌ [CommunityPage] Live shows query error:", error.message);
        return [];
      }
      
      // Filter by community_id (canonical) with legacy fallback
      const filtered = (data || []).filter(show => 
        matchesCommunity(show, dbCommunity?.id, communityName)
      );
      
      console.log("✅ [CommunityPage] Live shows found:", filtered.length);
      return filtered;
    },
    enabled: !!communityName,
    refetchInterval: 5000
  });

  const { data: upcomingShows = [], isLoading: upcomingShowsLoading } = useQuery({
    queryKey: ['community-upcoming-shows', communityName, dbCommunity?.id],
    queryFn: async () => {
      if (!communityName) return [];
      console.log("📡 [CommunityPage] Fetching upcoming shows | community:", communityName, "| ID:", dbCommunity?.id);
      
      // Fetch all scheduled shows from Supabase
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_PUBLIC_FIELDS)
        .eq("status", "scheduled")
        .order("scheduled_start_time", { ascending: true });
      
      if (error) {
        console.error("❌ [CommunityPage] Upcoming shows query error:", error.message);
        return [];
      }
      
      // Filter by community_id (canonical) with legacy fallback
      const filtered = (data || []).filter(show =>
        matchesCommunity(show, dbCommunity?.id, communityName)
      );
      
      console.log("✅ [CommunityPage] Upcoming shows found:", filtered.length);
      return filtered;
    },
    enabled: !!communityName
  });

  // Fetch sellers for shows (from Supabase)
  const { data: allSellers = [] } = useQuery({
    queryKey: ['all-sellers-map-community'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sellers")
        .select("id, user_id, business_name, profile_image_url, pickup_city, pickup_state, status");
      if (error) {
        console.error("[CommunityPage] Sellers query error:", error.message);
        return [];
      }
      return data ?? [];
    }
  });

  const sellersMap = allSellers.reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  if (!communityName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Community Selected</h3>
            <p className="text-gray-600 mb-4">Please select a community to view its shows.</p>
            <Button onClick={() => navigate(createPageUrl("Communities"))}>
              Browse Communities
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (communityLoading || liveShowsLoading || upcomingShowsLoading) {
    return null;
  }

  if (!community) {
    console.error("❌ Community not found:", communityName);
    console.error("❌ Available in fallback:", Object.keys(fallbackCommunities));
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Community Not Found</h3>
            <p className="text-gray-600 mb-4">
              The community "<strong>{communityName}</strong>" could not be found.
            </p>
            <div className="bg-gray-100 rounded-lg p-4 mb-4 text-left">
              <p className="text-xs text-gray-600 mb-2">Debug Information:</p>
              <code className="text-xs text-gray-800 block">
                Community name: {communityName}<br/>
                In database: {dbCommunity ? 'Yes' : 'No'}<br/>
                Has fallback: {fallbackCommunities[communityName?.toLowerCase()] ? 'Yes' : 'No'}<br/>
                Available: {Object.keys(fallbackCommunities).join(', ')}
              </code>
            </div>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={handleBack}
              >
                Go Back
              </Button>
              <Button onClick={() => navigate(createPageUrl("Communities"))}>
                Browse Communities
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const communityQuote = getCommunityQuote(communityName);

  return (
    <>
      {/* GIVI Referral Tracker */}
      <GiviTracker type="community" id={communityName} />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
        <CommunityView
          communityName={communityName}
          community={community}
          dbCommunity={dbCommunity}
          liveShows={liveShows}
          upcomingShows={upcomingShows}
          liveShowsLoading={liveShowsLoading}
          upcomingShowsLoading={upcomingShowsLoading}
          sellersMap={sellersMap}
          navigate={navigate}
          createPageUrl={createPageUrl}
          communityQuote={communityQuote}
          backButton={
            <div className="mb-1">
              <Button
                variant="ghost"
                onClick={handleBack}
                className="text-gray-600 hover:bg-gray-100 rounded-full h-7 w-7 p-0 flex items-center justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          }
        />
      </div>
    </>
  );
}