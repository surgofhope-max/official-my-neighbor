import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Pin, MessageCircle, X, Ban, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import ViewerBanDialog from "@/components/host/ViewerBanDialog";

/**
 * LiveChatOverlay Component
 * Transparent overlay chat for Live Show Buyer's View
 * UPDATED: Added ban enforcement
 */
export default function LiveChatOverlay({ showId, isSeller = false, onClose, inputOnly = false, sellerId = null }) {
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [isVisible, setIsVisible] = useState(true);
  const [fadeMessages, setFadeMessages] = useState(false);
  const [banningViewer, setBanningViewer] = useState(null);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();
  const fadeTimeoutRef = useRef(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        // Gracefully handle - user just can't chat
        setUser(null);
        return;
      }
      setUser(data?.user ?? null);
    } catch (error) {
      // Swallow errors - chat is non-critical
      setUser(null);
    }
  };

  // Check if viewer is banned from chatting - ONLY when user is actively chatting
  // DO NOT poll continuously - check once on mount and when sending messages
  const { data: viewerBan } = useQuery({
    queryKey: ['viewer-ban-check', sellerId, user?.id],
    queryFn: async () => {
      if (!sellerId || !user?.id) return null;
      const { data, error } = await supabase
        .from('viewer_bans')
        .select('id, ban_type, reason')
        .eq('seller_id', sellerId)
        .eq('viewer_id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[CHAT] Failed to check ban status:', error.message);
        return null;
      }
      return data;
    },
    enabled: !!sellerId && !!user && !isSeller,
    staleTime: 300000, // 5 minutes - ban status rarely changes
    refetchInterval: false, // DO NOT poll - prevents loop
    refetchOnWindowFocus: false
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['chat-messages', showId],
    queryFn: () => base44.entities.ChatMessage.filter({ show_id: showId }, 'created_date'),
    refetchInterval: 2000,
    enabled: !!showId && !inputOnly
  });

  const sendMessageMutation = useMutation({
    mutationFn: (messageData) => base44.entities.ChatMessage.create(messageData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', showId] });
      setMessage("");
      if (!inputOnly) resetFadeTimer();
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: ({ id, isPinned }) => base44.entities.ChatMessage.update(id, { is_pinned: isPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', showId] });
    },
  });

  const resetFadeTimer = () => {
    setFadeMessages(false);
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
    }
    fadeTimeoutRef.current = setTimeout(() => {
      setFadeMessages(true);
    }, 5000);
  };

  useEffect(() => {
    if (!inputOnly) {
      resetFadeTimer();
      return () => {
        if (fadeTimeoutRef.current) {
          clearTimeout(fadeTimeoutRef.current);
        }
      };
    }
  }, [messages.length, inputOnly]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!message.trim() || !user) return;

    // ENFORCEMENT: Check if user is banned from chatting
    if (viewerBan && (viewerBan.ban_type === 'chat' || viewerBan.ban_type === 'view' || viewerBan.ban_type === 'full')) {
      console.log("🚫 CHAT BLOCKED - User is banned:", viewerBan);
      alert(`⛔ You have been banned from chatting.\n\nBan Type: ${viewerBan.ban_type}\n${viewerBan.reason ? `Reason: ${viewerBan.reason}` : ''}`);
      return;
    }

    sendMessageMutation.mutate({
      show_id: showId,
      user_id: user.id,
      user_name: user.full_name || user.email.split('@')[0],
      user_avatar: user.profile_image_url || null,
      message: message.trim(),
      is_seller: isSeller
    });
  };

  const handlePin = (msg) => {
    if (!isSeller) return;
    pinMessageMutation.mutate({ id: msg.id, isPinned: !msg.is_pinned });
  };

  const handleBanViewer = (msg) => {
    console.log("🚫 Mute viewer clicked (overlay):", msg);
    setBanningViewer({
      user_id: msg.user_id,
      user_name: msg.user_name
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const pinnedMessages = messages.filter(m => m.is_pinned);
  const regularMessages = messages.filter(m => !m.is_pinned);
  const visibleMessages = regularMessages.slice(-5);

  const isChatBanned = viewerBan && (viewerBan.ban_type === 'chat' || viewerBan.ban_type === 'view' || viewerBan.ban_type === 'full');

  if (!isVisible) {
    return null;
  }

  // Input-only mode for bottom bar
  if (inputOnly) {
    console.log("[CHAT DEBUG OVERLAY] user:", user);
    console.log("[CHAT DEBUG OVERLAY] isSeller:", isSeller);
    console.log("[CHAT DEBUG OVERLAY] showId:", showId);
    return (
      <form onSubmit={handleSend} className="w-full">
        {user ? (
          isChatBanned ? (
            <div 
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl w-full"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.9)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.5)'
              }}
            >
              <Ban className="w-4 h-4 text-white" />
              <p className="text-xs text-white font-medium">You are banned from chatting</p>
            </div>
          ) : (
            <div 
              className="flex gap-2 px-3 py-2.5 rounded-xl items-center w-full"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.5)'
              }}
            >
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-transparent border-0 text-white placeholder:text-white/50 text-sm h-8 px-2 focus-visible:ring-0"
                maxLength={500}
              />
              <Button
                type="submit"
                size="sm"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 h-8 px-4 rounded-lg flex-shrink-0"
                disabled={!message.trim() || sendMessageMutation.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )
        ) : (
          <div 
            className="text-center py-2.5 px-4 rounded-xl w-full"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
          >
            <p className="text-xs text-white/60">Log in to join the chat</p>
          </div>
        )}
      </form>
    );
  }

  // UPDATED: Text-only chat overlay - NO BLUR BOX, NO TIMESTAMPS
  return (
    <>
      {/* Chat Messages - LEFT SIDE, MID-HEIGHT - TEXT ONLY */}
      <div 
        className="fixed left-3 z-[100] w-72 max-w-[85vw] animate-fade-in"
        style={{ 
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      >
        {/* Pinned Messages - With subtle background for visibility */}
        {pinnedMessages.length > 0 && (
          <div className="mb-2 space-y-1">
            {pinnedMessages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex items-start gap-1.5 px-2 py-1 rounded transition-opacity duration-500 opacity-100`}
                style={{
                  backgroundColor: 'rgba(250, 204, 21, 0.2)',
                }}
              >
                <Pin className="w-3 h-3 text-yellow-300 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-xs text-yellow-100 drop-shadow-lg">
                    {msg.user_name}:
                  </span>{" "}
                  <span className="text-xs text-yellow-50 drop-shadow-lg">
                    {msg.message}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Regular Messages - NO BACKGROUND BOX, NO TIMESTAMPS */}
        <div className="space-y-2">
          {visibleMessages.length === 0 && (
            <div 
              className={`text-center py-4 transition-opacity duration-500 opacity-100`}
            >
              <MessageCircle className="w-8 h-8 text-white/40 mx-auto mb-2 drop-shadow-lg" />
              <p className="text-xs text-white/60 drop-shadow-lg">No messages yet</p>
            </div>
          )}

          {visibleMessages.map((msg, index) => (
            <div 
              key={msg.id} 
              className={`flex items-start gap-2 group animate-slide-in transition-opacity duration-500 opacity-100`}
              style={{ 
                animationDelay: `${index * 0.05}s`,
                animationFillMode: 'backwards'
              }}
            >
              {/* Message Content - Enhanced text shadows for readability */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span 
                    className={`font-bold text-xs ${
                      msg.is_seller ? 'text-purple-200' : 'text-white'
                    }`}
                    style={{
                      textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)'
                    }}
                  >
                    {msg.user_name}:
                  </span>
                  {msg.is_seller && (
                    <Badge 
                      className="bg-purple-500/40 text-purple-100 border-purple-400/40 border text-[8px] px-1.5 py-0 leading-tight shadow-lg"
                    >
                      Host
                    </Badge>
                  )}
                </div>
                <p 
                  className="text-xs text-white leading-relaxed font-semibold"
                  style={{
                    textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)'
                  }}
                >
                  {msg.message}
                </p>
              </div>

              {/* Pin button (seller only) */}
              {isSeller && (
                <button
                  onClick={() => handlePin(msg)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-black/30 rounded shadow-lg"
                  title="Pin message"
                >
                  <Pin className="w-3 h-3 text-white/80" />
                </button>
              )}

              {/* Moderation menu (seller only, viewer messages only) */}
              {isSeller && !msg.is_seller && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-black/30 rounded shadow-lg"
                      title="More options"
                    >
                      <MoreVertical className="w-3 h-3 text-white/80" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => handleBanViewer(msg)}
                    >
                      Mute from chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>

      {/* Viewer Ban Dialog */}
      <ViewerBanDialog
        open={!!banningViewer}
        onOpenChange={() => setBanningViewer(null)}
        viewer={banningViewer}
        sellerId={sellerId}
        showId={showId}
      />
    </>
  );
}