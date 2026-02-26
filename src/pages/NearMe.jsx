import React, { useState, useEffect, useMemo } from "react";
import { devLog, devWarn } from "@/utils/devLog";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for non-Seller entities
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Radio, Calendar, TrendingUp, Navigation, AlertCircle, ArrowLeft, Users, SlidersHorizontal, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import LiveShowCard from "../components/marketplace/LiveShowCard";
import SellerCard from "../components/marketplace/SellerCard";
import CommunityCard from "../components/marketplace/CommunityCard";
import { getLiveShowsWithStats, getScheduledShows } from "@/api/shows";
import { getFollowingByUserId } from "@/api/following";

// ═══════════════════════════════════════════════════════════════════════════
// EARLY MARKET MODE: When enabled, shows ALL sellers regardless of ZIP filtering.
// Set VITE_EARLY_MARKET_MODE=true in .env to enable.
// This is a temporary override for markets with sparse ZIP coverage.
// ═══════════════════════════════════════════════════════════════════════════
const EARLY_MARKET_MODE = import.meta.env.VITE_EARLY_MARKET_MODE === "true";

// EARLY MARKET AUDIT LOG (TEMPORARY - remove after verification)
devLog(
  "[EARLY_MARKET_AUDIT]",
  "VITE_EARLY_MARKET_MODE =",
  import.meta.env.VITE_EARLY_MARKET_MODE,
  "EARLY_MARKET_MODE =",
  EARLY_MARKET_MODE
);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-2: ZIP Adjacency Contract (static seed data)
// Maps user's ZIP → allowed ZIPs per locality tier
// TODO: Replace with dynamic adjacency lookup or API in Phase-3
// ═══════════════════════════════════════════════════════════════════════════
const ZIP_ADJACENCY = {
  "85302": {
    right_here: ["85302"],
    nearby: ["85302", "85301", "85303", "85304"],
    around_town: ["85302", "85301", "85303", "85304", "85201", "85202"],
    metro: ["85302", "85301", "85303", "85304", "85201", "85202", "85021"]
  }
};

const DEFAULT_TIER = "nearby";

// LIGHT CARD fields for seller_cards (Near Me display)
const SELLER_CARD_LIGHT_FIELDS = `
  seller_id,
  display_name,
  avatar_url,
  buyer_avatar_url,
  banner_url,
  short_bio,
  city,
  state,
  pickup_zip,
  follower_count,
  rating_average,
  rating_count,
  total_items_sold,
  is_accepting_orders,
  live_show_id
`.replace(/\s+/g, '');

/**
 * Maps seller_cards row to legacy Seller shape expected by SellerCard/LiveShowCard
 */
function mapSellerCardToLegacy(card) {
  if (!card) return null;
  
  // Compute effective avatar: seller override > buyer fallback > null
  const effective_profile_image_url = card.avatar_url || card.buyer_avatar_url || null;
  
  return {
    id: card.seller_id,
    business_name: card.display_name,
    profile_image_url: effective_profile_image_url,
    background_image_url: card.banner_url,
    bio: card.short_bio,
    pickup_city: card.city,
    pickup_state: card.state,
    pickup_zip: card.pickup_zip,
    follower_count: card.follower_count || 0,
    rating_average: card.rating_average || 0,
    rating_count: card.rating_count || 0,
    total_sales: card.total_items_sold || 0,
    stripe_connected: card.is_accepting_orders || false,
    live_show_id: card.live_show_id,
  };
}

