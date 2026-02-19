import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { SHOWS_PUBLIC_FIELDS } from "@/api/shows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import LiveShowCard from "../components/marketplace/LiveShowCard";
import SellerCard from "../components/marketplace/SellerCard";
import CommunityCarousel from "../components/marketplace/CommunityCarousel";
import CommunityView from "../components/community/CommunityView";
import UnifiedSearchBar from "../components/search/UnifiedSearchBar";
import { getLiveShowsWithStats, getScheduledShows } from "@/api/shows";

// ═══════════════════════════════════════════════════════════════════════════
// SELLER CARD FIELD MAPPING
// Maps seller_cards view fields to legacy component-expected field names
// ═══════════════════════════════════════════════════════════════════════════
const SELLER_CARD_LIGHT_FIELDS = `
  seller_id,
  user_id,
  display_name,
  avatar_url,
  buyer_avatar_url,
  banner_url,
  short_bio,
  city,
  state,
  follower_count,
  rating_average,
  rating_count,
  total_items_sold,
  is_accepting_orders,
  live_show_id
`.replace(/\s+/g, '');

/**
 * Transform seller_cards row to legacy seller shape expected by components
 */
function mapSellerCardToLegacy(card) {
  if (!card) return null;
  
  // Compute effective avatar: seller override > buyer fallback > null
  const effective_profile_image_url = card.avatar_url || card.buyer_avatar_url || null;
  
  // DEV debug log (guarded)
  if (process.env.NODE_ENV === 'development') {
    console.log('[SellerAvatarInheritance]', {
      seller_id: card.seller_id,
      seller_avatar: card.avatar_url || '(none)',
      buyer_avatar: card.buyer_avatar_url || '(none)',
      effective: effective_profile_image_url || '(fallback to UI)'
    });
  }
  
  return {
    // Core identity
    id: card.seller_id,
    user_id: card.user_id,
    // Display fields (mapped from seller_cards naming)
    business_name: card.display_name,
    profile_image_url: effective_profile_image_url,
    background_image_url: card.banner_url,
    bio: card.short_bio,
    pickup_city: card.city,
    pickup_state: card.state,
    // Stats (pre-computed in view)
    follower_count: card.follower_count || 0,
    rating_average: card.rating_average || 0,
    rating_count: card.rating_count || 0,
    total_sales: card.total_items_sold || 0,
    // Status
    stripe_connected: card.is_accepting_orders || false,
    live_show_id: card.live_show_id,
    // Legacy placeholders (not exposed in public view)
    show_contact_email: false,
    show_contact_phone: false,
    show_pickup_address: true,
    contact_email: null,
    contact_phone: null,
  };
}

// Community quotes + fallback (same as CommunityPage - for inline CommunityView)
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
  tools: "Where every wrench has a story and every deal sparks something new.",
  health: "For the ones who wag, chirp, and steal our hearts — and our couch space.",
  home_garden: "Grow connections, plant smiles, and pick up your next project down the street.",
  collectibles: "Hunt live, score local, brag instantly.",
  charity: "Give back, shop local, change lives — one purchase at a time.",
  electronics: "Tech that works, deals that click, pickup that's instant.",
  apparel: "Style meets street — try it virtually, grab it locally, wear it proudly.",
  pawn_shops: "Treasure hunting made easy — deals on everything, pickup around the corner.",
};

const getCommunityQuote = (name) => communityQuotes[name?.toLowerCase()] || communityQuotes.all;

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
  tools: { name: "tools", label: "Tools", icon_name: "Wrench", color_gradient: "from-gray-500 to-slate-500" },
  health: { name: "health", label: "Health & Wellness", icon_name: "Heart", color_gradient: "from-rose-500 to-pink-500" },
  home_garden: { name: "home_garden", label: "Home & Garden", icon_name: "Home", color_gradient: "from-green-500 to-emerald-500" },
  collectibles: { name: "collectibles", label: "Collectibles", icon_name: "Gem", color_gradient: "from-purple-500 to-indigo-500" },
  charity: { name: "charity", label: "Charity", icon_name: "Heart", color_gradient: "from-red-500 to-rose-500" },
  electronics: { name: "electronics", label: "Electronics", icon_name: "Package", color_gradient: "from-blue-500 to-indigo-500" },
  apparel: { name: "apparel", label: "Apparel", icon_name: "ShoppingCart", color_gradient: "from-fuchsia-500 to-purple-500" },
  pawn_shops: { name: "pawn_shops", label: "Pawn Shops", icon_name: "Store", color_gradient: "from-yellow-500 to-orange-500" },
};

