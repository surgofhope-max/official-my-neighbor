
import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Radio, 
  Calendar, 
  Users, 
  Eye, 
  MapPin
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import CommunityCarousel from "../components/marketplace/CommunityCarousel";
import UnifiedSearchBar from "../components/search/UnifiedSearchBar"; // New import

export default function LiveShows() {
  const navigate = useNavigate();
  // Removed searchTerm state as it's now handled by UnifiedSearchBar
  const [selectedCommunity, setSelectedCommunity] = useState("all");

  const { data: shows = [], isLoading } = useQuery({
    queryKey: ['all-shows'],
    queryFn: () => base44.entities.Show.filter({}, '-scheduled_start'),
    refetchInterval: 10000
  });

  // Filter shows by community (searchTerm filtering removed, assumed handled by UnifiedSearchBar if needed elsewhere)
  const filteredShows = shows.filter(show => {
    const matchesCommunity = selectedCommunity === "all" || show.community === selectedCommunity;
    return matchesCommunity;
  });

  const liveShows = filteredShows.filter(s => s.status === "live");
  const upcomingShows = filteredShows.filter(s => s.status === "scheduled");

  const statusColors = {
    scheduled: "bg-blue-100 text-blue-800 border-blue-200",
    live: "bg-red-100 text-red-800 border-red-200"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Marketplace-Style Header */}
      <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 py-5 pb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Search Bar + Near Me Button - REPLACED WITH UNIFIED SEARCH */}
          <div className="max-w-2xl mx-auto mb-3">
            <div className="flex gap-2">
              {/* NEW: Unified Search Bar */}
              <div className="flex-[3]">
                <UnifiedSearchBar placeholder="Search shows, sellers..." />
              </div>
              
              <Button
                onClick={() => navigate(createPageUrl("NearMe"))}
                className="flex-1 bg-white/95 hover:bg-white text-purple-600 font-semibold shadow-2xl rounded-xl border-0 px-3 sm:px-4 py-2 transition-all hover:scale-105"
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-8">
        {/* Live Shows */}
        {liveShows.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Radio className="w-6 h-6 text-red-500 animate-pulse" />
              <h2 className="text-2xl font-bold text-gray-900">Live Now</h2>
              <Badge className="bg-red-500 text-white border-0">
                {liveShows.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {liveShows.map((show) => (
                <Card
                  key={show.id}
                  className="group cursor-pointer border-2 border-red-500 shadow-xl hover:shadow-2xl transition-all duration-300"
                  onClick={() => navigate(createPageUrl(`LiveShow?showId=${show.id}`))}
                >
                  <div className="relative h-56 bg-gradient-to-br from-red-500 to-purple-600 overflow-hidden">
                    {show.thumbnail_url ? (
                      <img
                        src={show.thumbnail_url}
                        alt={show.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Radio className="w-16 h-16 text-white" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <Badge className="absolute top-3 right-3 bg-red-500 text-white border-0 animate-pulse px-3 py-1">
                      <Radio className="w-3 h-3 mr-1" />
                      LIVE
                    </Badge>
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="font-bold text-xl text-white mb-1">{show.title}</h3>
                      <div className="flex items-center gap-2 text-white/90 text-sm">
                        <Users className="w-4 h-4" />
                        {show.viewer_count || 0} watching
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <Button className="w-full bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700">
                      <Eye className="w-4 h-4 mr-2" />
                      Watch Now
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Shows */}
        {upcomingShows.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-blue-500" />
              <h2 className="text-2xl font-bold text-gray-900">Coming Up</h2>
              <Badge className="bg-blue-500 text-white border-0">
                {upcomingShows.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {upcomingShows.map((show) => (
                <Card
                  key={show.id}
                  className="group cursor-pointer border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <div className="relative h-56 bg-gradient-to-br from-blue-500 to-purple-600 overflow-hidden">
                    {show.thumbnail_url ? (
                      <img
                        src={show.thumbnail_url}
                        alt={show.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Calendar className="w-16 h-16 text-white" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <Badge className={`absolute top-3 right-3 ${statusColors[show.status]} border px-3 py-1`}>
                      Scheduled
                    </Badge>
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="font-bold text-xl text-white mb-1">{show.title}</h3>
                      <div className="flex items-center gap-2 text-white/90 text-sm">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(show.scheduled_start), "MMM d 'at' h:mm a")}
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <p className="text-gray-600 text-sm">
                      {show.description || "No description"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredShows.length === 0 && !isLoading && (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-16 text-center">
              <Radio className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <h3 className="text-2xl font-semibold text-gray-900 mb-2">No shows available</h3>
              <p className="text-gray-600 mb-4">
                {selectedCommunity !== "all" 
                  ? `No shows found in ${selectedCommunity}` 
                  : "Check back soon for live shopping streams!"}
              </p>
              {selectedCommunity !== "all" && (
                <Button
                  variant="outline"
                  onClick={() => setSelectedCommunity("all")}
                >
                  View All Communities
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="animate-pulse">
                <div className="h-56 bg-gray-200"></div>
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
