import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Radio, Users, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import CommunityCard from "../components/marketplace/CommunityCard";
import UnifiedSearchBar from "../components/search/UnifiedSearchBar";

export default function Communities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    loadUser();
    requestLocation();
  }, []);

  // Request user's location on component mount
  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.log("Location access denied or unavailable:", error);
          // Silently fail - user can still browse all communities
        }
      );
    }
  };

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    }
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // ZIP to coordinates mapping (simplified - matches Near Me page logic)
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

  // Handle Near Me button click
  const handleNearMeClick = () => {
    navigate(createPageUrl("NearMe"));
  };

  // Fetch all active communities
  const { data: allCommunities = [], isLoading: communitiesLoading } = useQuery({
    queryKey: ['all-communities'],
    queryFn: () => base44.entities.Community.filter({ is_active: true }, 'sort_order')
  });

  // Fetch followed communities
  const { data: followedCommunities = [] } = useQuery({
    queryKey: ['followed-communities', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const follows = await base44.entities.FollowedCommunity.filter({ user_id: user.id });
      return follows.map(f => f.community_id);
    },
    enabled: !!user
  });

  // Fetch all shows to calculate live counts per community
  const { data: allShows = [] } = useQuery({
    queryKey: ['all-shows-for-communities'],
    queryFn: () => base44.entities.Show.filter({ status: "live" }),
    refetchInterval: 5000
  });

  // Calculate follower counts for each community
  const { data: followerCounts = {} } = useQuery({
    queryKey: ['community-follower-counts'],
    queryFn: async () => {
      const allFollows = await base44.entities.FollowedCommunity.list();
      const counts = {};
      allFollows.forEach(follow => {
        counts[follow.community_id] = (counts[follow.community_id] || 0) + 1;
      });
      return counts;
    }
  });

  // Calculate live show counts per community
  const liveShowCounts = allShows.reduce((acc, show) => {
    const communityId = show.community;
    acc[communityId] = (acc[communityId] || 0) + 1;
    return acc;
  }, {});

  // Filter communities based on search
  const filteredCommunities = allCommunities.filter(community => {
    if (!searchTerm.trim()) return true;
    const lowerSearch = searchTerm.toLowerCase();
    return (
      community.label?.toLowerCase().includes(lowerSearch) ||
      community.name?.toLowerCase().includes(lowerSearch)
    );
  });

  // Add distance to communities if location is available (using zip_code like Near Me page)
  const communitiesWithDistance = filteredCommunities.map(community => {
    if (userLocation && community.zip_code) {
      const coords = zipToCoords(community.zip_code);
      if (coords) {
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          coords.lat,
          coords.lon
        );
        return { ...community, distance };
      }
    }
    return { ...community, distance: null };
  });

  // Separate followed and unfollowed communities
  let followedCommunitiesList = communitiesWithDistance.filter(c => 
    followedCommunities.includes(c.id)
  );

  let otherCommunitiesList = communitiesWithDistance.filter(c => 
    !followedCommunities.includes(c.id)
  );

  // Communities near you (20-mile radius)
  const nearbyFollowedCommunities = userLocation 
    ? communitiesWithDistance
        .filter(c => c.distance !== null && c.distance <= 20 && followedCommunities.includes(c.id))
        .sort((a, b) => a.distance - b.distance)
    : [];

  const nearbyOtherCommunities = userLocation
    ? communitiesWithDistance
        .filter(c => c.distance !== null && c.distance <= 20 && !followedCommunities.includes(c.id))
        .sort((a, b) => a.distance - b.distance)
    : [];

  const hasNearbyCommunities = nearbyFollowedCommunities.length > 0 || nearbyOtherCommunities.length > 0;

  const liveCommunities = communitiesWithDistance.filter(c => 
    (liveShowCounts[c.name] || 0) > 0
  );

  const featuredCommunities = communitiesWithDistance.filter(c => c.is_active);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Title */}
          <div className="text-center mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Find Your Community
            </h1>
          </div>

          {/* Search Bar + Near Me */}
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2">
              <div className="flex-[3]">
                <UnifiedSearchBar placeholder="Search communities..." />
              </div>
              
              <Button
                onClick={handleNearMeClick}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg rounded-xl border-0 px-3 sm:px-4 py-2 transition-all hover:scale-105"
              >
                <MapPin className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="text-sm sm:text-base whitespace-nowrap">Near Me</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 space-y-6">
        {/* Communities You Follow */}
        {user && followedCommunitiesList.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-purple-600 rounded-full animate-pulse"></div>
              <h2 className="text-xl font-bold text-gray-900">Communities You Follow</h2>
              <Badge className="bg-purple-600 text-white border-0 text-xs">
                {followedCommunitiesList.length}
              </Badge>
            </div>

            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4">
              <div className="flex px-4" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(followedCommunitiesList.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockCommunities = followedCommunitiesList.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4" 
                      style={{ width: '100vw' }}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {blockCommunities.map((community) => (
                          <CommunityCard
                            key={community.id}
                            community={community}
                            onClick={() => navigate(createPageUrl(`CommunityPage?community=${community.name}`))}
                            followerCount={followerCounts[community.id] || 0}
                            liveShowCount={liveShowCounts[community.name] || 0}
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

                      {/* Communities Near You */}
        {userLocation && hasNearbyCommunities && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <MapPin className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-bold text-gray-900">Communities Near You</h2>
              <Badge className="bg-green-600 text-white border-0 text-xs">
                {nearbyFollowedCommunities.length + nearbyOtherCommunities.length}
              </Badge>
            </div>

            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4 md:overflow-visible">
              <div className="flex px-4 md:block" style={{ scrollSnapType: 'x mandatory' }}>
                {(() => {
                  const allNearbyCommunities = [...nearbyFollowedCommunities, ...nearbyOtherCommunities];
                  return Array.from({ length: Math.ceil(allNearbyCommunities.length / 4) }).map((_, blockIndex) => {
                    const startIdx = blockIndex * 4;
                    const blockCommunities = allNearbyCommunities.slice(startIdx, startIdx + 4);
                    return (
                      <div 
                        key={blockIndex} 
                        className="snap-start flex-shrink-0 px-4 md:px-0" 
                        style={{ width: '100vw' }}
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                          {blockCommunities.map((community) => (
                            <CommunityCard
                              key={community.id}
                              community={community}
                              onClick={() => navigate(createPageUrl(`CommunityPage?community=${community.name}`))}
                              followerCount={followerCounts[community.id] || 0}
                              liveShowCount={liveShowCounts[community.name] || 0}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </section>
        )}

        {/* Live Now Communities */}
        {liveCommunities.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <Radio className="w-5 h-5 text-red-500 animate-pulse" />
              <h2 className="text-xl font-bold text-gray-900">Live Now</h2>
              <Badge className="bg-red-500 text-white border-0 text-xs">
                {liveCommunities.length}
              </Badge>
            </div>

            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4 md:overflow-visible">
              <div className="flex px-4 md:block" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(liveCommunities.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockCommunities = liveCommunities.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4 md:px-0" 
                      style={{ width: '100vw' }}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {blockCommunities.map((community) => (
                          <CommunityCard
                            key={community.id}
                            community={community}
                            onClick={() => navigate(createPageUrl(`CommunityPage?community=${community.name}`))}
                            followerCount={followerCounts[community.id] || 0}
                            liveShowCount={liveShowCounts[community.name] || 0}
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

        {/* Featured Communities */}
        {featuredCommunities.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              <h2 className="text-xl font-bold text-gray-900">Featured Communities</h2>
              <Badge className="bg-gradient-to-r from-purple-600 to-blue-500 text-white border-0 text-xs">
                {featuredCommunities.length}
              </Badge>
            </div>

            <div className="overflow-x-scroll snap-x snap-mandatory scrollbar-hide -mx-4 md:overflow-visible">
              <div className="flex px-4 md:block" style={{ scrollSnapType: 'x mandatory' }}>
                {Array.from({ length: Math.ceil(featuredCommunities.length / 4) }).map((_, blockIndex) => {
                  const startIdx = blockIndex * 4;
                  const blockCommunities = featuredCommunities.slice(startIdx, startIdx + 4);
                  return (
                    <div 
                      key={blockIndex} 
                      className="snap-start flex-shrink-0 px-4 md:px-0" 
                      style={{ width: '100vw' }}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {blockCommunities.map((community) => (
                          <CommunityCard
                            key={community.id}
                            community={community}
                            onClick={() => navigate(createPageUrl(`CommunityPage?community=${community.name}`))}
                            followerCount={followerCounts[community.id] || 0}
                            liveShowCount={liveShowCounts[community.name] || 0}
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
        {filteredCommunities.length === 0 && !communitiesLoading && (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-12 sm:p-16 text-center">
              <Users className="w-16 h-16 sm:w-20 sm:h-20 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
                No communities found
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm ? "Try a different search term" : "Check back soon for new communities"}
              </p>
              {searchTerm && (
                <Button
                  variant="outline"
                  onClick={() => setSearchTerm("")}
                >
                  Clear Search
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Future Expansion Placeholder */}
        <section className="mt-12">
          <Card className="border-0 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 overflow-hidden">
            <CardContent className="p-8 sm:p-12 relative">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
              <div className="relative text-center">
                <Sparkles className="w-12 h-12 text-white mx-auto mb-4" />
                <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4">
                  Want to create your own community?
                </h2>
                <p className="text-lg sm:text-xl text-white/90 mb-6">
                  Community creation is coming soon! Join existing communities while we build this feature.
                </p>
                <Badge className="bg-white/20 text-white border-white/50 border text-sm px-4 py-2">
                  Coming Soon
                </Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Community Info Section */}
        <section>
          <Card className="border-0 shadow-xl">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">What are Communities?</h3>
              <div className="space-y-4 text-gray-700">
                <p className="leading-relaxed">
                  <strong>Communities</strong> are themed marketplaces within LiveMarket where you can discover shows, sellers, and products specific to your interests. Whether you're into vintage treasures, local yard sales, or specialty stores, there's a community for you.
                </p>
                <p className="leading-relaxed">
                  <strong>Follow communities</strong> to get notifications when sellers in those communities go live. Each community represents a unique shopping experience with its own vibe and product selection.
                </p>
                <p className="leading-relaxed">
                  <strong>Future expansion:</strong> Soon, communities will have their own dedicated subdomains (like openhouses.live, yardsales.live) and advanced features like community-specific events, leaderboards, and exclusive deals.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}