import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Store, TrendingUp, MapPin, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import SellerCard from "../components/marketplace/SellerCard";

// ═══════════════════════════════════════════════════════════════════════════
// SELLER CARD FIELD MAPPING
// Maps seller_cards view fields to legacy component-expected field names
// ═══════════════════════════════════════════════════════════════════════════
const SELLER_CARD_LIGHT_FIELDS = `
  seller_id,
  user_id,
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
  total_products,
  total_items_sold,
  is_accepting_orders,
  live_show_id
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
    // Stats (pre-computed in view)
    follower_count: card.follower_count || 0,
    rating_average: card.rating_average || 0,
    rating_count: card.rating_count || 0,
    total_sales: card.total_items_sold || 0,
    total_products: card.total_products || 0,
    // Status
    stripe_connected: card.is_accepting_orders || false,
    live_show_id: card.live_show_id,
    // Legacy placeholders (not exposed in public view)
    show_contact_email: false,
    show_contact_phone: false,
    show_pickup_address: true,
    contact_email: null,
    contact_phone: null,
  };
}

export default function Sellers() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCity, setFilterCity] = useState("all");
  const [canonicalUserRole, setCanonicalUserRole] = useState(null);

  // Load canonical user role on mount
  useEffect(() => {
    const loadUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: canonicalUser } = await supabase
            .from("users")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          setCanonicalUserRole(canonicalUser?.role || null);
        }
      } catch {
        // Ignore errors - treat as non-seller
      }
    };
    loadUserRole();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL SELLER CHECK: Hide "Become a Seller" CTA for existing sellers
  // ═══════════════════════════════════════════════════════════════════════════
  const isAlreadySeller = canonicalUserRole === "seller" || canonicalUserRole === "admin";

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL QUERY: Fetch from seller_cards view (replaces base44.entities.Seller)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ['all-sellers-cards'],
    queryFn: async () => {
      console.log("[Sellers] Fetching seller_cards...");
      const { data, error } = await supabase
        .from('seller_cards')
        .select(SELLER_CARD_LIGHT_FIELDS)
        .order('follower_count', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error("[Sellers] seller_cards query error:", error.message);
        return [];
      }
      
      console.log(`[Sellers] Found ${data?.length || 0} sellers`);
      
      // Transform to legacy shape and sort: live sellers first, then by follower count
      const mapped = (data || []).map(mapSellerCardToLegacy);
      return mapped.sort((a, b) => {
        // Live sellers first
        if (a.live_show_id && !b.live_show_id) return -1;
        if (!a.live_show_id && b.live_show_id) return 1;
        // Then by follower count
        return (b.follower_count || 0) - (a.follower_count || 0);
      });
    },
  });

  // Get unique cities for filter (using mapped field name)
  const cities = [...new Set(sellers.map(s => s.pickup_city))].filter(Boolean).sort();

  const filteredSellers = sellers.filter(seller => {
    const matchesSearch = 
      seller.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      seller.bio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      seller.pickup_city?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCity = filterCity === "all" || seller.pickup_city === filterCity;
    
    return matchesSearch && matchesCity;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Hero Section - Compact */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-2">
              Browse Sellers
            </h1>
            <p className="text-sm sm:text-base text-white/90 mb-4 font-medium">
              Discover local sellers and their products in Phoenix, Arizona
            </p>

            {/* Search Bar - Compact */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search sellers by name, location, or description..."
                  className="pl-10 pr-4 py-2 text-sm sm:text-base bg-white border-0 shadow-2xl rounded-xl"
                />
              </div>
            </div>

            {/* Stats - Compact */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <Badge className="bg-white/20 text-white border-white/30 px-3 py-1 text-sm">
                <Store className="w-4 h-4 mr-2" />
                {sellers.length} Active Sellers
              </Badge>
              <Badge className="bg-white/20 text-white border-white/30 px-3 py-1 text-sm">
                <MapPin className="w-4 h-4 mr-2" />
                {cities.length} {cities.length === 1 ? 'City' : 'Cities'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <Card className="border-0 shadow-lg mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-2 text-gray-700">
                <Filter className="w-5 h-5" />
                <span className="font-semibold">Filter by City:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterCity("all")}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    filterCity === "all"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All Cities
                </button>
                {cities.map((city) => (
                  <button
                    key={city}
                    onClick={() => setFilterCity(city)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      filterCity === city
                        ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {filteredSellers.length === sellers.length ? 'All Sellers' : 'Search Results'}
            </h2>
            <p className="text-gray-600 mt-1">
              Showing {filteredSellers.length} of {sellers.length} sellers
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            <TrendingUp className="w-4 h-4 mr-2" />
            Sorted by Sales
          </Badge>
        </div>

        {/* Sellers Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Card key={i} className="animate-pulse border-0 shadow-lg">
                <div className="h-32 bg-gray-200"></div>
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSellers.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-16 text-center">
              <Store className="w-20 h-20 text-gray-400 mx-auto mb-4" />
              <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                No sellers found
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || filterCity !== "all"
                  ? "Try adjusting your search or filters"
                  : "No sellers are currently active"}
              </p>
              {(searchTerm || filterCity !== "all") && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setFilterCity("all");
                  }}
                  className="text-purple-600 hover:text-purple-700 font-semibold"
                >
                  Clear all filters
                </button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredSellers.map((seller) => (
              <SellerCard
                key={seller.id}
                seller={seller}
                onClick={() => navigate(createPageUrl("SellerStorefront") + `?sellerId=${seller.id}`)}
              />
            ))}
          </div>
        )}

        {/* Info Card - Hidden for sellers and admins */}
        {filteredSellers.length > 0 && !isAlreadySeller && (
          <Card className="mt-12 border-0 bg-gradient-to-r from-purple-50 to-blue-50">
            <CardContent className="p-8 text-center">
              <Store className="w-12 h-12 text-purple-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Want to become a seller?
              </h3>
              <p className="text-gray-600 mb-4">
                Join LiveMarket and start selling your products through live streams
              </p>
              <button
                onClick={() => navigate(createPageUrl("SellerSafetyAgreement"))}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
              >
                Apply to Sell
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}