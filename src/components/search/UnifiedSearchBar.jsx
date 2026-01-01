import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Home, Store, Video, Package, Loader2, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function UnifiedSearchBar({ placeholder = "Search shows, sellers, products...", className = "" }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState({
    communities: [],
    sellers: [],
    shows: [],
    products: []
  });
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef(null);
  const debounceTimer = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search function
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setResults({ communities: [], sellers: [], shows: [], products: [] });
      setShowResults(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new timer for debounced search
    debounceTimer.current = setTimeout(() => {
      performSearch(searchTerm);
    }, 300); // 300ms delay

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchTerm]);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E.1: Search using Supabase (replaces Base44)
  // ═══════════════════════════════════════════════════════════════════════════
  const performSearch = async (query) => {
    const lowerQuery = query.toLowerCase();

    try {
      // Fetch all data in parallel from Supabase
      const [communitiesRes, sellersRes, showsRes, productsRes] = await Promise.all([
        supabase.from("communities").select("id, name, label, icon_name").eq("is_active", true),
        supabase.from("sellers").select("id, user_id, business_name, profile_image_url, status").eq("status", "approved"),
        supabase.from("shows").select("id, title, description, status, seller_id").in("status", ["scheduled", "live"]),
        supabase.from("products").select("id, name, price, status, seller_id, show_id, image_urls")
      ]);

      const communities = communitiesRes.data ?? [];
      const sellers = sellersRes.data ?? [];
      const allShows = showsRes.data ?? [];
      const products = productsRes.data ?? [];

      // Create a Set of ended show IDs for quick lookup
      const endedShowIds = new Set(
        allShows
          .filter(show => show.status === "ended" || show.status === "cancelled" || show.status === "completed")
          .map(show => show.id)
      );

      // Filter results based on search query
      const filteredCommunities = communities.filter(c =>
        c.label?.toLowerCase().includes(lowerQuery) ||
        c.name?.toLowerCase().includes(lowerQuery)
      ).slice(0, 5);

      const filteredSellers = sellers.filter(s =>
        s.business_name?.toLowerCase().includes(lowerQuery)
      ).slice(0, 5);

      const filteredShows = allShows.filter(s =>
        (s.title?.toLowerCase().includes(lowerQuery) ||
        s.description?.toLowerCase().includes(lowerQuery)) &&
        s.status !== "ended" && s.status !== "cancelled"
      ).slice(0, 5);

      const filteredProducts = products.filter(p => {
        // Exclude products from ended shows
        if (p.show_id && endedShowIds.has(p.show_id)) {
          return false;
        }
        // Search filter
        return p.title?.toLowerCase().includes(lowerQuery) ||
               p.description?.toLowerCase().includes(lowerQuery);
      }).slice(0, 5);

      setResults({
        communities: filteredCommunities,
        sellers: filteredSellers,
        shows: filteredShows,
        products: filteredProducts
      });

      setShowResults(true);
      setIsSearching(false);
    } catch (error) {
      console.error("Search error:", error);
      setIsSearching(false);
    }
  };

  // Calculate total results for keyboard navigation
  const allResults = [
    ...results.communities.map(c => ({ type: 'community', data: c })),
    ...results.sellers.map(s => ({ type: 'seller', data: s })),
    ...results.shows.map(s => ({ type: 'show', data: s })),
    ...results.products.map(p => ({ type: 'product', data: p }))
  ];

  const handleKeyDown = (e) => {
    if (!showResults || allResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < allResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : allResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < allResults.length) {
          handleResultClick(allResults[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowResults(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleResultClick = (result) => {
    const { type, data } = result;

    switch (type) {
      case 'community':
        // STEP C6-E.2: Always navigate to canonical CommunityPage
        navigate(createPageUrl(`CommunityPage?community=${data.name}`));
        break;
      case 'seller':
        navigate(createPageUrl("SellerStorefront") + `?sellerId=${data.id}`);
        break;
      case 'show':
        if (data.status === "live") {
          navigate(createPageUrl("LiveShow") + `?showId=${data.id}`);
        } else {
          navigate(createPageUrl("LiveShows"));
        }
        break;
      case 'product':
        // Navigate to seller storefront if product has seller_id
        if (data.seller_id) {
          navigate(createPageUrl("SellerStorefront") + `?sellerId=${data.seller_id}`);
        }
        break;
    }

    // Clear search and close dropdown
    setSearchTerm("");
    setShowResults(false);
    setSelectedIndex(-1);
  };

  const getTotalResults = () => {
    return results.communities.length + 
           results.sellers.length + 
           results.shows.length + 
           results.products.length;
  };

  const getCategoryIcon = (type) => {
    switch (type) {
      case 'community': return Home;
      case 'seller': return Store;
      case 'show': return Video;
      case 'product': return Package;
      default: return Search;
    }
  };

  const getCategoryLabel = (type) => {
    switch (type) {
      case 'community': return 'Communities';
      case 'seller': return 'Sellers';
      case 'show': return 'Shows';
      case 'product': return 'Products';
      default: return '';
    }
  };

  const ResultItem = ({ result, index, isSelected }) => {
    const { type, data } = result;
    const Icon = getCategoryIcon(type);

    const getDisplayName = () => {
      switch (type) {
        case 'community': return data.label || data.name;
        case 'seller': return data.business_name;
        case 'show': return data.title;
        case 'product': return data.title;
        default: return '';
      }
    };

    const getSecondaryInfo = () => {
      switch (type) {
        case 'seller': return `${data.pickup_city || ''}, ${data.pickup_state || ''}`;
        case 'show': 
          if (data.status === "live") return "🔴 LIVE NOW";
          if (data.status === "scheduled") return "📅 Upcoming";
          return "Ended";
        case 'product': return `$${data.price?.toFixed(2)}`;
        default: return '';
      }
    };

    return (
      <div
        onClick={() => handleResultClick(result)}
        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
          isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'
        }`}
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isSelected ? 'bg-purple-100' : 'bg-gray-100'
        }`}>
          <Icon className={`w-5 h-5 ${isSelected ? 'text-purple-600' : 'text-gray-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-gray-900 ${(type === 'community' || type === 'product') ? '' : 'truncate'}`}>
            {getDisplayName()}
          </p>
          {getSecondaryInfo() && (
            <p className="text-sm text-gray-500 truncate">{getSecondaryInfo()}</p>
          )}
        </div>
        {(type !== 'community' && type !== 'product') && (
          <Badge variant="outline" className="text-xs">
            {getCategoryLabel(type)}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div 
        className="relative"
        style={{
          boxShadow: '0px 3px 14px rgba(0, 0, 0, 0.15)',
          borderRadius: '9999px'
        }}
      >
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-black" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (searchTerm.trim().length >= 2 && getTotalResults() > 0) {
              setShowResults(true);
            }
          }}
          placeholder={placeholder}
          className="pl-10 pr-10 bg-white rounded-full border-0 text-black placeholder:text-black"
          style={{
            backgroundColor: '#FFFFFF'
          }}
        />
        {isSearching && (
          <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-black animate-spin" />
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && getTotalResults() > 0 && (
        <Card className="absolute top-full mt-2 left-0 right-0 z-50 shadow-2xl border-0 max-h-[70vh] overflow-y-auto">
          {/* Communities */}
          {results.communities.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-semibold text-gray-900">Communities</span>
                  <Badge variant="secondary" className="text-xs">
                    {results.communities.length}
                  </Badge>
                </div>
              </div>
              {results.communities.map((community, idx) => (
                <ResultItem
                  key={`community-${community.id}`}
                  result={{ type: 'community', data: community }}
                  index={allResults.findIndex(r => r.type === 'community' && r.data.id === community.id)}
                  isSelected={selectedIndex === allResults.findIndex(r => r.type === 'community' && r.data.id === community.id)}
                />
              ))}
            </div>
          )}

          {/* Sellers */}
          {results.sellers.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-semibold text-gray-900">Sellers</span>
                  <Badge variant="secondary" className="text-xs">
                    {results.sellers.length}
                  </Badge>
                </div>
              </div>
              {results.sellers.map((seller, idx) => (
                <ResultItem
                  key={`seller-${seller.id}`}
                  result={{ type: 'seller', data: seller }}
                  index={allResults.findIndex(r => r.type === 'seller' && r.data.id === seller.id)}
                  isSelected={selectedIndex === allResults.findIndex(r => r.type === 'seller' && r.data.id === seller.id)}
                />
              ))}
            </div>
          )}

          {/* Shows */}
          {results.shows.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-semibold text-gray-900">Shows</span>
                  <Badge variant="secondary" className="text-xs">
                    {results.shows.length}
                  </Badge>
                </div>
              </div>
              {results.shows.map((show, idx) => (
                <ResultItem
                  key={`show-${show.id}`}
                  result={{ type: 'show', data: show }}
                  index={allResults.findIndex(r => r.type === 'show' && r.data.id === show.id)}
                  isSelected={selectedIndex === allResults.findIndex(r => r.type === 'show' && r.data.id === show.id)}
                />
              ))}
            </div>
          )}

          {/* Products */}
          {results.products.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-semibold text-gray-900">Products</span>
                  <Badge variant="secondary" className="text-xs">
                    {results.products.length}
                  </Badge>
                </div>
              </div>
              {results.products.map((product, idx) => (
                <ResultItem
                  key={`product-${product.id}`}
                  result={{ type: 'product', data: product }}
                  index={allResults.findIndex(r => r.type === 'product' && r.data.id === product.id)}
                  isSelected={selectedIndex === allResults.findIndex(r => r.type === 'product' && r.data.id === product.id)}
                />
              ))}
            </div>
          )}

          {/* Footer with keyboard shortcuts */}
          <div className="px-4 py-3 bg-gray-50 border-t">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>ESC Close</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span>{getTotalResults()} results</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* No Results */}
      {showResults && searchTerm.trim().length >= 2 && getTotalResults() === 0 && !isSearching && (
        <Card className="absolute top-full mt-2 left-0 right-0 z-50 shadow-2xl border-0">
          <div className="p-8 text-center">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium mb-1">No results found</p>
            <p className="text-sm text-gray-500">
              Try searching for sellers, shows, products, or communities
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}