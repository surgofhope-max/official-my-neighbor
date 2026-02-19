import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, ShoppingBag, Users, Star, Radio } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import ShareButton from "../sharing/ShareButton";
import FollowButton from "./FollowButton";
import MessageSellerButton from "../messaging/MessageSellerButton";

/**
 * SellerCard - Pure presentational component for seller discovery
 * 
 * Props (legacy flat shape from seller_cards mapping):
 * - seller: { id, business_name, profile_image_url, background_image_url, 
 *             pickup_city, pickup_state, follower_count, rating_average, 
 *             rating_count, live_show_id, bio, total_sales, ... }
 * - onClick: function to call when card is clicked
 * - initialFollowStatus: optional boolean for FollowButton initial state
 * 
 * No data fetching. No hooks. No side effects.
 */
export default function SellerCard({ seller, onClick, initialFollowStatus }) {
  if (!seller) {
    return null;
  }

  // Use follower_count from props (provided by seller_cards)
  const followerCount = seller.follower_count || 0;
  const ratingAverage = seller.rating_average || 0;
  const ratingCount = seller.rating_count || 0;
  const isLive = !!seller.live_show_id;

  // Check visibility toggles (with sensible defaults)
  const showPickupAddress = seller.show_pickup_address !== false;
  const hasLocation = seller.pickup_city && seller.pickup_state;

  return (
    <Card
      className="group cursor-pointer border-0 overflow-hidden transition-all duration-300 focus-within:ring-2 focus-within:ring-purple-500 focus-within:ring-offset-2 aspect-[4/5] max-w-[180px] sm:max-w-none"
      style={{
        boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.2)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0px 8px 20px rgba(0, 0, 0, 0.3)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0px 6px 16px rgba(0, 0, 0, 0.2)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Banner - Clickable */}
      <div 
        className="relative h-20 overflow-hidden" 
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
        aria-label={`View ${seller.business_name || "Seller"}'s storefront`}
      >
        {seller.background_image_url ? (
          <img
            src={seller.background_image_url}
            alt={`${seller.business_name || "Seller"} banner`}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-500 to-blue-600"></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>

        {/* LIVE Badge */}
        {isLive && (
          <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
            <Radio className="w-3 h-3" />
            LIVE
          </div>
        )}

        {/* Share Button */}
        <div className="absolute top-1.5 right-1.5 z-10" onClick={(e) => e.stopPropagation()}>
          <ShareButton
            type="seller"
            id={seller.id}
            title={seller.business_name || "Seller"}
            description={seller.bio || `Shop from ${seller.business_name || "this seller"} on myneighbor.live`}
            imageUrl={seller.background_image_url || seller.profile_image_url}
            variant="ghost"
            size="icon"
            showLabel={false}
            className="bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white border-0 h-7 w-7"
          />
        </div>
      </div>

      {/* Content - Clickable area */}
      <CardContent className="p-3 bg-white -mt-8 relative z-10" onClick={onClick}>
        {/* Profile Image */}
        <Avatar className="w-14 h-14 border-3 border-white shadow-md mb-2">
          <AvatarImage 
            src={seller.profile_image_url} 
            alt={`${seller.business_name || "Seller"} avatar`} 
          />
          <AvatarFallback className="bg-gradient-to-br from-purple-600 to-blue-500 text-white text-lg font-bold">
            {seller.business_name?.[0]?.toUpperCase() || "S"}
          </AvatarFallback>
        </Avatar>

        {/* Seller Name */}
        <h3 className="font-bold text-base text-gray-900 line-clamp-1 group-hover:text-purple-600 transition-colors mb-1">
          {seller.business_name || "Seller"}
        </h3>

        {/* Location */}
        {showPickupAddress && hasLocation && (
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="line-clamp-1">{seller.pickup_city}, {seller.pickup_state}</span>
          </div>
        )}

        {/* Rating */}
        {ratingCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1.5">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="font-semibold">{ratingAverage.toFixed(1)}</span>
            <span className="text-gray-500">({ratingCount})</span>
          </div>
        )}

        {/* Bio */}
        {seller.bio && (
          <p className="text-xs text-gray-600 line-clamp-2 mb-2 leading-tight">
            {seller.bio.length > 50 ? seller.bio.substring(0, 50) + "…" : seller.bio}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs mb-2.5">
          <div className="flex items-center gap-1">
            <ShoppingBag className="w-3 h-3 text-purple-600" />
            <span className="font-semibold">{seller.total_sales || 0}</span>
            <span className="text-gray-600">sales</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3 text-blue-600" />
            <span className="font-semibold">{followerCount}</span>
            <span className="text-gray-600">followers</span>
          </div>
        </div>

        {/* Action Buttons - Non-clickable area for card navigation */}
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <FollowButton
            seller={seller}
            initialFollowStatus={initialFollowStatus}
            variant="default"
            size="sm"
            className="flex-1 h-8 text-xs bg-gradient-to-r from-purple-600 to-blue-600"
          />

          <MessageSellerButton
            seller={seller}
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}
