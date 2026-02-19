import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package, Store, Home, ShoppingCart, Sparkles, Truck, Leaf, Video, Key, AlertCircle, Wrench, Heart, Gem } from "lucide-react";
import LiveShowCard from "../marketplace/LiveShowCard";
import UnifiedSearchBar from "../search/UnifiedSearchBar";

const iconMap = {
  Package, Store, Home, ShoppingCart, Sparkles, Truck, Leaf, Video, Key, Wrench, Heart, Gem
};

/**
 * Presentational component for community content (title, search, live/upcoming shows).
 * No data fetching - all data passed as props.
 * @param {React.ReactNode} [backButton] - Optional back button to render in header (stays in page, not part of extraction)
 * @param {boolean} [hideBackButton] - When true, do not render back button slot (for inline usage)
 * @param {boolean} [compactHeader] - When true, use compact card-style header (for Marketplace inline)
 * @param {boolean} [showMarketplaceBackButton] - When true, show "Back to Marketplace" in empty state (inline only)
 */
export default function CommunityView({
  communityName,
  community,
  dbCommunity,
  liveShows,
  upcomingShows,
  liveShowsLoading,
  upcomingShowsLoading,
  sellersMap,
  navigate,
  createPageUrl,
  communityQuote,
  backButton,
  hideBackButton,
  compactHeader = false,
  showMarketplaceBackButton = false,
}) {
  const CommunityIcon = iconMap[community?.icon_name] || Package;
  const totalShows = (liveShows?.length || 0) + (upcomingShows?.length || 0);

  return (
    <>
      {/* Header Section */}
      <div className={`bg-white ${compactHeader ? "rounded-xl bg-gray-100 shadow-sm px-3 py-2 mb-2" : "border-b border-gray-200 py-2"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {!hideBackButton && backButton}
          {/* Title Row */}
          <div className={`text-center ${compactHeader ? "mb-1" : "mb-2"}`}>
            <div className="flex items-center justify-center gap-2">
              <CommunityIcon className="w-5 h-5 text-gray-900" />
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {community?.label || community?.name || communityName}
              </h1>
              <Badge className="bg-gray-200 text-gray-900 border-0 text-xs px-2 py-0.5">
                {totalShows}
              </Badge>
            </div>
            <p className={`text-gray-600 text-xs sm:text-sm max-w-3xl mx-auto ${compactHeader ? "mt-0.5" : "mt-1"}`}>
              {community?.bio || communityQuote}
            </p>
          </div>

      {!compactHeader && (
        <>
      {/* Search Bar + Near Me */}
      <div className="max-w-2xl mx-auto">
        <div className="flex gap-2">
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
        </>
      )}
        </div>
      </div>

      {/* Main Content - Minimal Top Padding */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-8 space-y-4">
        {/* Debug Info Badge - Minimal */}
        {!dbCommunity && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-yellow-900">Using Temporary Data</p>
                <p className="text-xs text-yellow-700 mt-0.5">
                  Create this community in Admin Dashboard → Community Management to customize.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Live Shows - Compact */}
        {liveShows?.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Live Now</h2>
              <Badge className="bg-red-500 text-white border-0 text-xs py-0.5">
                {liveShows.length}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {liveShows.map((show) => (
                <LiveShowCard
                  key={show.id}
                  show={show}
                  seller={sellersMap?.[show.seller_id]}
                  onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Shows - Compact */}
        {upcomingShows?.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Coming Up</h2>
              <Badge className="bg-blue-500 text-white border-0 text-xs py-0.5">
                {upcomingShows.length}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {upcomingShows.map((show) => (
                <LiveShowCard
                  key={show.id}
                  show={show}
                  seller={sellersMap?.[show.seller_id]}
                  onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                  isUpcoming
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State - Ultra Compact to Fit Buttons on Screen */}
        {(liveShows?.length === 0 || !liveShows) && (upcomingShows?.length === 0 || !upcomingShows) && !liveShowsLoading && !upcomingShowsLoading && (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-6 sm:p-8 text-center">
              <CommunityIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
                No shows in {community?.label || community?.name || communityName || "this community"}
              </h3>
              <p className="text-gray-600 text-xs sm:text-sm mb-3">
                Check back soon or explore other communities
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => navigate(createPageUrl("Communities"))}
                  className="text-xs sm:text-sm py-2"
                >
                  View All Communities
                </Button>
                {showMarketplaceBackButton && (
                <Button
                  onClick={() => {
                    window.dispatchEvent(new Event("resetMarketplace"));
                  }}
                  className="bg-gradient-to-r from-purple-600 to-blue-500 text-xs sm:text-sm py-2"
                >
                  Back to Marketplace
                </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State - Compact */}
        {(liveShowsLoading || upcomingShowsLoading) && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="animate-pulse">
                <div className="h-40 bg-gray-200"></div>
                <CardContent className="p-3">
                  <div className="h-3 bg-gray-200 rounded mb-1.5"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
