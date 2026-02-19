import React, { useRef } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  Store, 
  Home, 
  ShoppingCart, 
  Sparkles, 
  Truck, 
  Leaf, 
  Video, 
  Key,
  Users,
  Heart,
  Star,
  ShoppingBag,
  Gift,
  Coffee,
  Music,
  Book,
  MapPin,
  Wrench,
  Gem
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";

// Icon mapping for Lucide icons
const iconMap = {
  Package, Store, Home, ShoppingCart, Sparkles, Truck, Leaf, Video, Key,
  Users, Heart, Star, ShoppingBag, Gift, Coffee, Music, Book, MapPin, Wrench, Gem
};

// UI-only "All" option (never written to DB)
const ALL_COMMUNITIES_OPTION = {
  id: "all",
  name: "all",
  label: "Marketplace",
  icon_name: null,
  bg_image_url: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=400&h=300&fit=crop",
  color_gradient: "from-purple-500 to-blue-500"
};

export default function CommunityCarousel({ selectedCommunity, onSelectCommunity }) {
  const navigate = useNavigate();
  const categoryCarouselRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-E.1 PART B: Fetch communities from Supabase (replaces Base44)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: dbCommunities = [] } = useQuery({
    queryKey: ['communities-carousel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("id,name,label,icon_name,bg_image_url,color_gradient,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      
      if (error) {
        console.error("[CommunityCarousel] Supabase query error:", error.message);
        return [];
      }
      return data ?? [];
    }
  });

  // Prepend "All" option to DB communities
  const communities = [ALL_COMMUNITIES_OPTION, ...dbCommunities];

  const scrollCategoryCarousel = (direction) => {
    if (categoryCarouselRef.current) {
      const scrollAmount = 250;
      const newPosition = direction === 'left'
        ? categoryCarouselRef.current.scrollLeft - scrollAmount
        : categoryCarouselRef.current.scrollLeft + scrollAmount;

      categoryCarouselRef.current.scrollTo({
        left: newPosition,
        behavior: 'smooth'
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Community click: onSelectCommunity takes precedence; fallback to navigation
  // When onSelectCommunity exists (e.g. Marketplace inline view), never navigate
  // ═══════════════════════════════════════════════════════════════════════════
  const handleCommunityClick = (communityName) => {
    if (onSelectCommunity) {
      onSelectCommunity(communityName);
      return;
    }
    if (communityName === "all") return;
    navigate(createPageUrl("CommunityPage") + `?community=${communityName}`);
  };

  return (
    <div className="relative max-w-6xl mx-auto">
      {/* Desktop Arrow Navigation - Left */}
      <button
        onClick={() => scrollCategoryCarousel('left')}
        className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-10 h-10 items-center justify-center bg-white/30 backdrop-blur-sm rounded-full hover:bg-white/50 transition-all shadow-lg"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5 text-gray-900" />
      </button>

      {/* Carousel Container */}
      <div
        ref={categoryCarouselRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory py-3 pl-6"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {communities.map((community) => {
          const Icon = iconMap[community.icon_name] || Package;
          const isSelected = selectedCommunity === community.name;
          const displayLabel = community.label || community.name || "Unknown";
          
          const hasCustomPhoto = community.bg_image_url && community.bg_image_url.trim() !== "";
          
          const imageUrl = hasCustomPhoto 
            ? community.bg_image_url 
            : "https://images.unsplash.com/photo-1557683316-973673baf926?w=400&h=300&fit=crop";
          
          const gradient = community.color_gradient || "from-gray-400 to-gray-500";
          
          return (
            <button
              key={community.id}
              onClick={() => handleCommunityClick(community.name)}
              className={`
                flex-shrink-0 snap-start relative overflow-hidden
                w-20 h-20 sm:w-24 sm:h-24
                rounded-2xl shadow-2xl
                transition-all duration-300 group
                hover:scale-105
                ${isSelected ? "ring-4 ring-blue-500 scale-105" : ""}
              `}
            >
              {/* Background Image */}
              <div className="absolute inset-0">
                <img 
                  src={imageUrl} 
                  alt={displayLabel}
                  className="w-full h-full object-cover"
                />
                
                {!hasCustomPhoto && (
                  <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-70`}></div>
                )}
                
                <div className={`absolute inset-0 ${
                  isSelected 
                    ? 'bg-gradient-to-t from-blue-600/60 via-blue-500/30 to-transparent' 
                    : 'bg-gradient-to-t from-black/40 via-transparent to-transparent'
                }`}></div>
              </div>

              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-between p-2">
                {community.icon_name && Icon && (
                  <div className={`
                    w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-white/20 backdrop-blur-sm
                    flex items-center justify-center transition-all
                    ${isSelected ? "scale-110 bg-white/30" : "group-hover:scale-110"}
                  `}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                )}

                <div className="text-center mt-auto">
                  <p className="font-bold text-white leading-tight text-[9px] sm:text-[11px] drop-shadow-lg">
                    {displayLabel}
                  </p>
                </div>
              </div>

              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5">
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                    <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop Arrow Navigation - Right */}
      <button
        onClick={() => scrollCategoryCarousel('right')}
        className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-10 h-10 items-center justify-center bg-white/30 backdrop-blur-sm rounded-full hover:bg-white/50 transition-all shadow-lg"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5 text-gray-900" />
      </button>

      {/* Hide Scrollbar CSS */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}