import React, { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, Lock, ShoppingBag } from "lucide-react";
import LiveChatOverlay from "../chat/LiveChatOverlay";

export default function HostBottomControls({
  mode, // 'products' | 'message'
  showId,
  sellerId,
  products,
  featuredProductId,
  onFeatureProduct,
  onAddProduct,
  onSearch,
  searchTerm,
}) {
  const carouselRef = useRef(null);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] flex flex-col pointer-events-none">
      {/* Product Bubbles Row - ALWAYS VISIBLE - pointer-events-auto for interaction */}
      <div className="mb-2 px-3 pointer-events-auto">
        <div 
          ref={carouselRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {products.map((product) => {
            const isFeatured = product.id === featuredProductId;
            const isLocked = product.status === "locked" || product.status === "sold";
            
            return (
              <div 
                key={product.id}
                onClick={() => onFeatureProduct(product)}
                className={`flex-shrink-0 relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                  isFeatured 
                    ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)] scale-105 z-10' 
                    : 'border-white/20 bg-black/40 backdrop-blur-sm'
                }`}
                style={{ scrollSnapAlign: 'start' }}
              >
                {product.image_urls?.[0] ? (
                  <img src={product.image_urls[0]} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <ShoppingBag className="w-6 h-6 text-gray-500" />
                  </div>
                )}
                
                {/* Box Number */}
                {product.box_number && (
                  <div className="absolute top-0 left-0 bg-purple-600 text-white text-[8px] font-bold px-1 rounded-br-md">
                    {product.box_number}
                  </div>
                )}
                
                {/* Price */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] font-bold text-center py-0.5">
                  ${product.price?.toFixed(0)}
                </div>

                {/* Featured Badge */}
                {isFeatured && (
                  <div className="absolute top-0 right-0 bg-yellow-400 text-[8px] p-0.5 rounded-bl-md">
                    ⭐
                  </div>
                )}
                
                {/* Locked/Sold Overlay */}
                {isLocked && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-white/50" />
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Add Product Bubble (Shortcut) */}
          <button
            onClick={onAddProduct}
            className="flex-shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-green-500/50 bg-green-500/10 backdrop-blur-sm flex items-center justify-center text-green-500"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Toggle Area - pointer-events-auto */}
      <div className="bg-black/80 backdrop-blur-md border-t border-white/10 p-3 pb-6 pointer-events-auto">
        {mode === 'products' ? (
          /* MODE A: Product Tools */
          <div className="flex gap-2 animate-fade-in">
            <div className="relative flex-[2]"> {/* 2/3 width */}
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                value={searchTerm}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search products..." 
                className="pl-9 bg-gray-800/80 border-gray-700 text-white h-10 rounded-xl focus:ring-purple-500"
              />
            </div>
            <Button 
              onClick={onAddProduct}
              className="flex-[1] bg-green-600 hover:bg-green-700 text-white font-bold h-10 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        ) : (
          /* MODE B: Message Bar */
          <div className="animate-fade-in">
            <LiveChatOverlay 
              showId={showId} 
              isSeller={true}
              sellerId={sellerId}
              inputOnly={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}