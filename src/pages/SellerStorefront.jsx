import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapPin,
  Phone,
  Mail,
  Star,
  ShoppingBag,
  Video,
  Package,
  Radio,
  Calendar,
  Clock,
  Users,
  MessageCircle,
  Share2,
  ChevronDown,
  ChevronUp,
  Bookmark
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, differenceInSeconds } from "date-fns";
import FollowButton from "../components/marketplace/FollowButton";
import MessageSellerButton from "../components/messaging/MessageSellerButton";
import GiviTracker from "../components/sharing/GiviTracker";
import ShareButton from "../components/sharing/ShareButton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"; // Added import

// ISOLATED REVIEW AVATAR COMPONENT - NO STATE REUSE
function ReviewAvatar({ reviewId, buyerId, buyerName, imageUrl }) {
  const uniqueKey = `${reviewId}-${buyerId}-${imageUrl || 'none'}-${Date.now()}`;
  
  console.log("🖼️ Rendering ReviewAvatar:", {
    reviewId,
    buyerId,
    buyerName,
    imageUrl: imageUrl || "NONE",
    uniqueKey
  });
  
  return (
    <Avatar className="w-10 h-10" key={uniqueKey}>
      {imageUrl && imageUrl !== "null" && imageUrl !== "" ? (
        <AvatarImage 
          src={imageUrl}
          alt={buyerName || "Buyer"}
          onError={(e) => {
            console.error("❌ Image failed to load:", imageUrl);
            e.target.style.display = 'none';
          }}
          onLoad={() => {
            console.log("✅ Image loaded successfully:", imageUrl);
          }}
        />
      ) : null}
      <AvatarFallback className="bg-gradient-to-r from-purple-600 to-blue-500 text-white">
        {buyerName?.[0]?.toUpperCase() || "B"}
      </AvatarFallback>
    </Avatar>
  );
}

