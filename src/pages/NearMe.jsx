
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for non-Seller entities
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Radio, Calendar, TrendingUp, Navigation, AlertCircle, ArrowLeft, Users, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import LiveShowCard from "../components/marketplace/LiveShowCard";
import SellerCard from "../components/marketplace/SellerCard";
import CommunityCard from "../components/marketplace/CommunityCard";
import { getLiveShows, getScheduledShows } from "@/api/shows";

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
  
  // Filter States
  const [distanceRadius, setDistanceRadius] = useState(25);
  const [showLiveShows, setShowLiveShows] = useState(true);
  const [showSellers, setShowSellers] = useState(true);
  const [showCommunities, setShowCommunities] = useState(true);
  const [showOnlyFollowed, setShowOnlyFollowed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Temp states for modal
  const [tempDistance, setTempDistance] = useState(25);
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
  // STEP C6-E.7: Aligned to use Supabase API (same as Marketplace)
  // Uses status === "live" for discovery (show lifecycle state)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: liveShows = [] } = useQuery({
    queryKey: ['nearme-live-shows'],
    queryFn: async () => {
      const shows = await getLiveShows();
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
      
      console.log("NearMe: seller_cards fetched count =", data?.length || 0);
      
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
      const follows = await base44.entities.FollowedSeller.filter({ buyer_id: user.id });
      return follows.map(f => f.seller_id);
    },
    enabled: !!user
  });

  const { data: followedCommunities = [] } = useQuery({
    queryKey: ['followed-communities-nearme', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const follows = await base44.entities.FollowedCommunity.filter({ user_id: user.id });
      return follows.map(f => f.community_id);
    },
    enabled: !!user
  });

  // Build sellersMap from seller_cards (now mapped to legacy shape)
  const sellersMap = sellers.reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  useEffect(() => {
    if (filterOpen) {
      setTempDistance(distanceRadius);
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
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLoadingLocation(false);
      },
      (error) => {
        console.error("Location error:", error);
        setLocationError("Unable to get your location. Please enable location services.");
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
  
  // Base nearby sellers (distance filtered)
  const nearbySellers = sellers.filter(seller => {
    if (!userLocation) return false;
    // For now, all sellers are assumed to be near phoenixCoords for distance calculation
    // In a real app, sellers would have their own lat/lon
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      phoenixCoords.lat,
      phoenixCoords.lon
    );
    return distance <= distanceRadius;
  });

  // Apply "I Follow" filter to sellers
  const displayedSellers = showOnlyFollowed 
    ? nearbySellers.filter(s => followedSellers.includes(s.id))
    : nearbySellers;

  // Base nearby shows (distance filtered via seller location)
  const nearbyLiveShows = liveShows.filter(show => {
    const seller = sellersMap[show.seller_id];
    return seller && nearbySellers.some(s => s.id === seller.id);
  });

  const nearbyUpcomingShows = upcomingShows.filter(show => {
    const seller = sellersMap[show.seller_id];
    return seller && nearbySellers.some(s => s.id === seller.id);
  });

  // Apply "I Follow" filter to shows
  const displayedLiveShows = showOnlyFollowed 
    ? nearbyLiveShows.filter(show => followedSellers.includes(show.seller_id))
    : nearbyLiveShows;

  const displayedUpcomingShows = showOnlyFollowed 
    ? nearbyUpcomingShows.filter(show => followedSellers.includes(show.seller_id))
    : nearbyUpcomingShows;

  // NEW: Filter communities by distance using ZIP code
  const nearbyCommunities = communities.filter(community => {
    if (!userLocation || !community.zip_code) return false;
    const coords = zipToCoords(community.zip_code);
    if (!coords) return false; // If zip code doesn't map to coordinates
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      coords.lat,
      coords.lon
    );
    return distance <= distanceRadius;
  });

  const displayedCommunities = showOnlyFollowed 
    ? nearbyCommunities.filter(c => followedCommunities.includes(c.id))
    : nearbyCommunities;

  const handleApplyFilters = () => {
    setDistanceRadius(tempDistance);
    setShowLiveShows(tempShowLiveShows);
    setShowSellers(tempShowSellers);
    setShowCommunities(tempShowCommunities);
    setShowOnlyFollowed(tempShowOnlyFollowed);
    setFilterOpen(false);
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
                     `Within ${distanceRadius} miles`}
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
                  {/* Distance Slider */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold">Distance: {tempDistance} miles</label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={tempDistance}
                      onChange={(e) => setTempDistance(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>1 mile</span>
                      <span>50 miles</span>
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
            {shouldShowLiveShows && displayedLiveShows.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Live Now Near You</h2>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {displayedLiveShows.map((show) => (
                    <LiveShowCard
                      key={show.id}
                      show={show}
                      seller={sellersMap[show.seller_id]}
                      onClick={() => navigate(createPageUrl(`LiveShow?showId=${show.id}`))}
                    />
                  ))}
                </div>
              </section>
            )}

            {shouldShowLiveShows && displayedUpcomingShows.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Coming Up Near You</h2>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {displayedUpcomingShows.map((show) => (
                    <LiveShowCard
                      key={show.id}
                      show={show}
                      seller={sellersMap[show.seller_id]}
                      onClick={() => {}}
                      isUpcoming
                    />
                  ))}
                </div>
              </section>
            )}

            {shouldShowSellers && displayedSellers.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Sellers Near You</h2>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {displayedSellers.map((seller) => (
                    <SellerCard
                      key={seller.id}
                      seller={seller}
                      onClick={() => navigate(createPageUrl(`SellerStorefront?sellerId=${seller.id}`))}
                    />
                  ))}
                </div>
              </section>
            )}

            {shouldShowCommunities && displayedCommunities.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Communities Near You</h2>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {displayedCommunities.map((community) => (
                    <CommunityCard
                      key={community.id}
                      community={community}
                      onClick={() => navigate(createPageUrl(`CommunityPage?community=${community.name}`))}
                    />
                  ))}
                </div>
              </section>
            )}

            {displayedLiveShows.length === 0 && 
             displayedUpcomingShows.length === 0 && 
             displayedSellers.length === 0 && 
             displayedCommunities.length === 0 && (
              <Card className="border-2 border-dashed border-gray-300">
                <CardContent className="p-16 text-center">
                  <MapPin className="w-20 h-20 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                    No results found
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Try adjusting your filters or expanding your search radius
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
              Discover live shows, sellers, and communities within {distanceRadius} miles of your location. All items are available for local pickup only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
