import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Star, MapPin, Phone, Mail, Calendar } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import FollowButton from "../marketplace/FollowButton";
import MessageSellerButton from "../messaging/MessageSellerButton";
import BookmarkButton from "../marketplace/BookmarkButton";
import { format } from "date-fns";

export default function SellerProfileModal({ seller, user, onClose }) {
  const [showFullBio, setShowFullBio] = useState(false);



  // Fetch follower count
  const { data: followerCount = 0 } = useQuery({
    queryKey: ['seller-modal-followers', seller.id],
    queryFn: async () => {
      const follows = await base44.entities.FollowedSeller.filter({ seller_id: seller.id });
      return follows.length;
    },
    enabled: !!seller?.id
  });

  // Fetch following count
  const { data: followingCount = 0 } = useQuery({
    queryKey: ['seller-modal-following', seller.created_by],
    queryFn: async () => {
      const allBuyers = await base44.entities.BuyerProfile.list();
      const sellerBuyer = allBuyers.find(b => b.email === seller.created_by);
      if (!sellerBuyer) return 0;
      
      const follows = await base44.entities.FollowedSeller.filter({ buyer_id: sellerBuyer.user_id });
      return follows.length;
    },
    enabled: !!seller?.created_by
  });

  // Fetch reviews
  const { data: reviews = [] } = useQuery({
    queryKey: ['seller-modal-reviews', seller.id],
    queryFn: () => base44.entities.Review.filter({ seller_id: seller.id }, '-created_date'),
    enabled: !!seller?.id
  });

  // Fetch upcoming shows
  const { data: upcomingShows = [] } = useQuery({
    queryKey: ['seller-modal-upcoming-shows', seller.id],
    queryFn: async () => {
      const shows = await base44.entities.Show.filter({ seller_id: seller.id }, '-scheduled_start');
      return shows.filter(s => s.status === "scheduled");
    },
    enabled: !!seller?.id
  });

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.star_rating, 0) / reviews.length
    : 0;

  const bioPreview = seller.bio?.length > 120 ? seller.bio.substring(0, 120) + "..." : seller.bio;

  // Check visibility toggles
  const showContactEmail = seller.show_contact_email !== false && seller.contact_email;
  const showContactPhone = seller.show_contact_phone !== false && seller.contact_phone;
  const showPickupAddress = seller.show_pickup_address !== false;

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="fixed bottom-0 left-0 right-0 bg-gray-900 rounded-t-3xl shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-700 rounded-full"></div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>

        <div className="px-4 pb-6">
          {/* Seller Header */}
          <div className="flex items-start gap-4 mb-4">
            <Avatar className="w-20 h-20 border-4 border-gray-800">
              <AvatarImage src={seller.profile_image_url} />
              <AvatarFallback className="bg-gradient-to-r from-purple-600 to-blue-500 text-white text-2xl">
                {seller.business_name?.[0] || "S"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white mb-1 truncate">{seller.business_name}</h2>
              
              {/* Stats Rows */}
              <div className="space-y-2 mb-3">
                {/* Followers/Following Row */}
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="font-bold text-white">{followerCount.toLocaleString()}</span>
                    <span className="text-gray-400 ml-1">Followers</span>
                  </div>
                  <div>
                    <span className="font-bold text-white">{followingCount.toLocaleString()}</span>
                    <span className="text-gray-400 ml-1">Following</span>
                  </div>
                </div>

                {/* Ratings/Sold Row */}
                <div className="flex items-center gap-4 text-sm">
                  {reviews.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      <span className="font-bold text-white">{averageRating.toFixed(1)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-white">{seller?.total_sales ?? 0}</span>
                    <span className="text-gray-400 ml-1">Sold</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bio */}
          {seller.bio && (
            <div className="mb-4">
              <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                {showFullBio ? seller.bio : bioPreview}
              </p>
              {seller.bio.length > 120 && (
                <button
                  onClick={() => setShowFullBio(!showFullBio)}
                  className="text-purple-400 text-sm font-semibold mt-1 hover:text-purple-300"
                >
                  {showFullBio ? "Show Less" : "Show More"}
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <MessageSellerButton
              seller={seller}
              variant="outline"
              size="lg"
              className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700 h-12 rounded-full"
            />
            <FollowButton
              seller={seller}
              user={user}
              variant="default"
              size="lg"
              className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold h-12 rounded-full"
            />
          </div>

          {/* Upcoming Shows Section */}
          {upcomingShows.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-white" />
                <h3 className="text-lg font-bold text-white">Upcoming Shows</h3>
                <Badge className="bg-blue-600 text-white border-0">
                  {upcomingShows.length}
                </Badge>
              </div>
              
              <div className="space-y-2">
                {upcomingShows.slice(0, 3).map((show) => (
                  <Card key={show.id} className="bg-gray-800 border-gray-700">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {show.thumbnail_url ? (
                          <img
                            src={show.thumbnail_url}
                            alt={show.title}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gray-900 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-gray-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm line-clamp-1">{show.title}</p>
                          <p className="text-gray-400 text-xs">
                            {format(new Date(show.scheduled_start), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                        <BookmarkButton
                          show={show}
                          user={user}
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-yellow-400 h-8 w-8 flex-shrink-0"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {upcomingShows.length > 3 && (
                <p className="text-center text-gray-400 text-xs mt-3">
                  +{upcomingShows.length - 3} more upcoming shows
                </p>
              )}
            </div>
          )}

          {/* Contact Info */}
          {(showPickupAddress || showContactPhone || showContactEmail) && (
            <div className="mt-6 pt-6 border-t border-gray-800">
              <h3 className="text-lg font-bold text-white mb-3">Contact & Location</h3>
              <div className="space-y-2 text-sm">
                {showPickupAddress && (seller.pickup_city || seller.pickup_state) && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <MapPin className="w-4 h-4" />
                    <span>{seller.pickup_city}{seller.pickup_city && seller.pickup_state ? ', ' : ''}{seller.pickup_state}</span>
                  </div>
                )}
                {showContactPhone && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Phone className="w-4 h-4" />
                    <span>{seller.contact_phone}</span>
                  </div>
                )}
                {showContactEmail && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Mail className="w-4 h-4" />
                    <span>{seller.contact_email}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}