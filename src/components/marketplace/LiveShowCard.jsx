import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, Users, Calendar, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase/supabaseClient";
import BookmarkButton from "./BookmarkButton";
import { isShowLive } from "@/api/streamSync";

export default function LiveShowCard({ show, seller, onClick, isUpcoming = false }) {
  const [user, setUser] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef(null);
  
  // Detect mobile (robust: hover, pointer, or touch points)
  const isMobile =
    typeof window !== "undefined" &&
    (
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(pointer: coarse)").matches ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
    );

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setUser(null);
        return;
      }
      setUser(data?.user ?? null);
    } catch (error) {
      setUser(null);
    }
  };

  // Derive badge state using authoritative isShowLive (stream_status === "live")
  const getBadgeInfo = () => {
    // AUTHORITATIVE: stream_status === "live" is the only rule for live
    if (isShowLive(show)) {
      return {
        type: 'liveActive',
        label: 'LIVE',
        sublabel: 'Now streaming',
        bgColor: 'bg-red-500',
        icon: Radio,
        animate: true
      };
    }
    
    // Show has status "live" but stream not yet active (waiting state)
    if (show.status === 'live') {
      return {
        type: 'liveWaiting',
        label: 'LIVE',
        sublabel: 'Starting soon',
        bgColor: 'bg-orange-500',
        icon: Radio,
        animate: true
      };
    }
    
    // Scheduled or upcoming
    if (show.status === 'scheduled' || isUpcoming) {
      return {
        type: 'upcoming',
        label: 'Upcoming',
        sublabel: null,
        bgColor: 'bg-blue-500',
        icon: Calendar,
        animate: false
      };
    }
    
    // Fallback
    return {
      type: 'upcoming',
      label: 'Upcoming',
      sublabel: null,
      bgColor: 'bg-blue-500',
      icon: Calendar,
      animate: false
    };
  };

  const badgeInfo = getBadgeInfo();
  const BadgeIcon = badgeInfo.icon;

  // Handle video hover play/pause (desktop only - mobile uses autoPlay)
  useEffect(() => {
    if (isMobile) return; // Skip for mobile - autoPlay handles it
    if (videoRef.current && show.preview_video_url) {
      if (isHovered) {
        videoRef.current.play().catch(err => {
          console.log("Video autoplay prevented:", err);
        });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isHovered, show.preview_video_url, isMobile]);

  const getTimeUntilStart = () => {
    const scheduledAt = show.scheduled_start_time || show.started_at;
    if (!scheduledAt) return null;
    const startDate = new Date(scheduledAt);
    const now = new Date();
    
    if (startDate <= now) return "Starting soon";
    
    return `Starts ${formatDistanceToNow(startDate, { addSuffix: true })}`;
  };

  return (
    <Card
      className="group cursor-pointer border-0 overflow-hidden transition-all duration-300"
      style={{
        boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.2)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0px 8px 20px rgba(0, 0, 0, 0.3)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        setIsHovered(true);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0px 6px 16px rgba(0, 0, 0, 0.2)';
        e.currentTarget.style.transform = 'translateY(0)';
        setIsHovered(false);
      }}
      onClick={onClick}
    >
      {/* Thumbnail/Video Container */}
      <div className="relative h-56 bg-gradient-to-br from-purple-500 to-blue-600 overflow-hidden">
        {show.preview_video_url ? (
          <>
            {/* Thumbnail shown on desktop when not hovered, hidden on mobile */}
            {show.thumbnail_url && !isMobile && (
              <img
                src={show.thumbnail_url}
                alt={show.title}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  isHovered ? 'opacity-0' : 'opacity-100'
                }`}
              />
            )}
            
            {/* Video: autoPlay+loop on mobile, hover-controlled on desktop */}
            <video
              ref={videoRef}
              src={show.preview_video_url}
              className={`absolute inset-0 w-full h-full object-cover ${
                isMobile ? 'opacity-100' : isHovered ? 'opacity-100 transition-opacity duration-300' : 'opacity-0 transition-opacity duration-300'
              }`}
              muted
              loop
              playsInline
              preload="metadata"
              autoPlay={isMobile}
            />
          </>
        ) : show.thumbnail_url ? (
          <img
            src={show.thumbnail_url}
            alt={show.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Radio className="w-16 h-16 text-white" />
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>
        
        {/* Status Badge - respects show.status and show.stream_status */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
          <Badge className={`${badgeInfo.bgColor} text-white border-0 px-3 py-1 ${badgeInfo.animate ? 'animate-pulse' : ''}`}>
            <BadgeIcon className="w-3 h-3 mr-1" />
            {badgeInfo.label}
          </Badge>
          {badgeInfo.sublabel && (
            <span className="text-xs text-white bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">
              {badgeInfo.sublabel}
            </span>
          )}
        </div>

        {/* Top Right Actions - Bookmark Only */}
        <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
          <BookmarkButton 
            show={show} 
            user={user}
            className="bg-black/40 backdrop-blur-sm hover:bg-black/60"
          />
        </div>
        
        {/* Viewer Count / Time */}
        <div className="absolute bottom-3 left-3 right-3 z-10">
          <div className="flex items-center justify-between text-white">
            {badgeInfo.type === 'upcoming' ? (
              <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-1 rounded">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">{getTimeUntilStart()}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-1 rounded">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">{show.viewer_count || 0} watching</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <CardContent className="p-2 sm:p-3 bg-white">
        <h3 className="font-bold text-base sm:text-lg text-gray-900 mb-0.5 line-clamp-1 leading-tight group-hover:text-purple-600 transition-colors">
          {show.title}
        </h3>
        
        {/* FIXED: Added null check for seller */}
        {seller && seller.business_name && (
          <p className="text-xs sm:text-sm text-purple-600 font-medium mb-1 leading-tight">
            {seller.business_name}
          </p>
        )}
        
        <p className="text-xs text-gray-600 line-clamp-2 mb-2 leading-snug">
          {show.description || "Join this live show for amazing deals!"}
        </p>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          {badgeInfo.type === 'upcoming' ? (
            <span className="leading-none">
              {(show.scheduled_start_time || show.started_at)
                ? format(new Date(show.scheduled_start_time || show.started_at), "MMM d 'at' h:mm a")
                : "Not scheduled"}
            </span>
          ) : (
            <span className="leading-none">{show.total_sales || 0} sales</span>
          )}
          <span className="text-purple-600 font-medium leading-none">
            {badgeInfo.type === 'upcoming' ? "Set Reminder" : "Watch Now"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}