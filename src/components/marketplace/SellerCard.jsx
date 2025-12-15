import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, ShoppingBag, Users, Phone, Mail } from "lucide-react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import MessageSellerButton from "../messaging/MessageSellerButton";
import ShareButton from "../sharing/ShareButton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import FollowButton from "./FollowButton";

export default function SellerCard({ seller, onClick }) {
  if (!seller) {
    return null;
  }

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
    retry: false,
    staleTime: 300000
  });

  const { data: followerCount = 0 } = useQuery({
    queryKey: ['seller-follower-count-dedup', seller.id],
    queryFn: async () => {
      const followers = await base44.entities.FollowedSeller.filter({ seller_id: seller.id });
      const uniqueBuyerIds = new Set(followers.map(f => f.buyer_id));
      return uniqueBuyerIds.size;
    },
    enabled: !!seller.id,
    staleTime: 10000
  });

  // Check visibility toggles
  const showContactEmail = seller.show_contact_email !== false && seller.contact_email;
  const showContactPhone = seller.show_contact_phone !== false && seller.contact_phone;
  const showPickupAddress = seller.show_pickup_address !== false && seller.pickup_address;

  return (
    <Card
      className="group cursor-pointer border-0 overflow-hidden transition-all duration-300"
      style={{
        boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.2)',
        aspectRatio: '1 / 1.1'
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
      {/* Banner */}
      <div className="relative h-20 overflow-hidden" onClick={onClick}>
        {seller.background_image_url ? (
          <img
            src={seller.background_image_url}
            alt={`${seller.business_name || "Seller"} backdrop`}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-500 to-blue-600"></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>

        {/* Share Button */}
        <div className="absolute top-1.5 right-1.5 z-10" onClick={(e) => e.stopPropagation()}>
          <ShareButton
            type="seller"
            id={seller.id}
            title={seller.business_name || "Seller"}
            description={seller.bio || `Shop from ${seller.business_name || "this seller"} on AZ Live Market`}
            imageUrl={seller.background_image_url || seller.profile_image_url}
            variant="ghost"
            size="icon"
            showLabel={false}
            className="bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white border-0 h-7 w-7"
          />
        </div>
      </div>

      {/* Content */}
      <CardContent className="p-3 bg-white -mt-8 relative z-10" onClick={onClick}>
        {/* Profile Image */}
        <Avatar className="w-14 h-14 border-3 border-white shadow-md mb-2">
          <AvatarImage src={seller.profile_image_url} alt={seller.business_name || "Seller"} />
          <AvatarFallback className="bg-gradient-to-br from-purple-600 to-blue-500 text-white text-lg font-bold">
            {seller.business_name?.[0]?.toUpperCase() || "S"}
          </AvatarFallback>
        </Avatar>

        {/* Seller Name */}
        <h3 className="font-bold text-base text-gray-900 line-clamp-1 group-hover:text-purple-600 transition-colors mb-1">
          {seller.business_name || "Seller"}
        </h3>

        {/* Location - Only show if visibility toggle is ON */}
        {showPickupAddress && seller.pickup_city && seller.pickup_state && (
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1.5">
            <MapPin className="w-3 h-3" />
            <span className="line-clamp-1">{seller.pickup_city}, {seller.pickup_state}</span>
          </div>
        )}

        {/* Contact Info - Only show if visibility toggles are ON */}
        {(showContactEmail || showContactPhone) && (
          <div className="space-y-1 mb-2">
            {showContactPhone && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Phone className="w-3 h-3" />
                <span className="line-clamp-1">{seller.contact_phone}</span>
              </div>
            )}
            {showContactEmail && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Mail className="w-3 h-3" />
                <span className="line-clamp-1">{seller.contact_email}</span>
              </div>
            )}
          </div>
        )}

        {/* Bio */}
        {seller.bio && (
          <p className="text-xs text-gray-600 line-clamp-2 mb-2 leading-tight">
            {seller.bio}
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

        {/* Action Buttons */}
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <FollowButton
            seller={seller}
            user={user}
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