export default function Marketplace() {
  const navigate = useNavigate();
  const [selectedCommunity, setSelectedCommunity] = useState("all");
  const [user, setUser] = useState(null);
  const [canonicalUserRole, setCanonicalUserRole] = useState(null);

  // Data state (replacing React Query)
  const [liveShows, setLiveShows] = useState([]);
  const [upcomingShows, setUpcomingShows] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [allSellers, setAllSellers] = useState([]);
  const [followedSellers, setFollowedSellers] = useState([]);
  const [communities, setCommunities] = useState([]);

  // Listen for bottom nav Marketplace click → reset to default view
  useEffect(() => {
    const resetHandler = () => {
      setSelectedCommunity("all");
    };
    window.addEventListener("resetMarketplace", resetHandler);
    return () => window.removeEventListener("resetMarketplace", resetHandler);
  }, []);

  // Load user and communities on component mount
  useEffect(() => {
    loadUser();
    loadCommunities();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E: Load communities from Supabase (replaces hardcoded array)
  // ═══════════════════════════════════════════════════════════════════════════
  const loadCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from("communities")
        .select("id, name, label, icon_name, bg_image_url, color_gradient")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("[Marketplace] Failed to load communities:", error);
        setCommunities([]);
        return;
      }

      // Transform to expected shape with "All" as first option
      const allOption = {
        id: "all",
        name: "all",
        label: "All",
        icon: "Package",
        bgImage: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=300&fit=crop",
        color: "from-purple-500 to-blue-500"
      };

      const dbCommunities = (data || []).map(c => ({
        id: c.id,
        name: c.name,
        label: c.label,
        icon: c.icon_name || "Package",
        bgImage: c.bg_image_url || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=300&fit=crop",
        color: c.color_gradient || "from-purple-500 to-blue-500"
      }));

      setCommunities([allOption, ...dbCommunities]);
    } catch (error) {
      console.error("[Marketplace] Error loading communities:", error);
      setCommunities([]);
    }
  };

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("[Marketplace] auth load failed", error);
        setUser(null);
        setCanonicalUserRole(null);
        return;
      }
      const authUser = data?.user ?? null;
      setUser(authUser);
      
      // Fetch canonical role from public.users
      if (authUser?.id) {
        const { data: canonicalUser } = await supabase
          .from("users")
          .select("role")
          .eq("id", authUser.id)
          .maybeSingle();
        setCanonicalUserRole(canonicalUser?.role || null);
      } else {
        setCanonicalUserRole(null);
      }
    } catch (error) {
      setUser(null);
      setCanonicalUserRole(null);
    }
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL SELLER CHECK: Hide "Become a Seller" CTA for existing sellers
  // ═══════════════════════════════════════════════════════════════════════════
  const isAlreadySeller = canonicalUserRole === "seller" || canonicalUserRole === "admin";

  // Load shows using Supabase API
  const loadShows = async () => {
    try {
      const [live, scheduled] = await Promise.all([
        getLiveShowsWithStats(),
        getScheduledShows(),
      ]);
      
      // Sort live shows by viewer_count descending (matching legacy behavior)
      const sortedLive = [...live].sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0));
      // Sort scheduled shows by scheduled_start descending (matching legacy behavior)
      const sortedScheduled = [...scheduled].sort((a, b) => 
        new Date(b.scheduled_start || 0).getTime() - new Date(a.scheduled_start || 0).getTime()
      );
      
      setLiveShows(sortedLive);
      setUpcomingShows(sortedScheduled);
    } catch (error) {
      setLiveShows([]);
      setUpcomingShows([]);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL QUERY: Load sellers from seller_cards view
  // ═══════════════════════════════════════════════════════════════════════════
  const loadSellers = async () => {
    try {
      console.log("[Marketplace] Fetching seller_cards...");
      const { data, error } = await supabase
        .from('seller_cards')
        .select(SELLER_CARD_LIGHT_FIELDS)
        .order('follower_count', { ascending: false })
        .limit(50);
      
      console.log('[Marketplace seller_cards]', {
        dataLength: data?.length,
        firstRow: data?.[0],
        error,
      });
      
      if (error) {
        console.error("[Marketplace] seller_cards query error:", error.message);
        setSellers([]);
        setAllSellers([]);
        return;
      }
      
      console.log(`[Marketplace] Found ${data?.length || 0} sellers`);
      
      // Transform to legacy shape and sort: live sellers first
      const mapped = (data || []).map(mapSellerCardToLegacy);
      const sorted = mapped.sort((a, b) => {
        if (a.live_show_id && !b.live_show_id) return -1;
        if (!a.live_show_id && b.live_show_id) return 1;
        return (b.follower_count || 0) - (a.follower_count || 0);
      });
      
      setSellers(sorted);
      setAllSellers(sorted); // Both are the same for seller_cards (already filtered)
    } catch (error) {
      console.error("[Marketplace] loadSellers error:", error);
      setSellers([]);
      setAllSellers([]);
    }
  };

  // Load followed sellers for logged-in user
  // NOTE: This still uses direct Supabase query (not migrating follow mutations in this step)
  const loadFollowedSellers = async () => {
    if (!user?.id) {
      setFollowedSellers([]);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('followed_sellers')
        .select('seller_id')
        .eq('buyer_id', user.id);
      
      if (error) {
        console.error("[Marketplace] followed_sellers query error:", error.message);
        setFollowedSellers([]);
        return;
      }
      
      setFollowedSellers((data || []).map(f => f.seller_id));
    } catch (error) {
      console.error("[Marketplace] loadFollowedSellers error:", error);
      setFollowedSellers([]);
    }
  };

  // Initial load and polling for shows
  useEffect(() => {
    loadShows();
    loadSellers();

    // Poll for live shows every 10 seconds
    const interval = setInterval(() => {
      loadShows();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Load followed sellers when user changes
  useEffect(() => {
    loadFollowedSellers();
  }, [user?.id]);

  const sellersMap = allSellers.reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  // ═══════════════════════════════════════════════════════════════════════════
  // Inline CommunityView queries (same as CommunityPage - enabled when non-"all")
  // ═══════════════════════════════════════════════════════════════════════════
  const isCommunityView = selectedCommunity && selectedCommunity !== "all";

  const {
    data: dbCommunity,
    isLoading: communityLoading
  } = useQuery({
    queryKey: ['community-by-slug', selectedCommunity],
    queryFn: async () => {
      if (!selectedCommunity) return null;
      const { data, error } = await supabase
        .from("communities")
        .select("id,name,label,bio,icon_name,bg_image_url,color_gradient,zip_code")
        .ilike("name", selectedCommunity)
        .eq("is_active", true)
        .maybeSingle();
      if (error) return null;
      return data || null;
    },
    enabled: isCommunityView
  });

  const matchesCommunity = (show, communityId, communityNameStr) => {
    if (show.community_id && communityId) return show.community_id === communityId;
    if (!show.community_id && communityNameStr) return show.community?.toLowerCase() === communityNameStr?.toLowerCase();
    return false;
  };

  const { data: communityLiveShows = [], isLoading: communityLiveShowsLoading } = useQuery({
    queryKey: ['community-live-shows', selectedCommunity, dbCommunity?.id],
    queryFn: async () => {
      if (!selectedCommunity) return [];
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_PUBLIC_FIELDS)
        .eq("status", "live")
        .order("viewer_count", { ascending: false });
      if (error) return [];
      return (data || []).filter(show => matchesCommunity(show, dbCommunity?.id, selectedCommunity));
    },
    enabled: isCommunityView,
    refetchInterval: 5000
  });

  const { data: communityUpcomingShows = [], isLoading: communityUpcomingShowsLoading } = useQuery({
    queryKey: ['community-upcoming-shows', selectedCommunity, dbCommunity?.id],
    queryFn: async () => {
      if (!selectedCommunity) return [];
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_PUBLIC_FIELDS)
        .eq("status", "scheduled")
        .order("scheduled_start_time", { ascending: true });
      if (error) return [];
      return (data || []).filter(show => matchesCommunity(show, dbCommunity?.id, selectedCommunity));
    },
    enabled: isCommunityView
  });

  const { data: communityAllSellers = [] } = useQuery({
    queryKey: ['all-sellers-map-community'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sellers")
        .select("id, user_id, business_name, profile_image_url, pickup_city, pickup_state, status");
      if (error) return [];
      return data ?? [];
    },
    enabled: isCommunityView
  });

  const communitySellersMap = communityAllSellers.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {});

  const community = dbCommunity || (selectedCommunity ? fallbackCommunities[selectedCommunity?.toLowerCase()] : null);
  const communityQuote = getCommunityQuote(selectedCommunity);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E: Communities now loaded from Supabase via loadCommunities()
  // The `communities` state is set in the useEffect above
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E.2 PART B: Simplified filtering since community bubbles now navigate
  // Marketplace always shows ALL shows. Specific community filtering is done on CommunityPage.
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Filter shows by status only (no community filter on Marketplace)
  // CRITICAL: status takes precedence over time-based classification
  const filteredLiveShows = liveShows.filter(show => {
    // Only include shows that are explicitly live (regardless of scheduled_start_time)
    return show.status === 'live';
  });

  const filteredUpcomingShows = upcomingShows.filter(show => {
    // NEVER treat a live show as upcoming, even if scheduled_start_time is in the future
    return show.status !== 'live';
  });

  // Filter shows from followed sellers (inherits status-based filtering from parent arrays)
  const liveShowsFromFollowedSellers = filteredLiveShows.filter(show => 
    followedSellers.includes(show.seller_id)
  );

  const upcomingShowsFromFollowedSellers = filteredUpcomingShows.filter(show => 
    followedSellers.includes(show.seller_id)
  );


  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1fb3e3] via-blue-100 to-slate-50">
      {/* UPDATED: Neutral Header Section - Removed gradient background */}
      <div className="bg-transparent pt-3 pb-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Search Bar + Near Me Button */}
          <div className="max-w-2xl mx-auto mb-2">
            <div className="flex gap-2">
              {/* NEW: Unified Search Bar */}
              <div className="flex-[3]">
                <UnifiedSearchBar 
                  placeholder="Search shows, sellers, products, communities..." 
                />
              </div>
              
              <Button
                onClick={() => navigate(createPageUrl("NearMe"))}
                className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-400 hover:from-orange-600 hover:to-yellow-500 text-white font-semibold shadow-lg rounded-xl border-0 px-3 sm:px-4 py-2 transition-all hover:scale-105"
              >
                <MapPin className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="text-sm sm:text-base whitespace-nowrap">Near Me</span>
              </Button>
            </div>
          </div>

          {/* Community Categories Carousel */}
          <CommunityCarousel 
            selectedCommunity={selectedCommunity}
            onSelectCommunity={setSelectedCommunity}
          />
        </div>
      </div>

      {/* Main Content - Marketplace sections or inline CommunityView */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-1 pb-4 space-y-1">
        {selectedCommunity === "all" ? (
          <>
        {/* CLEANED UP: Live from Followed Sellers - Single line, no badge, tighter spacing */}
        {user && liveShowsFromFollowedSellers.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 bg-purple-600 rounded-full animate-pulse"></div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Live From Sellers You Follow</h2>
            </div>
            
            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4">
              <div className="flex px-4" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(liveShowsFromFollowedSellers.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockShows = liveShowsFromFollowedSellers.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4 w-screen sm:w-full"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockShows.map((show) => (
                          <LiveShowCard
                            key={show.id}
                            show={show}
                            seller={sellersMap[show.seller_id]}
                            onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Live Shows */}
        {filteredLiveShows.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Live Now</h2>
              <Badge className="bg-red-500 text-white border-0">
                {filteredLiveShows.length}
              </Badge>
            </div>
            
            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4">
              <div className="flex px-4" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(filteredLiveShows.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockShows = filteredLiveShows.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4 w-screen sm:w-full"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockShows.map((show) => (
                          <LiveShowCard
                            key={show.id}
                            show={show}
                            seller={sellersMap[show.seller_id]}
                            onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Upcoming Shows */}
        {filteredUpcomingShows.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Coming Up</h2>
              <Badge className="bg-blue-500 text-white border-0">
                {filteredUpcomingShows.length}
              </Badge>
            </div>
            
            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4">
              <div className="flex px-4" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(filteredUpcomingShows.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockShows = filteredUpcomingShows.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4 w-screen sm:w-full"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockShows.map((show) => (
                          <LiveShowCard
                            key={show.id}
                            show={show}
                            seller={sellersMap[show.seller_id]}
                            onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                            isUpcoming
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Featured Sellers */}
        {sellers.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Featured Sellers</h2>
            </div>
            
            <div className="overflow-x-scroll overflow-y-visible snap-x snap-mandatory scrollbar-hide -mx-4">
              <div className="flex px-4" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(sellers.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockSellers = sellers.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4 w-screen sm:w-full"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockSellers.map((seller) => (
                          <SellerCard
                            key={seller.id}
                            seller={seller}
                            initialFollowStatus={followedSellers.includes(seller.id)}
                            onClick={() => navigate(createPageUrl("SellerStorefront") + `?sellerId=${seller.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Empty State - STEP C6-E.2: Simplified for all-shows view */}
        {filteredLiveShows.length === 0 && filteredUpcomingShows.length === 0 && (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-12 sm:p-16 text-center">
              <Package className="w-16 h-16 sm:w-20 sm:h-20 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
                No shows available
              </h3>
              <p className="text-gray-600 mb-6">
                Check back soon or explore communities
              </p>
              <Button
                variant="outline"
                onClick={() => navigate(createPageUrl("Communities"))}
              >
                Browse Communities
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Call to Action - Hidden for sellers and admins */}
        {selectedCommunity === "all" && !isAlreadySeller && (
          <section className="mt-8">
            <Card className="border-0 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 overflow-hidden">
              <CardContent className="p-8 sm:p-12 relative">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
                <div className="relative text-center">
                  <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4">
                    Want to sell on LiveMarket?
                  </h2>
                  <p className="text-lg sm:text-xl text-white/90 mb-6">
                    Connect your Stripe account and start livestreaming today
                  </p>
                  <Button
                    size="lg"
                    className="bg-white text-purple-600 hover:bg-gray-100 font-bold"
                    onClick={() => navigate(createPageUrl("SellerSafetyAgreement"))}
                  >
                    Get Started as a Seller
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        )}
          </>
        ) : isCommunityView && communityLoading ? null : (
          <CommunityView
            communityName={selectedCommunity}
            community={community}
            dbCommunity={dbCommunity}
            communityLoading={communityLoading}
            liveShows={communityLiveShows}
            upcomingShows={communityUpcomingShows}
            liveShowsLoading={communityLiveShowsLoading}
            upcomingShowsLoading={communityUpcomingShowsLoading}
            sellersMap={communitySellersMap}
            navigate={navigate}
            createPageUrl={createPageUrl}
            communityQuote={communityQuote}
            hideBackButton={true}
            compactHeader={true}
            showMarketplaceBackButton={true}
          />
        )}
      </div>

      {/* Hide Scrollbar CSS */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}