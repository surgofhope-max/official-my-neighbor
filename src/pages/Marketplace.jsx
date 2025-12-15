import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Store, Home, Package, Sparkles, Truck, ShoppingCart, Leaf, Video, Key } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import LiveShowCard from "../components/marketplace/LiveShowCard";
import SellerCard from "../components/marketplace/SellerCard";
import CommunityCarousel from "../components/marketplace/CommunityCarousel";
import UnifiedSearchBar from "../components/search/UnifiedSearchBar";
import { getLiveShows, getScheduledShows } from "@/api/shows";

// Map for dynamic Lucide icon rendering in the empty state
const LucideIconMap = {
  Package: Package,
  Store: Store,
  Home: Home,
  ShoppingCart: ShoppingCart,
  Sparkles: Sparkles,
  Truck: Truck,
  Leaf: Leaf,
  Video: Video,
  Key: Key,
};

export default function Marketplace() {
  const navigate = useNavigate();
  const [selectedCommunity, setSelectedCommunity] = useState("all");
  const [user, setUser] = useState(null);

  // Data state (replacing React Query)
  const [liveShows, setLiveShows] = useState([]);
  const [upcomingShows, setUpcomingShows] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [allSellers, setAllSellers] = useState([]);
  const [followedSellers, setFollowedSellers] = useState([]);

  // Load user on component mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    }
  };

  // Load shows using Supabase API
  const loadShows = async () => {
    try {
      const [live, scheduled] = await Promise.all([
        getLiveShows(),
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

  // Load sellers (still uses legacy calls - will be migrated separately)
  const loadSellers = async () => {
    try {
      const [approvedSellers, allSellersList] = await Promise.all([
        base44.entities.Seller.filter({ status: "approved" }, '-total_sales'),
        base44.entities.Seller.list(),
      ]);
      setSellers(approvedSellers);
      setAllSellers(allSellersList);
    } catch (error) {
      setSellers([]);
      setAllSellers([]);
    }
  };

  // Load followed sellers for logged-in user
  const loadFollowedSellers = async () => {
    if (!user?.id) {
      setFollowedSellers([]);
      return;
    }
    
    try {
      const follows = await base44.entities.FollowedSeller.filter({ buyer_id: user.id });
      setFollowedSellers(follows.map(f => f.seller_id));
    } catch (error) {
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

  // Community Categories with themed placeholder images and icons (icon names as strings)
  const communities = [
    { 
      id: "all", 
      label: "All", 
      icon: "Package", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=300&fit=crop",
      color: "from-purple-500 to-blue-500"
    },
    { 
      id: "stores", 
      label: "Stores", 
      icon: "Store", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop",
      color: "from-blue-500 to-cyan-500"
    },
    { 
      id: "yard_sales", 
      label: "Yard Sales", 
      icon: "Home", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=300&fit=crop",
      color: "from-green-500 to-emerald-500"
    },
    { 
      id: "swap_meets", 
      label: "Swap Meets", 
      icon: "ShoppingCart", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1555421689-d68471e189f2?w=400&h=300&fit=crop",
      color: "from-orange-500 to-red-500"
    },
    { 
      id: "vintage", 
      label: "Vintage", 
      icon: "Sparkles", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1595246140625-573b715d11dc?w=400&h=300&fit=crop",
      color: "from-amber-500 to-yellow-500"
    },
    { 
      id: "az_offroad", 
      label: "AZ Off-Road", 
      icon: "Truck", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400&h=300&fit=crop",
      color: "from-red-500 to-orange-500"
    },
    { 
      id: "farmers_market", 
      label: "Farmer's Market", 
      icon: "Leaf", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=400&h=300&fit=crop",
      color: "from-lime-500 to-green-500"
    },
    { 
      id: "plant_animal", 
      label: "Plant & Animal", 
      icon: "Leaf", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop",
      color: "from-teal-500 to-cyan-500"
    },
    { 
      id: "infomercial", 
      label: "Infomercial", 
      icon: "Video", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1551817958-11e0f7bbea5a?w=400&h=300&fit=crop",
      color: "from-indigo-500 to-purple-500"
    },
    { 
      id: "open_house", 
      label: "Open House", 
      icon: "Key", // Changed to string
      bgImage: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=300&fit=crop",
      color: "from-pink-500 to-rose-500"
    }
  ];

  // Filter shows by selected community (searchTerm logic removed)
  const filteredLiveShows = liveShows.filter(show => {
    const matchesCommunity = selectedCommunity === "all" || show.community === selectedCommunity;
    return matchesCommunity;
  });

  const filteredUpcomingShows = upcomingShows.filter(show => {
    const matchesCommunity = selectedCommunity === "all" || show.community === selectedCommunity;
    return matchesCommunity;
  });

  // Filter shows from followed sellers
  const liveShowsFromFollowedSellers = filteredLiveShows.filter(show => 
    followedSellers.includes(show.seller_id)
  );

  const upcomingShowsFromFollowedSellers = filteredUpcomingShows.filter(show => 
    followedSellers.includes(show.seller_id)
  );

  // Get community counts
  const getCommunityCounts = (communityId) => {
    if (communityId === "all") {
      return {
        live: liveShows.length,
        upcoming: upcomingShows.length
      };
    }
    return {
      live: liveShows.filter(s => s.community === communityId).length,
      upcoming: upcomingShows.filter(s => s.community === communityId).length
    };
  };

  const selectedCommunityData = communities.find(c => c.id === selectedCommunity);
  const CurrentCommunityIcon = selectedCommunityData?.icon ? LucideIconMap[selectedCommunityData.icon] : null;

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
                  onCommunitySelect={setSelectedCommunity}
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
            communities={communities}
            selectedCommunity={selectedCommunity}
            onSelectCommunity={setSelectedCommunity}
            getCommunityCounts={getCommunityCounts}
          />
        </div>
      </div>

      {/* TIGHTENED: Main Content - Reduced space-y-4 to space-y-2 (50% reduction between sections) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-1 pb-4 space-y-1">
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
                      className="snap-start flex-shrink-0 px-4" 
                      style={{ width: '100vw' }}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockShows.map((show) => (
                          <LiveShowCard
                            key={show.id}
                            show={show}
                            seller={sellersMap[show.seller_id]}
                            onClick={() => navigate(createPageUrl(`LiveShow?showId=${show.id}`))}
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
                      className="snap-start flex-shrink-0 px-4" 
                      style={{ width: '100vw' }}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockShows.map((show) => (
                          <LiveShowCard
                            key={show.id}
                            show={show}
                            seller={sellersMap[show.seller_id]}
                            onClick={() => navigate(createPageUrl(`LiveShow?showId=${show.id}`))}
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
                      className="snap-start flex-shrink-0 px-4" 
                      style={{ width: '100vw' }}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockShows.map((show) => (
                          <LiveShowCard
                            key={show.id}
                            show={show}
                            seller={sellersMap[show.seller_id]}
                            onClick={() => {}}
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
        {sellers.length > 0 && selectedCommunity === "all" && (
          <section>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Featured Sellers</h2>
            </div>
            
            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4">
              <div className="flex px-4" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(sellers.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockSellers = sellers.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4" 
                      style={{ width: '100vw' }}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {blockSellers.map((seller) => (
                          <SellerCard
                            key={seller.id}
                            seller={seller}
                            initialFollowStatus={followedSellers.includes(seller.id)}
                            onClick={() => navigate(createPageUrl(`SellerStorefront?sellerId=${seller.id}`))}
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

        {/* Empty State */}
        {filteredLiveShows.length === 0 && filteredUpcomingShows.length === 0 && (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-12 sm:p-16 text-center">
              {CurrentCommunityIcon && <CurrentCommunityIcon className="w-16 h-16 sm:w-20 sm:h-20 text-gray-400 mx-auto mb-4" />}
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
                No shows in {selectedCommunityData?.label || selectedCommunityData?.name || selectedCommunity}
              </h3>
              <p className="text-gray-600 mb-6">
                Check back soon or explore other communities
              </p>
              <Button
                variant="outline"
                onClick={() => setSelectedCommunity("all")}
              >
                View All Communities
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Call to Action */}
        {selectedCommunity === "all" && (
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
                    onClick={() => navigate(createPageUrl("SellerDashboard"))}
                  >
                    Get Started as a Seller
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
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