export default function SellerStorefront() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sellerId = urlParams.get('sellerId') || urlParams.get('sellerid');

  const [user, setUser] = useState(null);
  const [showFullBio, setShowFullBio] = useState(false);
  const [selectedShopShow, setSelectedShopShow] = useState(null);

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

  // FIXED: Better seller lookup with retry and error handling
  const { data: seller, isLoading: sellerLoading, error: sellerError } = useQuery({
    queryKey: ['seller-storefront', sellerId],
    queryFn: async () => {
      console.log("🔍 Fetching seller with ID:", sellerId);
      
      // Try to get all sellers first and filter locally
      const allSellers = await base44.entities.Seller.list();
      console.log("📋 All sellers:", allSellers.length);
      
      // Find seller by ID (case-insensitive match)
      const foundSeller = allSellers.find(s => s.id === sellerId);
      
      if (!foundSeller) {
        console.error("❌ Seller not found. Available IDs:", allSellers.map(s => s.id));
        throw new Error("Seller not found");
      }
      
      console.log("✅ Found seller:", foundSeller.business_name);
      return foundSeller;
    },
    enabled: !!sellerId,
    retry: 2,
    staleTime: 30000
  });

  const { data: products = [] } = useQuery({
    queryKey: ['seller-storefront-products', sellerId],
    queryFn: async () => {
      const allProducts = await base44.entities.Product.filter({
        seller_id: sellerId
      }, '-created_date');
      
      // Get all shows to check their status
      const allShowsForFilter = await base44.entities.Show.list();
      const endedShowIds = new Set(
        allShowsForFilter
          .filter(show => show.status === "ended" || show.status === "cancelled")
          .map(show => show.id)
      );
      
      // Filter out products from ended shows
      return allProducts.filter(p => !p.show_id || !endedShowIds.has(p.show_id));
    },
    enabled: !!sellerId
  });

  const { data: liveShows = [] } = useQuery({
    queryKey: ['seller-storefront-live-shows', sellerId],
    queryFn: async () => {
      const result = await base44.entities.Show.filter({
        seller_id: sellerId,
        status: "live"
      });
      return result;
    },
    enabled: !!sellerId,
    refetchInterval: 5000
  });

  const { data: upcomingShows = [] } = useQuery({
    queryKey: ['seller-storefront-upcoming-shows', sellerId],
    queryFn: async () => {
      const result = await base44.entities.Show.filter({
        seller_id: sellerId,
        status: "scheduled"
      }, '-scheduled_start');
      return result;
    },
    enabled: !!sellerId
  });

  const { data: allShows = [] } = useQuery({
    queryKey: ['seller-storefront-all-shows', sellerId],
    queryFn: async () => {
      const result = await base44.entities.Show.filter({
        seller_id: sellerId
      }, '-scheduled_start');
      // Filter out ended shows
      return result.filter(s => s.status !== "ended" && s.status !== "cancelled");
    },
    enabled: !!sellerId
  });

  // FIXED: Deduplicate followers to count only unique buyer_ids
  const { data: followerCount = 0 } = useQuery({
    queryKey: ['seller-followers-count', sellerId],
    queryFn: async () => {
      if (!sellerId) return 0;
      const follows = await base44.entities.FollowedSeller.filter({ seller_id: sellerId });
      // Deduplicate by buyer_id to get unique followers
      const uniqueBuyerIds = new Set(follows.map(f => f.buyer_id));
      return uniqueBuyerIds.size;
    },
    enabled: !!sellerId
  });

  // FIXED: Deduplicate following to count only unique seller_ids
  const { data: followingCount = 0 } = useQuery({
    queryKey: ['seller-following-count', seller?.created_by],
    queryFn: async () => {
      if (!seller?.created_by) return 0;
      
      // Get user ID from seller's created_by email
      const allUsers = await base44.entities.BuyerProfile.list();
      const sellerUser = allUsers.find(u => u.email === seller.created_by);
      
      if (!sellerUser) return 0;
      
      const follows = await base44.entities.FollowedSeller.filter({ buyer_id: sellerUser.user_id });
      // Deduplicate by seller_id to get unique following
      const uniqueSellerIds = new Set(follows.map(f => f.seller_id));
      return uniqueSellerIds.size;
    },
    enabled: !!seller?.created_by
  });

  // FIXED: Fetch actual orders count (matching Dashboard logic)
  const { data: orders = [] } = useQuery({
    queryKey: ['seller-storefront-orders', sellerId],
    queryFn: () => base44.entities.Order.filter({ seller_id: sellerId }),
    enabled: !!sellerId
  });

  // Fetch reviews for this seller - ULTRA AGGRESSIVE REFETCHING
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['seller-reviews-v3', sellerId],
    queryFn: async () => {
      if (!sellerId) return [];
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔍 FETCHING REVIEWS FOR SELLER:", sellerId);
      const reviewData = await base44.entities.Review.filter({ seller_id: sellerId }, '-created_date');
      console.log(`📝 FOUND ${reviewData.length} REVIEWS`);
      
      reviewData.forEach((r, idx) => {
        console.log(`   Review ${idx + 1}:`, r.buyer_name, `★${r.star_rating}`);
      });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return reviewData;
    },
    enabled: !!sellerId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 10000
  });

  // Fetch ALL buyer profiles - ALWAYS FETCH, NO CONDITIONAL
  const { data: allBuyerProfiles = [] } = useQuery({
    queryKey: ['all-buyer-profiles-v3'],
    queryFn: async () => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("👥 FETCHING ALL BUYER PROFILES");
      const profiles = await base44.entities.BuyerProfile.list();
      console.log(`✅ ${profiles.length} buyer profiles found`);
      
      // Create lookup map for faster matching
      const profileMap = {};
      profiles.forEach((p, idx) => {
        profileMap[p.user_id] = p;
        console.log(`Profile ${idx + 1}:`, {
          user_id: p.user_id,
          name: p.full_name,
          image: p.profile_image_url || "❌ NONE"
        });
      });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return profileMap;
    },
    enabled: !!sellerId,
    staleTime: 0,
    cacheTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });

  // REBUILD REVIEW-PROFILE BINDING FROM SCRATCH
  const enrichedReviews = React.useMemo(() => {
    if (!reviews.length || !Object.keys(allBuyerProfiles).length) return reviews;
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔗 BINDING REVIEWS TO PROFILES");
    
    const result = reviews.map((originalReview) => {
      // Create completely new object - NO mutation
      const review = JSON.parse(JSON.stringify(originalReview));
      
      console.log(`\n📝 Review: ${review.buyer_name}`);
      console.log(`   Review ID: ${review.id}`);
      console.log(`   Buyer ID: ${review.buyer_id}`);
      console.log(`   Stored Image: ${review.buyer_profile_image_url || "NONE"}`);
      
      // If already has image, use it
      if (review.buyer_profile_image_url) {
        console.log(`   ✅ Using existing stored image`);
        return review;
      }
      
      // Look up profile by buyer_id
      const profile = allBuyerProfiles[review.buyer_id];
      
      if (profile) {
        console.log(`   ✅ Profile found:`, {
          profile_user_id: profile.user_id,
          profile_name: profile.full_name,
          profile_image: profile.profile_image_url || "NONE"
        });
        
        review.buyer_profile_image_url = profile.profile_image_url || null;
      } else {
        console.log(`   ❌ NO PROFILE FOUND for buyer_id: ${review.buyer_id}`);
        review.buyer_profile_image_url = null;
      }
      
      console.log(`   📤 Final image URL: ${review.buyer_profile_image_url || "NONE"}`);
      return review;
    });
    
    console.log("\n✅ BINDING COMPLETE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return result;
  }, [reviews, allBuyerProfiles]);

  // Calculate average rating (use enrichedReviews)
  const averageRating = enrichedReviews.length > 0
    ? enrichedReviews.reduce((sum, r) => sum + r.star_rating, 0) / enrichedReviews.length
    : 0;

  if (!sellerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Card className="p-8 text-center max-w-md bg-gray-800 border-gray-700">
          <p className="text-red-500 font-semibold mb-2">No Seller ID Provided</p>
          <p className="text-gray-400 mb-4">Please provide a seller ID in the URL</p>
          <Button onClick={() => navigate(createPageUrl("Marketplace"))} className="bg-purple-600 hover:bg-purple-700">
            Back to Marketplace
          </Button>
        </Card>
      </div>
    );
  }

  if (sellerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading seller information...</p>
          <p className="text-gray-500 text-sm mt-2">Seller ID: {sellerId}</p>
        </div>
      </div>
    );
  }

  if (sellerError || !seller) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Card className="p-8 text-center max-w-md bg-gray-800 border-gray-700">
          <p className="text-red-500 font-semibold mb-2">Seller Not Found</p>
          <p className="text-gray-400 mb-2">The seller you're looking for doesn't exist</p>
          <p className="text-gray-500 text-xs mb-4">Seller ID: {sellerId}</p>
          {sellerError && (
            <p className="text-red-400 text-xs mb-4">Error: {sellerError.message}</p>
          )}
          <Button onClick={() => navigate(createPageUrl("Marketplace"))} className="bg-purple-600 hover:bg-purple-700">
            Back to Marketplace
          </Button>
        </Card>
      </div>
    );
  }

  // Check visibility toggles
  const showContactEmail = seller.show_contact_email !== false && seller.contact_email;
  const showContactPhone = seller.show_contact_phone !== false && seller.contact_phone;
  const showPickupAddress = seller.show_pickup_address !== false;

  const availableProducts = products.filter(p =>
    p.status === "available" && p.quantity > 0
  );

  const bioPreview = seller.bio?.length > 120 ? seller.bio.substring(0, 120) + "..." : seller.bio;

  return (
    <>
      <GiviTracker type="seller" id={sellerId} />

      <div className="min-h-screen bg-gray-900 text-white">
        {/* Hero Banner */}
        <div className="relative h-48 overflow-hidden">
          {seller.background_image_url ? (
            <img
              src={seller.background_image_url}
              alt={`${seller.business_name} backdrop`}
              className="absolute inset-0 w-full h-full object-cover opacity-80"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-900 via-blue-900 to-purple-900"></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900"></div>
          
          {/* Back and Share buttons */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
            <button
              onClick={() => navigate(createPageUrl("Marketplace"))}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <ChevronDown className="w-6 h-6 rotate-90" />
            </button>
            <ShareButton
              type="seller"
              id={sellerId}
              title={seller.business_name}
              description={seller.bio}
              imageUrl={seller.profile_image_url}
              variant="ghost"
              size="icon"
              showLabel={false}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 text-white border-0"
            />
          </div>
        </div>

        {/* Profile Section */}
        <div className="relative px-4 pb-6">
          {/* Profile Picture */}
          <div className="absolute -top-16 left-4">
            {seller.profile_image_url ? (
              <img
                src={seller.profile_image_url}
                alt={seller.business_name}
                className="w-24 h-24 rounded-full object-cover border-4 border-gray-900 shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center border-4 border-gray-900 shadow-xl">
                <span className="text-3xl font-bold text-white">
                  {seller.business_name?.[0] || "S"}
                </span>
              </div>
            )}
          </div>

          {/* Seller Info */}
          <div className="pt-10">
            <h1 className="text-2xl font-bold text-white mb-1">{seller.business_name}</h1>
            <p className="text-gray-400 text-sm mb-2">@{seller.business_name?.toLowerCase().replace(/\s+/g, '')}</p>
            
            {/* Stats Row: Followers / Following / Rating / Sold */}
            <div className="flex items-center gap-4 text-sm mb-3">
              <div>
                <span className="font-bold text-white">{followerCount.toLocaleString()}</span>
                <span className="text-gray-400 ml-1">Followers</span>
              </div>
              <div>
                <span className="font-bold text-white">{followingCount.toLocaleString()}</span>
                <span className="text-gray-400 ml-1">Following</span>
              </div>
              {enrichedReviews.length > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="font-bold text-white">{averageRating.toFixed(1)}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-gray-400">•</span>
                <span className="font-bold text-white">{orders.length}</span>
                <span className="text-gray-400">Sold</span>
              </div>
            </div>
          </div>

          {/* Bio Section */}
          {seller.bio && (
            <div className="mb-3">
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
          <div className="grid grid-cols-2 gap-3 mb-4">
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

          {/* Tabs */}
          <Tabs defaultValue="shows" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 bg-transparent border-b border-gray-800 rounded-none h-auto p-0">
              <TabsTrigger 
                value="shop" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white data-[state=active]:bg-transparent rounded-none bg-transparent text-gray-400 data-[state=active]:text-white pb-3 shadow-none"
              >
                Shop
              </TabsTrigger>
              <TabsTrigger 
                value="shows" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white data-[state=active]:bg-transparent rounded-none bg-transparent text-gray-400 data-[state=active]:text-white pb-3 shadow-none"
              >
                Shows
              </TabsTrigger>
              <TabsTrigger 
                value="reviews" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white data-[state=active]:bg-transparent rounded-none bg-transparent text-gray-400 data-[state=active]:text-white pb-3 shadow-none"
              >
                Reviews
              </TabsTrigger>
              <TabsTrigger 
                value="about" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white data-[state=active]:bg-transparent rounded-none bg-transparent text-gray-400 data-[state=active]:text-white pb-3 shadow-none"
              >
                About
              </TabsTrigger>
            </TabsList>

            {/* Shop Tab */}
            <TabsContent value="shop" className="space-y-4 mt-4">
              {!selectedShopShow ? (
                // LEVEL 1: Show Grid View
                <>
                  {allShows.filter(s => products.some(p => p.show_id === s.id)).length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-400 mb-2">No products yet</h3>
                      <p className="text-gray-500 text-sm">
                        This seller hasn't added any products yet. Check back soon!
                      </p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {allShows.filter(s => products.some(p => p.show_id === s.id)).map((show) => {
                        const showProducts = products.filter(p => p.show_id === show.id);
                        const availableCount = showProducts.filter(p => p.status === 'available').length;
                        
                        return (
                          <Card 
                            key={show.id}
                            className="bg-gray-800 border-gray-700 hover:shadow-xl transition-all cursor-pointer"
                            onClick={() => setSelectedShopShow(show)}
                          >
                            <div className="relative h-40 bg-gradient-to-br from-purple-600 to-blue-600 overflow-hidden">
                              {show.thumbnail_url ? (
                                <img 
                                  src={show.thumbnail_url}
                                  alt={show.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="w-12 h-12 text-white" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                              <div className="absolute bottom-3 left-3 right-3">
                                <h3 className="text-white font-bold text-lg line-clamp-2">{show.title}</h3>
                              </div>
                            </div>
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-400">Date:</span>
                                  <span className="font-medium text-white">
                                    {format(new Date(show.scheduled_start), "MMM d, yyyy")}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-700">
                                  <div className="text-center">
                                    <p className="text-xs text-gray-400">Products</p>
                                    <p className="text-lg font-bold text-white">{showProducts.length}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-gray-400">Available</p>
                                    <p className="text-lg font-bold text-green-400">{availableCount}</p>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                // LEVEL 2: Product Grid View
                <>
                  <button
                    onClick={() => setSelectedShopShow(null)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
                  >
                    <ChevronDown className="w-5 h-5 rotate-90" />
                    <span className="font-medium">Back to Shows</span>
                  </button>
                  
                  <h3 className="text-xl font-bold text-white mb-4">{selectedShopShow.title}</h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {products.filter(p => p.show_id === selectedShopShow.id).map((product) => (
                      <Card key={product.id} className="bg-gray-800 border-gray-700 hover:shadow-xl transition-all">
                        <div className="relative h-48 bg-gray-900">
                          {product.image_urls?.[0] ? (
                            <img
                              src={product.image_urls[0]}
                              alt={product.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-12 h-12 text-gray-600" />
                            </div>
                          )}
                          <div className="absolute top-2 right-2 flex gap-2">
                            {product.is_live_item && (
                              <Badge className="bg-purple-600 text-white border-0">Live</Badge>
                            )}
                            {product.status === 'sold' && (
                              <Badge className="bg-gray-600 text-white border-0">Sold</Badge>
                            )}
                            {product.is_givey && (
                              <Badge className="bg-pink-600 text-white border-0">GIVEY</Badge>
                            )}
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-white text-lg mb-2 line-clamp-2">{product.title}</h3>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-2xl font-bold text-purple-400">${product.price?.toFixed(2)}</p>
                            <p className="text-sm text-gray-400">Qty: {product.quantity}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Shows Tab */}
            <TabsContent value="shows" className="space-y-4 mt-4">
              {/* Live Shows */}
              {liveShows.length > 0 && (
                <div className="space-y-3">
                  {liveShows.map((show) => (
                    <Card
                      key={show.id}
                      className="bg-gray-800 border-gray-700 overflow-hidden cursor-pointer hover:bg-gray-750 transition-colors"
                      onClick={() => navigate(createPageUrl(`LiveShow?showId=${show.id}`))}
                    >
                      <div className="relative h-48">
                        {show.thumbnail_url ? (
                          <img
                            src={show.thumbnail_url}
                            alt={show.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-red-900 to-orange-900 flex items-center justify-center">
                            <Radio className="w-16 h-16 text-white opacity-50" />
                          </div>
                        )}
                        {/* Live Badge */}
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-red-500 text-white border-0 animate-pulse flex items-center gap-1">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                            Live • {show.viewer_count || 0}
                          </Badge>
                        </div>
                        {/* Seller info overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                          <div className="flex items-center gap-2">
                            {seller.profile_image_url ? (
                              <img
                                src={seller.profile_image_url}
                                alt={seller.business_name}
                                className="w-8 h-8 rounded-full object-cover border-2 border-white"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center border-2 border-white">
                                <span className="text-xs font-bold text-white">
                                  {seller.business_name?.[0]}
                                </span>
                              </div>
                            )}
                            <span className="text-white font-semibold text-sm">{seller.business_name}</span>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-3">
                        <h3 className="font-semibold text-white text-sm line-clamp-1">
                          {show.title}
                        </h3>
                        {show.description && (
                          <p className="text-gray-400 text-xs line-clamp-2 mt-1">
                            {show.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Upcoming Shows */}
              {upcomingShows.length > 0 && (
                <div className="space-y-3">
                  {upcomingShows.map((show) => (
                    <Card
                      key={show.id}
                      className="bg-gray-800 border-gray-700 overflow-hidden cursor-pointer hover:bg-gray-750 transition-colors"
                    >
                      <div className="relative h-48">
                        {show.thumbnail_url ? (
                          <img
                            src={show.thumbnail_url}
                            alt={show.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
                            <Calendar className="w-16 h-16 text-white opacity-50" />
                          </div>
                        )}
                        {/* Time Badge */}
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-gray-900/90 text-white border-0">
                            {format(new Date(show.scheduled_start), "MMM d")}
                            <br />
                            {format(new Date(show.scheduled_start), "h:mm a")}
                          </Badge>
                        </div>
                        {/* Bookmark Icon */}
                        <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70">
                          <Bookmark className="w-4 h-4 text-white" />
                        </button>
                        {/* Seller info overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                          <div className="flex items-center gap-2">
                            {seller.profile_image_url ? (
                              <img
                                src={seller.profile_image_url}
                                alt={seller.business_name}
                                className="w-8 h-8 rounded-full object-cover border-2 border-white"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center border-2 border-white">
                                <span className="text-xs font-bold text-white">
                                  {seller.business_name?.[0]}
                                </span>
                              </div>
                            )}
                            <span className="text-white font-semibold text-sm">{seller.business_name}</span>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-3">
                        <h3 className="font-semibold text-white text-sm line-clamp-1">
                          {show.title}
                        </h3>
                        {show.description && (
                          <p className="text-gray-400 text-xs line-clamp-2 mt-1">
                            {show.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* No Shows */}
              {liveShows.length === 0 && upcomingShows.length === 0 && (
                <div className="text-center py-12">
                  <Video className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-400 mb-2">
                    No shows scheduled
                  </h3>
                  <p className="text-gray-500 text-sm">
                    This seller doesn't have any live or upcoming shows yet. Check back soon!
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Reviews Tab - UPDATED */}
            <TabsContent value="reviews" className="space-y-4 mt-4">
              {enrichedReviews.length === 0 ? (
                <div className="text-center py-12">
                  <Star className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-400 mb-2">No reviews yet</h3>
                  <p className="text-gray-500 text-sm">
                    Be the first to leave a review!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Average Rating Header */}
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-6 text-center">
                      <div className="text-5xl font-bold text-white mb-2">{averageRating.toFixed(1)}</div>
                      <div className="flex items-center justify-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-6 h-6 ${
                              star <= Math.round(averageRating)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-600"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-gray-400 text-sm">Based on {enrichedReviews.length} {enrichedReviews.length === 1 ? 'review' : 'reviews'}</p>
                    </CardContent>
                  </Card>

                  {/* Reviews List */}
                  {enrichedReviews.map((review) => (
                    <Card 
                      key={`review-${review.id}-${review.buyer_id}`}
                      className="bg-gray-800 border-gray-700"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <ReviewAvatar 
                              reviewId={review.id}
                              buyerId={review.buyer_id}
                              buyerName={review.buyer_name}
                              imageUrl={review.buyer_profile_image_url}
                            />
                            <div>
                              <p className="font-semibold text-white text-sm">{review.buyer_name || "Verified Buyer"}</p>
                              <p className="text-xs text-gray-500">
                                {format(new Date(review.created_date), "MMM d, yyyy")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  star <= review.star_rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-600"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        {review.review_text && (
                          <p className="text-gray-300 text-sm leading-relaxed">{review.review_text}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* About Tab */}
            <TabsContent value="about" className="space-y-4 mt-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-4 space-y-4">
                  {/* Location - Only show if visibility toggle is ON and relevant data exists */}
                  {showPickupAddress && (seller.pickup_city || seller.pickup_state || seller.pickup_address) && (
                    <div>
                      <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Location
                      </h3>
                      {(seller.pickup_city || seller.pickup_state) && (
                        <p className="text-gray-400 text-sm">
                          {seller.pickup_city}{seller.pickup_city && seller.pickup_state ? ', ' : ''}{seller.pickup_state}
                        </p>
                      )}
                      {seller.pickup_address && (
                        <p className="text-gray-500 text-xs mt-1">
                          {seller.pickup_address}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Contact - Only show if visibility toggles are ON */}
                  {(showContactPhone || showContactEmail) && (
                    <div>
                      <h3 className="font-semibold text-white mb-2">Contact</h3>
                      <div className="space-y-2">
                        {showContactPhone && (
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Phone className="w-4 h-4" />
                            {seller.contact_phone}
                          </div>
                        )}
                        {showContactEmail && (
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Mail className="w-4 h-4" />
                            {seller.contact_email}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div>
                    <h3 className="font-semibold text-white mb-2">Stats</h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-gray-900 rounded-lg p-3">
                        <div className="text-xl font-bold text-white">{orders.length}</div>
                        <div className="text-gray-400 text-xs">Sales</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3">
                        <div className="text-xl font-bold text-white">{products.length}</div>
                        <div className="text-gray-400 text-xs">Products</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3">
                        <div className="text-xl font-bold text-white">{allShows.length}</div>
                        <div className="text-400 text-xs">Shows</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}