export default function NearMe() {
  const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [user, setUser] = useState(null);
  
  // Phase-1: User ZIP resolution state
  const [userZip, setUserZip] = useState(null);
  const [zipError, setZipError] = useState(null);
  
  // GEO AUDIT: Trace userZip state changes
  useEffect(() => {
    devLog("[GEO AUDIT] userZip state updated:", userZip);
  }, [userZip]);
  
  // Phase-2: Persisted locality tier state
  const [selectedTier, setSelectedTier] = useState(() => {
    return localStorage.getItem("nearme:selectedTier") || DEFAULT_TIER;
  });
  
  // Persist tier selection to localStorage
  useEffect(() => {
    localStorage.setItem("nearme:selectedTier", selectedTier);
  }, [selectedTier]);
  
  // Filter States
  const [distanceRadius, setDistanceRadius] = useState(25); // kept for legacy, not used in Phase-1
  const [showLiveShows, setShowLiveShows] = useState(true);
  const [showSellers, setShowSellers] = useState(true);
  const [showCommunities, setShowCommunities] = useState(true);
  const [showOnlyFollowed, setShowOnlyFollowed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Temp states for modal
  const [tempDistance, setTempDistance] = useState(25);
  const [tempSelectedTier, setTempSelectedTier] = useState(DEFAULT_TIER);
  const [tempShowLiveShows, setTempShowLiveShows] = useState(true);
  const [tempShowSellers, setTempShowSellers] = useState(true);
  const [tempShowCommunities, setTempShowCommunities] = useState(true);
  const [tempShowOnlyFollowed, setTempShowOnlyFollowed] = useState(false);

  useEffect(() => {
    loadUser();
    requestLocation();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setUser(null);
        return;
      }
      setUser(data?.user ?? null);
    } catch (error) {
      setUser(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase-1: Resolve ZIP from GPS coordinates via reverse geocoding
  // ═══════════════════════════════════════════════════════════════════════════
  const resolveZipFromCoords = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        { headers: { 'User-Agent': 'LiveMarket/1.0' } }
      );
      const data = await res.json();
      devLog("[GEO AUDIT] reverse geocode raw response:", data);
      devLog("[GEO AUDIT] resolved ZIP:", data?.address?.postcode);
      return data?.address?.postcode || null;
    } catch {
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E.7: Aligned to use Supabase API (same as Marketplace)
  // Uses status === "live" for discovery (show lifecycle state)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: liveShows = [] } = useQuery({
    queryKey: ['nearme-live-shows'],
    queryFn: async () => {
      const shows = await getLiveShowsWithStats();
      // Sort by viewer_count descending (matching legacy behavior)
      return [...shows].sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0));
    },
    refetchInterval: 5000
  });

  const { data: upcomingShows = [] } = useQuery({
    queryKey: ['nearme-upcoming-shows'],
    queryFn: async () => {
      const shows = await getScheduledShows();
      // Sort by scheduled_start descending (matching legacy behavior)
      return [...shows].sort((a, b) => 
        new Date(b.scheduled_start_time || 0).getTime() - new Date(a.scheduled_start_time || 0).getTime()
      );
    },
  });

  // Single seller_cards query replaces both Seller.filter and Seller.list
  const { data: sellers = [] } = useQuery({
    queryKey: ['nearme-seller-cards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_cards')
        .select(SELLER_CARD_LIGHT_FIELDS)
        .order('follower_count', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error("[NearMe] seller_cards query error:", error.message);
        return [];
      }
      
      devLog("NearMe: seller_cards fetched count =", data?.length || 0);
      
      // Map to legacy shape for downstream components
      return (data || []).map(mapSellerCardToLegacy);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E.1: Fetch communities from Supabase (replaces Base44)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: communities = [] } = useQuery({
    queryKey: ['nearme-communities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("id, name, label, icon_name, bg_image_url, color_gradient, zip_code, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      
      if (error) {
        console.error("[NearMe] Communities query error:", error.message);
        return [];
      }
      return data ?? [];
    },
  });

  const { data: followedSellers = [] } = useQuery({
    queryKey: ['followed-sellers-nearme', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const follows = await getFollowingByUserId(user.id);

      return (follows || [])
        .map(f => f.seller_id)
        .filter(Boolean);
    },
    enabled: !!user?.id
  });

  const { data: followedCommunities = [] } = useQuery({
    queryKey: ['followed-communities-nearme', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("followed_communities")
        .select("community_id")
        .eq("user_id", user.id);

      if (error) {
        console.error("[NearMe] followed_communities query error:", error.message);
        return [];
      }
      return (data || [])
        .map((row) => row.community_id)
        .filter(Boolean);
    },
    enabled: !!user?.id
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE COMMUNITIES: Fetch shows with stream_status = 'live' to detect live communities
  // (Matches Communities.jsx pattern)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: liveStreamingShowsForCommunities = [] } = useQuery({
    queryKey: ['live-streaming-shows-for-nearme-communities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select("id, community_id, stream_status")
        .eq("stream_status", "live");
      if (error) {
        console.error("[NearMe] Live shows for communities query error:", error.message);
        return [];
      }
      return data ?? [];
    },
    refetchInterval: 5000
  });

  // Derive liveCommunityIds from liveStreamingShowsForCommunities
  const liveCommunityIds = useMemo(() => {
    return [...new Set(
      liveStreamingShowsForCommunities
        .map(show => show.community_id)
        .filter(Boolean)
    )];
  }, [liveStreamingShowsForCommunities]);

  // Build sellersMap from seller_cards (now mapped to legacy shape)
  const sellersMap = sellers.reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  useEffect(() => {
    if (filterOpen) {
      setTempDistance(distanceRadius);
      setTempSelectedTier(selectedTier);
      setTempShowLiveShows(showLiveShows);
      setTempShowSellers(showSellers);
      setTempShowCommunities(showCommunities);
      setTempShowOnlyFollowed(showOnlyFollowed);
    }
  }, [filterOpen]);

  const requestLocation = () => {
    setLoadingLocation(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // GEO AUDIT: Log raw geolocation data
        devLog("[GEO AUDIT] latitude:", latitude);
        devLog("[GEO AUDIT] longitude:", longitude);
        devLog("[GEO AUDIT] accuracy_m:", position.coords.accuracy);
        
        setUserLocation({ latitude, longitude });
        setLoadingLocation(false);
        
        // Phase-1: Resolve ZIP from GPS coordinates
        resolveZipFromCoords(latitude, longitude).then((zip) => {
          devLog("[GEO AUDIT] setting userZip to:", zip);
          if (zip) {
            setUserZip(zip);
            setZipError(null);
          } else {
            setZipError("Unable to resolve ZIP from location.");
          }
        });
      },
      (error) => {
        console.error("Location error:", error);
        setLocationError("Unable to get your location. Please enable location services.");
        setZipError("Location unavailable. Please enter your ZIP.");
        setLoadingLocation(false);
      }
    );
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // ZIP to coordinates mapping (simplified - in production use geocoding API)
  const zipToCoords = (zip) => {
    const phoenixZips = {
      '85001': { lat: 33.4484, lon: -112.0740 },
      '85003': { lat: 33.4484, lon: -112.0740 },
      '85004': { lat: 33.4484, lon: -112.0740 },
      '85006': { lat: 33.4484, lon: -112.0740 },
      '85007': { lat: 33.4484, lon: -112.0740 },
      '85008': { lat: 33.4484, lon: -112.0740 },
      '85009': { lat: 33.4484, lon: -112.0740 },
    };
    return phoenixZips[zip] || { lat: 33.4484, lon: -112.0740 };
  };

  const phoenixCoords = { lat: 33.4484, lon: -112.0740 };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-2: Derive allowed ZIPs from adjacency contract (SINGLE SOURCE OF TRUTH)
  // Falls back to exact ZIP match if user's ZIP not in adjacency map
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Check if adjacency data exists for user's ZIP + selected tier
  const hasAdjacency = useMemo(() => {
    if (!userZip) return false;
    return !!ZIP_ADJACENCY?.[userZip]?.[selectedTier];
  }, [userZip, selectedTier]);

  const allowedZips = useMemo(() => {
    if (!userZip) return [];
    return ZIP_ADJACENCY[userZip]?.[selectedTier] || [userZip];
  }, [userZip, selectedTier]);

  useEffect(() => {
    // TEMP DIAGNOSTICS — remove after we confirm root cause
    try {
      devLog("[NearMe DIAG] userZip:", userZip);
      devLog("[NearMe DIAG] selectedTier:", selectedTier);
      devLog("[NearMe DIAG] ZIP_ADJACENCY has userZip:", !!ZIP_ADJACENCY?.[userZip]);
      devLog("[NearMe DIAG] allowedZips:", allowedZips);
    } catch (e) {
      devLog("[NearMe DIAG] logging error:", e);
    }
  }, [userZip, selectedTier, allowedZips]);
  
  // Phase-2: ZIP-based locality matching (adjacency-aware)
  // When ZIP_ADJACENCY exists → ZIP group filtering
  // When ZIP_ADJACENCY missing → allowedZips === [userZip] → same ZIP only
  // EARLY_MARKET_MODE: Bypasses ZIP filtering to show all sellers
  const nearbySellers =
    EARLY_MARKET_MODE || selectedTier === "metro"
      ? sellers
      : sellers.filter((seller) => {
          if (!userZip) return false;
          if (!seller.pickup_zip) return false;
          return allowedZips.includes(seller.pickup_zip);
        });

  // Base nearby shows (distance filtered via seller location)
  const nearbyLiveShows = liveShows.filter(show => {
    const seller = sellersMap[show.seller_id];
    return seller && nearbySellers.some(s => s.id === seller.id);
  });

  const nearbyUpcomingShows = upcomingShows.filter(show => {
    const seller = sellersMap[show.seller_id];
    return seller && nearbySellers.some(s => s.id === seller.id);
  });

  // NEW: Filter communities by distance using ZIP code
  const nearbyCommunities = communities.filter(community => {
    if (!userLocation || !community.zip_code) return false;
    const coords = zipToCoords(community.zip_code);
    if (!coords) return false;
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      coords.lat,
      coords.lon
    );
    return distance <= distanceRadius;
  });

  useEffect(() => {
    // TEMP DIAGNOSTICS — remove after we confirm root cause
    try {
      devLog("[NearMe DIAG] counts:", {
        sellers_total: sellers?.length ?? null,
        nearbySellers: nearbySellers?.length ?? null,
        liveShows_total: liveShows?.length ?? null,
        nearbyLiveShows: nearbyLiveShows?.length ?? null,
        upcomingShows_total: upcomingShows?.length ?? null,
        nearbyUpcomingShows: nearbyUpcomingShows?.length ?? null,
        communities_total: communities?.length ?? null,
        nearbyCommunities: nearbyCommunities?.length ?? null,
        distanceRadius
      });
    } catch (e) {
      devLog("[NearMe DIAG] count logging error:", e);
    }
  }, [sellers, nearbySellers, liveShows, nearbyLiveShows, upcomingShows, nearbyUpcomingShows, communities, nearbyCommunities, distanceRadius]);

  // ═══════════════════════════════════════════════════════════════════════════
  // "I FOLLOW" FILTER — Display Layer Only (with failsafe)
  // Never blanks NearMe entirely; acts as a modifier, not a gate
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Normalize followed IDs to Sets for O(1) lookup
  const followedSellerIds = useMemo(() => new Set(followedSellers), [followedSellers]);
  const followedCommunityIds = useMemo(() => new Set(followedCommunities), [followedCommunities]);
  
  // displayedSellers: Filter by followed if enabled, else show all nearby
  const displayedSellers = useMemo(() => {
    if (!showOnlyFollowed) return nearbySellers;
    const filtered = nearbySellers.filter(s => followedSellerIds.has(s.id));
    // Fallback: if filter results in zero AND user has no followed sellers, show all
    return filtered.length > 0 || followedSellerIds.size > 0 ? filtered : nearbySellers;
  }, [showOnlyFollowed, nearbySellers, followedSellerIds]);
  
  // displayedLiveShows: Always show all zone-gated live shows (iFollow does NOT filter)
  const displayedLiveShows = useMemo(() => {
    return nearbyLiveShows;
  }, [nearbyLiveShows]);
  
  // displayedUpcomingShows: Always show all zone-gated upcoming shows (iFollow does NOT filter)
  const displayedUpcomingShows = useMemo(() => {
    return nearbyUpcomingShows;
  }, [nearbyUpcomingShows]);
  
  // displayedCommunities: Filter by followed communities if enabled
  const displayedCommunities = useMemo(() => {
    if (!showOnlyFollowed) return nearbyCommunities;
    const filtered = nearbyCommunities.filter(c => followedCommunityIds.has(c.id));
    // Fallback: never blank communities if user has no followed communities
    return filtered.length > 0 || followedCommunityIds.size > 0 ? filtered : nearbyCommunities;
  }, [showOnlyFollowed, nearbyCommunities, followedCommunityIds]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNITIES SECTION DATA (Discovery-first layout)
  // Zone gate: nearbyCommunities is the authoritative in-zone list
  // Render order: 1) Live Communities, 2) Followed (not live), 3) Others (not live)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1) inZoneCommunities: Zone-filtered communities (the "zone gate")
  const inZoneCommunities = nearbyCommunities;
  
  // 2) liveCommunityIdsSet: Set of community IDs with active live shows (for O(1) lookup)
  const liveCommunityIdsSet = useMemo(() => new Set(liveCommunityIds), [liveCommunityIds]);
  
  // 3) liveCommunitiesInZone: Communities with active live shows (DISCOVERY FIRST)
  const liveCommunitiesInZone = useMemo(() => {
    if (showOnlyFollowed) {
      return inZoneCommunities.filter(c => liveCommunityIdsSet.has(c.id) && followedCommunityIds.has(c.id));
    }
    return inZoneCommunities.filter(c => liveCommunityIdsSet.has(c.id));
  }, [inZoneCommunities, liveCommunityIdsSet, followedCommunityIds, showOnlyFollowed]);
  
  // 4) followedCommunitiesNotLive: Followed communities NOT live (in-zone)
  const followedCommunitiesNotLive = useMemo(() => 
    inZoneCommunities.filter(c => followedCommunityIds.has(c.id) && !liveCommunityIdsSet.has(c.id)),
    [inZoneCommunities, followedCommunityIds, liveCommunityIdsSet]
  );
  
  // 5) otherCommunitiesNotLive: Not followed, NOT live (in-zone)
  const otherCommunitiesNotLive = useMemo(() => {
    if (showOnlyFollowed) return [];
    return inZoneCommunities.filter(c => !followedCommunityIds.has(c.id) && !liveCommunityIdsSet.has(c.id));
  }, [inZoneCommunities, followedCommunityIds, liveCommunityIdsSet, showOnlyFollowed]);
  
  // DEBUG LOG (temporary - remove after verification)
  devLog("[NearMe][Communities] inZone=", inZoneCommunities.length, "live=", liveCommunitiesInZone.length, "followedNotLive=", followedCommunitiesNotLive.length, "otherNotLive=", otherCommunitiesNotLive.length);

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE SHOWS SECTION DATA (sectioned layout like Communities)
  // Zone gate: nearbyLiveShows is the zone-filtered source of truth
  // iFollow does NOT filter Live/Upcoming shows - they always show both followed + other
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Live shows from sellers user follows (in-zone) - derived from ZONE-GATED array
  const liveShowsFollowedInZone = useMemo(() => {
    return nearbyLiveShows.filter((show) => followedSellerIds.has(show.seller_id));
  }, [nearbyLiveShows, followedSellerIds]);
  
  // Live shows from other sellers (in-zone, not followed) - derived from ZONE-GATED array
  const liveShowsOtherInZone = useMemo(() => {
    return nearbyLiveShows.filter((show) => !followedSellerIds.has(show.seller_id));
  }, [nearbyLiveShows, followedSellerIds]);
  
  // Upcoming shows from sellers user follows (in-zone) - derived from ZONE-GATED array
  const upcomingShowsFollowedInZone = useMemo(() => {
    return nearbyUpcomingShows.filter((show) => followedSellerIds.has(show.seller_id));
  }, [nearbyUpcomingShows, followedSellerIds]);
  
  // Upcoming shows from other sellers (in-zone, not followed) - derived from ZONE-GATED array
  const upcomingShowsOtherInZone = useMemo(() => {
    return nearbyUpcomingShows.filter((show) => !followedSellerIds.has(show.seller_id));
  }, [nearbyUpcomingShows, followedSellerIds]);

  // DEBUG LOG (temporary - remove after verification)
  devLog(
    "[NearMe][LiveShows FIX]",
    "zoneLive=", nearbyLiveShows.length,
    "followedLive=", liveShowsFollowedInZone.length,
    "otherLive=", liveShowsOtherInZone.length,
    "zoneUpcoming=", nearbyUpcomingShows.length,
    "followedUpcoming=", upcomingShowsFollowedInZone.length,
    "otherUpcoming=", upcomingShowsOtherInZone.length
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SELLERS SECTION DATA (sectioned layout like Communities/Live Shows)
  // Zone gate: displayedSellers is already zone-filtered via nearbySellers
  // Render order: 1) Live Sellers, 2) Followed (not live), 3) Others (not live)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Live sellers (in-zone) - sellers currently streaming (DISCOVERY FIRST)
  const liveSellersInZone = useMemo(() => {
    if (showOnlyFollowed) {
      return displayedSellers.filter(s => !!s.live_show_id && followedSellerIds.has(s.id));
    }
    return displayedSellers.filter(s => !!s.live_show_id);
  }, [displayedSellers, followedSellerIds, showOnlyFollowed]);
  
  // Followed sellers NOT live (in-zone) - sellers user follows who are not streaming
  const followedSellersNotLive = useMemo(() => 
    displayedSellers.filter(s => followedSellerIds.has(s.id) && !s.live_show_id),
    [displayedSellers, followedSellerIds]
  );
  
  // Other sellers NOT live (in-zone) - not followed and not live
  const otherSellersNotLive = useMemo(() => {
    if (showOnlyFollowed) return [];
    return displayedSellers.filter(s => !followedSellerIds.has(s.id) && !s.live_show_id);
  }, [displayedSellers, followedSellerIds, showOnlyFollowed]);

  const handleApplyFilters = () => {
    setDistanceRadius(tempDistance);
    setSelectedTier(tempSelectedTier);
    setShowLiveShows(tempShowLiveShows);
    setShowSellers(tempShowSellers);
    setShowCommunities(tempShowCommunities);
    setShowOnlyFollowed(tempShowOnlyFollowed);
    setFilterOpen(false);
  };
  
  // Locality tier display labels
  const localityTierLabels = {
    right_here: "Right Here",
    nearby: "Nearby",
    around_town: "Around Town",
    metro: "Metro"
  };

  // Quick filter functions
  const handleQuickFilterLiveShows = () => {
    setShowLiveShows(true);
    setShowSellers(false);
    setShowCommunities(false);
  };

  const handleQuickFilterSellers = () => {
    setShowLiveShows(false);
    setShowSellers(true);
    setShowCommunities(false);
  };

  const handleQuickFilterCommunities = () => {
    setShowLiveShows(false);
    setShowSellers(false);
    setShowCommunities(true);
  };

  const isShowingOnlyLiveShows = showLiveShows && !showSellers && !showCommunities;
  const isShowingOnlySellers = !showLiveShows && showSellers && !showCommunities;
  const isShowingOnlyCommunities = !showLiveShows && !showSellers && showCommunities;

  // Determine what to show based on categories selected
  const shouldShowLiveShows = showLiveShows || (!showLiveShows && !showSellers && !showCommunities && showOnlyFollowed);
  const shouldShowSellers = showSellers || (!showLiveShows && !showSellers && !showCommunities && showOnlyFollowed);
  const shouldShowCommunities = showCommunities || (!showLiveShows && !showSellers && !showCommunities && showOnlyFollowed);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 py-3 sm:py-5">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="text-gray-600 hover:bg-gray-100 rounded-full flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
                onClick={() => navigate(createPageUrl("Marketplace"))}
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              
              <div 
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl flex-1 min-w-0"
                style={{
                  boxShadow: '0 2px 8px rgba(147, 51, 234, 0.12), 0 1px 4px rgba(59, 130, 246, 0.08)',
                  background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)',
                  border: '1px solid rgba(147, 51, 234, 0.1)',
                }}
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-sm sm:text-xl font-bold text-gray-900 leading-tight truncate">Near Me</h1>
                  <p className="text-[10px] sm:text-xs text-gray-600 leading-tight truncate">
                    {loadingLocation ? "Finding..." : 
                     locationError ? "Unavailable" :
                     userZip ? `${localityTierLabels[selectedTier]} • ZIP ${userZip}` : localityTierLabels[selectedTier]}
                  </p>
                </div>
              </div>
            </div>

            <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
              <DialogTrigger asChild>
                <Button
                  className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2.5 h-auto rounded-lg sm:rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 border-0 flex-shrink-0"
                  style={{
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                  }}
                >
                  <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-sm sm:text-base font-semibold">Filter</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Filter Near Me</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-6 mt-4">
                  {/* Locality Tier Selector */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold">Search Area</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: "right_here", label: "Right Here", desc: "Same ZIP" },
                        { value: "nearby", label: "Nearby", desc: "Adjacent ZIPs" },
                        { value: "around_town", label: "Around Town", desc: "~10 mi" },
                        { value: "metro", label: "Metro", desc: "~25 mi" }
                      ].map((tier) => (
                        <button
                          key={tier.value}
                          type="button"
                          onClick={() => setTempSelectedTier(tier.value)}
                          className={`px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 border-2 ${
                            tempSelectedTier === tier.value
                              ? "bg-purple-600 text-white border-purple-600 shadow-md"
                              : "bg-white text-gray-700 border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                          }`}
                        >
                          <div className="font-semibold">{tier.label}</div>
                          <div className={`text-xs mt-0.5 ${
                            tempSelectedTier === tier.value ? "text-purple-200" : "text-gray-500"
                          }`}>
                            {tier.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Show Options */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold">Show</label>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempShowLiveShows}
                          onChange={(e) => setTempShowLiveShows(e.target.checked)}
                          className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-sm font-medium">Live Shows</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempShowSellers}
                          onChange={(e) => setTempShowSellers(e.target.checked)}
                          className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-sm font-medium">Sellers Nearby</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempShowCommunities}
                          onChange={(e) => setTempShowCommunities(e.target.checked)}
                          className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-sm font-medium">Communities</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempShowOnlyFollowed}
                          onChange={(e) => setTempShowOnlyFollowed(e.target.checked)}
                          className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-sm font-medium">I Follow</span>
                      </label>
                    </div>
                  </div>

                  {/* Apply Button */}
                  <Button 
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold"
                    onClick={handleApplyFilters}
                  >
                    Apply Filters
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Stats Bubbles */}
      <div className="bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
            <button
              onClick={handleQuickFilterLiveShows}
              className={`relative rounded-lg p-3 overflow-hidden transition-all duration-200 cursor-pointer ${
                isShowingOnlyLiveShows ? 'ring-4 ring-red-500 scale-105' : 'hover:scale-105'
              }`}
            >
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=400&h=300&fit=crop&q=80"
                  alt="Live streaming"
                  className="w-full h-full object-cover"
                />
                <div className={`absolute inset-0 ${
                  isShowingOnlyLiveShows 
                    ? 'bg-gradient-to-t from-red-600/80 via-red-500/40 to-transparent' 
                    : 'bg-gradient-to-t from-black/60 via-transparent to-transparent'
                }`}></div>
              </div>
              
              <div className="relative z-10 text-center">
                <div className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">
                  {displayedLiveShows.length}
                </div>
                <div className="text-xs font-semibold drop-shadow-lg text-white">Live Shows</div>
              </div>
              {isShowingOnlyLiveShows && (
                <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                </div>
              )}
            </button>

            <button
              onClick={handleQuickFilterSellers}
              className={`relative rounded-lg p-3 overflow-hidden transition-all duration-200 cursor-pointer ${
                isShowingOnlySellers ? 'ring-4 ring-purple-500 scale-105' : 'hover:scale-105'
              }`}
            >
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1556740758-90de374c12ad?w=400&h=300&fit=crop&q=80"
                  alt="Local sellers"
                  className="w-full h-full object-cover"
                />
                <div className={`absolute inset-0 ${
                  isShowingOnlySellers 
                    ? 'bg-gradient-to-t from-purple-600/80 via-purple-500/40 to-transparent' 
                    : 'bg-gradient-to-t from-black/60 via-transparent to-transparent'
                }`}></div>
              </div>
              
              <div className="relative z-10 text-center">
                <div className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">
                  {displayedSellers.length}
                </div>
                <div className="text-xs font-semibold drop-shadow-lg text-white">Sellers Nearby</div>
              </div>
              {isShowingOnlySellers && (
                <div className="absolute top-1 right-1 bg-purple-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                </div>
              )}
            </button>

            <button
              onClick={handleQuickFilterCommunities}
              className={`relative rounded-lg p-3 overflow-hidden transition-all duration-200 cursor-pointer ${
                isShowingOnlyCommunities ? 'ring-4 ring-blue-500 scale-105' : 'hover:scale-105'
              }`}
            >
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=400&h=300&fit=crop&q=80"
                  alt="Communities"
                  className="w-full h-full object-cover"
                />
                <div className={`absolute inset-0 ${
                  isShowingOnlyCommunities 
                    ? 'bg-gradient-to-t from-blue-600/80 via-blue-500/40 to-transparent' 
                    : 'bg-gradient-to-t from-black/60 via-transparent to-transparent'
                }`}></div>
              </div>
              
              <div className="relative z-10 text-center">
                <div className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">
                  {displayedCommunities.length}
                </div>
                <div className="text-xs font-semibold drop-shadow-lg text-white">Communities</div>
              </div>
              {isShowingOnlyCommunities && (
                <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {locationError && (
          <Alert className="mb-6 border-orange-500 bg-orange-50">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <AlertDescription className="text-orange-900">
              <strong>Location Access Needed:</strong> {locationError}
              <br />
              <button
                onClick={requestLocation}
                className="mt-2 text-purple-600 hover:text-purple-700 font-semibold underline"
              >
                Try Again
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Phase-1: Manual ZIP fallback when GPS fails or ZIP unresolved */}
        {zipError && !userZip && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <p className="text-sm text-orange-800 mb-3">{zipError}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter your ZIP code"
                  maxLength={5}
                  className="flex-1 border border-orange-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length === 5) {
                      setUserZip(val);
                      setZipError(null);
                    }
                  }}
                />
              </div>
              <p className="text-xs text-orange-600 mt-2">Enter a 5-digit ZIP to continue</p>
            </CardContent>
          </Card>
        )}

        {/* Phase-1: Display resolved ZIP */}
        {userZip && (
          <div className="mb-4 text-sm text-gray-600 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-purple-600" />
            <span>Your ZIP: <strong className="text-gray-900">{userZip}</strong></span>
          </div>
        )}

        {loadingLocation && (
          <Card className="border-0 shadow-lg mb-6">
            <CardContent className="p-12 text-center">
              <Navigation className="w-16 h-16 text-purple-600 mx-auto mb-4 animate-pulse" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Finding nearby sellers and shows...
              </h3>
              <p className="text-gray-600">
                Please allow location access when prompted
              </p>
            </CardContent>
          </Card>
        )}

        {!loadingLocation && userLocation && (
          <>
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* LIVE SHOWS SECTIONS (sectioned layout like Communities) */}
            {/* Section order: 1) Near You (Discovery), 2) From Sellers You Follow */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            
            {/* Section 1: Live Shows Near You (IN-ZONE, discovery-first) */}
            {shouldShowLiveShows && liveShowsOtherInZone.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <MapPin className="w-5 h-5 text-green-600" />
                  <h2 className="text-xl font-bold text-gray-900">Live Shows Near You</h2>
                  <Badge className="bg-gradient-to-r from-red-500 to-green-500 text-white border-0 text-xs animate-pulse">
                    {liveShowsOtherInZone.length} LIVE
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {liveShowsOtherInZone.map((show) => (
                    <LiveShowCard
                      key={show.id}
                      show={show}
                      seller={sellersMap[show.seller_id]}
                      onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {/* Section 2: Live Shows From Sellers You Follow (IN-ZONE only) */}
            {shouldShowLiveShows && liveShowsFollowedInZone.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <Radio className="w-5 h-5 text-purple-600" />
                  <h2 className="text-xl font-bold text-gray-900">Live Shows From Sellers You Follow</h2>
                  <Badge className="bg-purple-600 text-white border-0 text-xs">
                    {liveShowsFollowedInZone.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {liveShowsFollowedInZone.map((show) => (
                    <LiveShowCard
                      key={show.id}
                      show={show}
                      seller={sellersMap[show.seller_id]}
                      onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Coming Up Near You - uses ZONE-GATED arrays, always shows both followed + other */}
            {shouldShowLiveShows && (upcomingShowsFollowedInZone.length > 0 || upcomingShowsOtherInZone.length > 0) && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Coming Up Near You</h2>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {/* Followed sellers' shows first */}
                  {upcomingShowsFollowedInZone.length > 0 && (
                    <>
                      <div className="col-span-full">
                        <p className="text-sm font-medium text-purple-600 mb-2">From Sellers You Follow</p>
                      </div>
                      {upcomingShowsFollowedInZone.map((show) => (
                        <LiveShowCard
                          key={show.id}
                          show={show}
                          seller={sellersMap[show.seller_id]}
                          onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                          isUpcoming
                        />
                      ))}
                    </>
                  )}
                  {/* Other shows - always visible (iFollow does NOT hide) */}
                  {upcomingShowsOtherInZone.map((show) => (
                    <LiveShowCard
                      key={show.id}
                      show={show}
                      seller={sellersMap[show.seller_id]}
                      onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                      isUpcoming
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* SELLERS SECTIONS (sectioned layout like Communities/Live Shows) */}
            {/* Section order: 1) Live Sellers (discovery), 2) You Follow, 3) Near You */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            
            {/* Section 1: Live Sellers Near You (IN-ZONE, currently streaming - DISCOVERY FIRST) */}
            {shouldShowSellers && liveSellersInZone.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <Radio className="w-5 h-5 text-red-500" />
                  <h2 className="text-xl font-bold text-gray-900">Live Sellers Near You</h2>
                  <Badge className="bg-gradient-to-r from-red-500 to-purple-500 text-white border-0 text-xs animate-pulse">
                    {liveSellersInZone.length} LIVE
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {liveSellersInZone.map((seller) => (
                    <SellerCard
                      key={seller.id}
                      seller={seller}
                      onClick={() => navigate(createPageUrl("SellerStorefront") + `?sellerId=${seller.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {/* Section 2: Sellers You Follow (IN-ZONE, not live) */}
            {shouldShowSellers && followedSellersNotLive.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-purple-600 rounded-full animate-pulse"></div>
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                  <h2 className="text-xl font-bold text-gray-900">Sellers You Follow</h2>
                  <Badge className="bg-purple-600 text-white border-0 text-xs">
                    {followedSellersNotLive.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {followedSellersNotLive.map((seller) => (
                    <SellerCard
                      key={seller.id}
                      seller={seller}
                      onClick={() => navigate(createPageUrl("SellerStorefront") + `?sellerId=${seller.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {/* Section 3: Sellers Near You (IN-ZONE, not followed, not live) */}
            {shouldShowSellers && otherSellersNotLive.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <MapPin className="w-5 h-5 text-green-600" />
                  <h2 className="text-xl font-bold text-gray-900">Sellers Near You</h2>
                  <Badge className="bg-green-600 text-white border-0 text-xs">
                    {otherSellersNotLive.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {otherSellersNotLive.map((seller) => (
                    <SellerCard
                      key={seller.id}
                      seller={seller}
                      onClick={() => navigate(createPageUrl("SellerStorefront") + `?sellerId=${seller.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* COMMUNITIES SECTIONS (Discovery-first layout) */}
            {/* Section order: 1) Live Near You (discovery), 2) You Follow, 3) Near You */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            
            {/* Section 1: Live Communities Near You (IN-ZONE, DISCOVERY FIRST) */}
            {shouldShowCommunities && liveCommunitiesInZone.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <Radio className="w-5 h-5 text-red-500" />
                  <h2 className="text-xl font-bold text-gray-900">Live Communities Near You</h2>
                  <Badge className="bg-gradient-to-r from-red-500 to-green-500 text-white border-0 text-xs animate-pulse">
                    {liveCommunitiesInZone.length} LIVE
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {liveCommunitiesInZone.map((community) => (
                    <CommunityCard
                      key={community.id}
                      community={community}
                      onClick={() => navigate(createPageUrl("CommunityPage") + `?community=${community.name}`)}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {/* Section 2: Communities You Follow (IN-ZONE, not live) */}
            {shouldShowCommunities && user && followedCommunitiesNotLive.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 bg-purple-600 rounded-full animate-pulse"></div>
                  <h2 className="text-xl font-bold text-gray-900">Communities You Follow</h2>
                  <Badge className="bg-purple-600 text-white border-0 text-xs">
                    {followedCommunitiesNotLive.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {followedCommunitiesNotLive.map((community) => (
                    <CommunityCard
                      key={community.id}
                      community={community}
                      onClick={() => navigate(createPageUrl("CommunityPage") + `?community=${community.name}`)}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {/* Section 3: Communities Near You (IN-ZONE, not followed, not live) */}
            {shouldShowCommunities && otherCommunitiesNotLive.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <MapPin className="w-5 h-5 text-green-600" />
                  <h2 className="text-xl font-bold text-gray-900">Communities Near You</h2>
                  <Badge className="bg-green-600 text-white border-0 text-xs">
                    {otherCommunitiesNotLive.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {otherCommunitiesNotLive.map((community) => (
                    <CommunityCard
                      key={community.id}
                      community={community}
                      onClick={() => navigate(createPageUrl("CommunityPage") + `?community=${community.name}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {displayedLiveShows.length === 0 && 
             displayedUpcomingShows.length === 0 && 
             displayedSellers.length === 0 && 
             inZoneCommunities.length === 0 && (
              <Card className="border-2 border-dashed border-gray-300">
                <CardContent className="p-16 text-center">
                  <MapPin className="w-20 h-20 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                    No results found
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Try adjusting your filters or expanding your search area
                  </p>
                  <Button
                    className="bg-gradient-to-r from-purple-600 to-blue-600"
                    onClick={() => navigate(createPageUrl("Marketplace"))}
                  >
                    Browse All Sellers
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Card className="mt-12 border-0 bg-gradient-to-r from-purple-50 to-blue-50">
          <CardContent className="p-8 text-center">
            <MapPin className="w-12 h-12 text-purple-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Local Shopping Made Easy
            </h3>
            <p className="text-gray-600 mb-4">
              Discover live shows, sellers, and communities near you. All items are available for local pickup only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
