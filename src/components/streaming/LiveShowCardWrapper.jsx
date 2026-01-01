import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Radio,
  Users,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import WebRTCViewer from "./WebRTCViewer";
import LiveChatOverlay from "../chat/LiveChatOverlay";
import ShareButton from "../sharing/ShareButton";
import GIVIViewerOverlay from "../givi/GIVIViewerOverlay";
import { isShowLive } from "@/api/streamSync";

export default function LiveShowCardWrapper({ 
  show, 
  seller,
  onBack,
  onViewerCountChange,
  ProductCarousel,
  ExpandedProduct,
  BottomActionBar
}) {
  return (
    <div className="fixed inset-0 bg-black">
      {/* Video Stream */}
      <div className="absolute inset-0 z-0">
        <WebRTCViewer
          show={show}
          onViewerCountChange={onViewerCountChange}
        />
      </div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 rounded-full h-9 w-9"
            onClick={onBack}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 text-center px-2">
            <h1 className="text-white font-bold text-sm line-clamp-1 leading-tight">{show.title}</h1>
            <p className="text-purple-300 text-xs">{seller?.business_name || "Loading..."}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="bg-black/60 backdrop-blur-sm text-white border-white/30 text-xs px-2 py-0.5">
              <Users className="w-3 h-3 mr-1" />
              {show.viewer_count || 0}
            </Badge>
            {isShowLive(show) && (
              <Badge className="bg-red-500 text-white border-0 animate-pulse text-xs px-2 py-0.5">
                <Radio className="w-3 h-3 mr-1" />
                LIVE
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* GIVI Overlay */}
      {show && seller && (
        <GIVIViewerOverlay show={show} seller={seller} />
      )}

      {/* Chat Messages Overlay */}
      <LiveChatOverlay
        showId={show.id}
        sellerId={show.seller_id}
        isSeller={false}
      />

      {/* Product Carousel */}
      {ProductCarousel}

      {/* Expanded Product */}
      {ExpandedProduct}

      {/* Bottom Action Bar */}
      {BottomActionBar}
    </div>
  );
}