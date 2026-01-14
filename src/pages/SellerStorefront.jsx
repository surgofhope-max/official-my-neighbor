import React, { useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { SHOWS_PUBLIC_FIELDS } from "@/api/shows";
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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

// ═══════════════════════════════════════════════════════════════════════════
// SELLER CARD STOREFRONT FIELDS
// Extended field list for storefront header display
// ═══════════════════════════════════════════════════════════════════════════
const SELLER_CARD_STOREFRONT_FIELDS = `
  seller_id,
  user_id,
  display_name,
  avatar_url,
  buyer_avatar_url,
  banner_url,
  short_bio,
  city,
  state,
  member_since,
  follower_count,
  rating_average,
  rating_count,
  total_items_sold,
  is_accepting_orders,
  live_show_id,
  created_at
`.replace(/\s+/g, '');

/**
 * Transform seller_cards row to legacy seller shape expected by components
 */
function mapSellerCardToLegacy(card) {
  if (!card) return null;
  
  // Compute effective avatar: seller override > buyer fallback > null
  const effective_profile_image_url = card.avatar_url || card.buyer_avatar_url || null;
  
  return {
    // Core identity
    id: card.seller_id,
    user_id: card.user_id,
    // Display fields (mapped from seller_cards naming)
    business_name: card.display_name,
    profile_image_url: effective_profile_image_url,
    background_image_url: card.banner_url,
    bio: card.short_bio,
    pickup_city: card.city,
    pickup_state: card.state,
    member_since: card.member_since,
    created_at: card.created_at,
    // Stats (pre-computed in view)
    follower_count: card.follower_count || 0,
    rating_average: card.rating_average || 0,
    rating_count: card.rating_count || 0,
    total_sales: card.total_items_sold || 0,
    // Content refs
    live_show_id: card.live_show_id,
    // Status
    stripe_connected: card.is_accepting_orders || false,
    // Privacy: Contact info NOT exposed in public view (seller must opt-in separately)
    show_contact_email: false,
    show_contact_phone: false,
    show_pickup_address: true,
    contact_email: null,
    contact_phone: null,
  };
}

/**
 * Map Supabase show row to legacy UI shape expected by SellerStorefront
 * DB uses scheduled_start_time; UI expects scheduled_start
 */
function mapShowToLegacy(show) {
  if (!show) return null;
  return {
    ...show,
    // Map DB column to legacy UI field name
    scheduled_start: show.scheduled_start_time || null,
  };
}

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

  const [showFullBio, setShowFullBio] = useState(false);
  const [selectedShopShow, setSelectedShopShow] = useState(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL QUERY: Fetch from seller_cards view by seller_id
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: seller, isLoading: sellerLoading, error: sellerError } = useQuery({
    queryKey: ['seller-storefront-card', sellerId],
    queryFn: async () => {
      console.log("🔍 Fetching seller_card by seller_id:", sellerId);
      
      // Fetch seller_cards (stats) and sellers (full bio/address) in parallel
      const [cardResult, aboutResult] = await Promise.all([
        supabase
          .from('seller_cards')
          .select(SELLER_CARD_STOREFRONT_FIELDS)
          .eq('seller_id', sellerId)
          .maybeSingle(),
        supabase
          .from('sellers')
          .select('bio, pickup_address, pickup_zip')
          .eq('id', sellerId)
          .maybeSingle()
      ]);
      
      if (cardResult.error) {
        console.error("❌ seller_cards query error:", cardResult.error.message);
        throw new Error("Failed to load seller");
      }
      
      if (!cardResult.data) {
        console.error("❌ SellerCard result: not found for seller_id:", sellerId);
        throw new Error("Seller not found");
      }
      
      const legacySeller = mapSellerCardToLegacy(cardResult.data);
      
      // Merge full bio and pickup_address from sellers table
      if (aboutResult.data) {
        legacySeller.bio = aboutResult.data.bio || legacySeller.bio;
        legacySeller.pickup_address = aboutResult.data.pickup_address || null;
        legacySeller.pickup_zip = aboutResult.data.pickup_zip || null;
      }
      
      console.log("✅ SellerCard result: found -", legacySeller.business_name);
      return legacySeller;
    },
    enabled: !!sellerId,
    retry: 2,
    staleTime: 30000
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Products via show_products join table (canonical pattern)
  // Products are associated to shows via show_products, not products.show_id
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: shopProductsData = [] } = useQuery({
    queryKey: ['seller-storefront-shop-products', sellerId],
    queryFn: async () => {
      // 1) Fetch show_products for this seller with joined product data
      const { data: showProductsRaw, error: spError } = await supabase
        .from("show_products")
        .select(`
          id,
          show_id,
          product_id,
          seller_id,
          is_givi,
          product:products (
            id,
            title,
            description,
            price,
            original_price,
            quantity,
            quantity_sold,
            image_urls,
            category,
            status,
            givi_type
          )
        `)
        .eq("seller_id", sellerId);
      
      if (spError) {
        console.warn("[StorefrontShopProducts] show_products query error:", spError.message);
        return [];
      }
      
      // 2) Fetch show statuses to identify ended/cancelled shows
      const { data: allShowsForFilter, error: showsError } = await supabase
        .from("shows")
        .select("id, status");
      
      if (showsError) {
        console.warn("[StorefrontShopProducts] Shows filter query error:", showsError.message);
        // Fallback: return all if show filter fails
        return showProductsRaw || [];
      }
      
      // 3) Build Set of ended/cancelled show IDs
      const endedShowIds = new Set(
        (allShowsForFilter || [])
          .filter(show => show.status === "ended" || show.status === "cancelled")
          .map(show => show.id)
      );
      
      // 4) Filter out products from ended/cancelled shows
      // Also exclude hidden/deleted products
      const filtered = (showProductsRaw || []).filter(sp => 
        sp.product && 
        !endedShowIds.has(sp.show_id) &&
        sp.product.status !== 'hidden' &&
        sp.product.status !== 'deleted'
      );
      
      if (import.meta.env.DEV) {
        console.log('[StorefrontShopProducts]', {
          totalFetched: (showProductsRaw || []).length,
          afterFilter: filtered.length
        });
      }
      
      return filtered;
    },
    enabled: !!sellerId
  });

  // Derive products array from show_products for Shop tab rendering
  // Each entry has: show_id (from show_products) + flattened product fields
  const products = shopProductsData.map(sp => ({
    ...sp.product,
    show_id: sp.show_id, // Use show_id from show_products (canonical)
    is_givi: sp.is_givi
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Live shows for this seller (status = 'live')
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: liveShows = [] } = useQuery({
    queryKey: ['seller-storefront-live-shows', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_PUBLIC_FIELDS)
        .eq("seller_id", sellerId)
        .eq("status", "live")
        .order("scheduled_start_time", { ascending: false });
      
      if (error) {
        console.warn("[StorefrontShows] Live shows query error:", error.message);
        return [];
      }
      
      const mapped = (data || []).map(mapShowToLegacy);
      
      if (import.meta.env.DEV) {
        console.log("[StorefrontShows] live=", mapped.length);
      }
      
      return mapped;
    },
    enabled: !!sellerId,
    refetchInterval: 5000
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Upcoming shows for this seller (status = 'scheduled')
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: upcomingShows = [] } = useQuery({
    queryKey: ['seller-storefront-upcoming-shows', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_PUBLIC_FIELDS)
        .eq("seller_id", sellerId)
        .eq("status", "scheduled")
        .order("scheduled_start_time", { ascending: false });
      
      if (error) {
        console.warn("[StorefrontShows] Upcoming shows query error:", error.message);
        return [];
      }
      
      const mapped = (data || []).map(mapShowToLegacy);
      
      if (import.meta.env.DEV) {
        console.log("[StorefrontShows] upcoming=", mapped.length);
      }
      
      return mapped;
    },
    enabled: !!sellerId
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: All shows for Shop tab (excludes ended/cancelled client-side)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: allShows = [] } = useQuery({
    queryKey: ['seller-storefront-all-shows', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_PUBLIC_FIELDS)
        .eq("seller_id", sellerId)
        .order("scheduled_start_time", { ascending: false });
      
      if (error) {
        console.warn("[StorefrontShows] All shows query error:", error.message);
        return [];
      }
      
      // Client-side filter: exclude ended/cancelled (preserve existing behavior)
      const filtered = (data || []).filter(s => s.status !== "ended" && s.status !== "cancelled");
      const mapped = filtered.map(mapShowToLegacy);
      
      if (import.meta.env.DEV) {
        console.log("[StorefrontShows] all (after filter)=", mapped.length);
      }
      
      return mapped;
    },
    enabled: !!sellerId
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLLOWER COUNT: Use seller_cards.follower_count (already fetched above)
  // No separate query needed - seller.follower_count comes from seller_cards view
  // ═══════════════════════════════════════════════════════════════════════════
  const followerCount = seller?.follower_count || 0;

  // NOTE: followingCount removed - not public-facing data
  // NOTE: orders query removed - use seller.total_sales from seller_cards instead

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE: Reviews for this seller
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['seller-reviews-v3', sellerId],
    queryFn: async () => {
      if (!sellerId) return [];
      
      const { data, error } = await supabase
        .from("reviews")
        .select(`
          id,
          seller_id,
          buyer_id,
          buyer_name,
          star_rating,
          review_text,
          created_at
        `)
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.warn("[StorefrontReviews] Reviews query error:", error.message);
        return [];
      }
      
      // Map created_at → created_date for legacy UI compatibility
      const reviewData = (data || []).map(r => ({
        ...r,
        created_date: r.created_at
      }));
      
      const uniqueBuyers = new Set(reviewData.map(r => r.buyer_id).filter(Boolean)).size;
      
      if (import.meta.env.DEV) {
        console.log('[StorefrontReviews]', {
          totalReviews: reviewData.length,
          uniqueBuyers
        });
      }
      
      return reviewData;
    },
    enabled: !!sellerId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 10000
  });

  // Extract unique buyer_ids from reviews for targeted profile lookup
  const reviewBuyerIds = React.useMemo(() => {
    return Array.from(new Set((reviews || []).map(r => r.buyer_id).filter(Boolean)));
  }, [reviews]);

  // Fetch ONLY buyer profiles needed for this seller's reviews (targeted lookup)
  const { data: reviewBuyerProfiles = {} } = useQuery({
    queryKey: ['review-buyer-profiles', sellerId, reviewBuyerIds.join(',')],
    queryFn: async () => {
      if (!reviewBuyerIds.length) return {};
      
      console.log("👥 Fetching targeted buyer profiles for", reviewBuyerIds.length, "reviewers");
      
      // Fetch only the profiles we need by user_id
      const { data: profiles, error } = await supabase
        .from('buyer_profiles')
        .select('user_id, full_name, profile_image_url')
        .in('user_id', reviewBuyerIds);
      
      if (error) {
        console.error("Failed to fetch buyer profiles:", error.message);
        return {};
      }
      
      // Create lookup map
      const profileMap = {};
      (profiles || []).forEach(p => {
        profileMap[p.user_id] = p;
      });
      
      console.log("✅ Fetched", Object.keys(profileMap).length, "buyer profiles for reviews");
      return profileMap;
    },
    enabled: reviewBuyerIds.length > 0,
    staleTime: 60000 // Cache for 1 minute
  });

  // Enrich reviews with buyer profile data (targeted, not global)
  const enrichedReviews = React.useMemo(() => {
    if (!reviews.length) return reviews;
    
    return reviews.map((originalReview) => {
      const review = { ...originalReview };
      
      // If already has image stored on review, use it
      if (review.buyer_profile_image_url) {
        return review;
      }
      
      // Look up profile by buyer_id from targeted fetch
      const profile = reviewBuyerProfiles[review.buyer_id];
      
      if (profile) {
        review.buyer_profile_image_url = profile.profile_image_url || null;
      } else {
        review.buyer_profile_image_url = null;
      }
      
      return review;
    });
  }, [reviews, reviewBuyerProfiles]);

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
    p.status === "active" && p.quantity > 0
  );

  const bioPreview = seller.bio?.length > 50 ? seller.bio.substring(0, 50) + "…" : seller.bio;

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
            
            {/* Stats Row: Followers / Rating / Sold */}
            <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
              <div>
                <span className="font-bold text-white">{followerCount.toLocaleString()}</span>
                <span className="text-gray-400 ml-1">Followers</span>
              </div>
              {enrichedReviews.length > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="font-bold text-white">{averageRating.toFixed(1)}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-gray-400">•</span>
                <span className="font-bold text-white">{(seller?.total_sales ?? 0).toLocaleString()}</span>
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
              {seller.bio.length > 50 && (
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
                // Products are linked via show_products join table (canonical)
                <>
                  {products.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-400 mb-2">No products yet</h3>
                      <p className="text-gray-500 text-sm">
                        This seller hasn't added any products yet. Check back soon!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {allShows.filter(s => products.some(p => p.show_id === s.id)).map((show) => {
                        const showProducts = products.filter(p => p.show_id === show.id);
                        const availableCount = showProducts.filter(p => p.status === 'active').length;
                        
                        return (
                          <Card 
                            key={show.id}
                            className="bg-gray-800 border-gray-700 hover:shadow-xl transition-all cursor-pointer"
                            onClick={() => setSelectedShopShow(show)}
                          >
                            <div className="relative h-48 bg-gray-900 overflow-hidden">
                              {show.thumbnail_url ? (
                                <img 
                                  src={show.thumbnail_url}
                                  alt={show.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="w-12 h-12 text-gray-600" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            </div>
                            <CardContent className="p-4">
                              <h3 className="font-semibold text-white text-lg mb-2 line-clamp-2">{show.title}</h3>
                              <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-gray-400">Date:</span>
                                <span className="font-medium text-white">
                                  {format(new Date(show.scheduled_start), "MMM d, yyyy")}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700">
                                <div className="text-center">
                                  <p className="text-xs text-gray-400">Products</p>
                                  <p className="text-lg font-bold text-white">{showProducts.length}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-gray-400">Available</p>
                                  <p className="text-lg font-bold text-green-400">{availableCount}</p>
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
                                            {product.status === 'sold_out' && (
                                              <Badge className="bg-gray-600 text-white border-0">Sold</Badge>
                                            )}
                                            {product.givi_type && (
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
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {liveShows.map((show) => (
                    <Card
                      key={show.id}
                      className="bg-gray-800 border-gray-700 overflow-hidden cursor-pointer hover:shadow-xl transition-all"
                      onClick={() => navigate(createPageUrl("LiveShow") + `?showId=${show.id}`)}
                    >
                      <div className="relative h-48 bg-gray-900">
                        {show.thumbnail_url ? (
                          <img
                            src={show.thumbnail_url}
                            alt={show.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Radio className="w-12 h-12 text-gray-600" />
                          </div>
                        )}
                        {/* Live Badge */}
                        <div className="absolute top-2 left-2">
                          <Badge className="bg-red-500 text-white border-0 animate-pulse flex items-center gap-1">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                            Live • {show.viewer_count || 0}
                          </Badge>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-white text-lg mb-2 line-clamp-2">
                          {show.title}
                        </h3>
                        {show.description && (
                          <p className="text-gray-400 text-xs line-clamp-2">
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
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {upcomingShows.map((show) => (
                    <Card
                      key={show.id}
                      className="bg-gray-800 border-gray-700 overflow-hidden cursor-pointer hover:shadow-xl transition-all"
                    >
                      <div className="relative h-48 bg-gray-900">
                        {show.thumbnail_url ? (
                          <img
                            src={show.thumbnail_url}
                            alt={show.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Calendar className="w-12 h-12 text-gray-600" />
                          </div>
                        )}
                        {/* Time Badge */}
                        <div className="absolute top-2 left-2">
                          <Badge className="bg-gray-900/90 text-white border-0 text-xs">
                            {format(new Date(show.scheduled_start), "MMM d, h:mm a")}
                          </Badge>
                        </div>
                        {/* Bookmark Icon */}
                        <button className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70">
                          <Bookmark className="w-4 h-4 text-white" />
                        </button>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-white text-lg mb-2 line-clamp-2">
                          {show.title}
                        </h3>
                        {show.description && (
                          <p className="text-gray-400 text-xs line-clamp-2">
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
                          {seller.pickup_city}{seller.pickup_city && seller.pickup_state ? ', ' : ''}{seller.pickup_state}{seller.pickup_zip ? ` ${seller.pickup_zip}` : ''}
                        </p>
                      )}
                      {seller.pickup_address && (
                        <p className="text-gray-500 text-xs mt-1">
                          {seller.pickup_address}
                        </p>
                      )}
                    </div>
                  )}

                  {/* About / Bio - Full bio displayed here */}
                  {seller.bio && (
                    <div>
                      <h3 className="font-semibold text-white mb-2">About</h3>
                      <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">
                        {seller.bio}
                      </p>
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
                        <div className="text-xl font-bold text-white">{seller?.total_sales ?? 0}</div>
                        <div className="text-gray-400 text-xs">Sold</div>
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