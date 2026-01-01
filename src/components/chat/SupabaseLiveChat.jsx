/**
 * SupabaseLiveChat Component
 *
 * Ephemeral live chat for live shows using Supabase.
 * Messages are scoped to a show and only accessible while the show is live.
 *
 * Features:
 * - Polling-based updates (2-3 seconds)
 * - Disabled when show is not live
 * - No persistence after show ends (RLS enforced)
 * - Separate from persistent messaging system
 *
 * This replaces the Base44-based LiveChatOverlay for Supabase migration.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import {
  getLiveShowMessages,
  sendLiveShowMessage,
  isLiveChatAvailable,
} from "@/api/liveChat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, X, Radio, User, Ban } from "lucide-react";
import { format } from "date-fns";
import { checkAccountActiveAsync } from "@/lib/auth/accountGuards";

/**
 * SupabaseLiveChat Component
 *
 * @param {Object} props
 * @param {string} props.showId - The show ID
 * @param {string} props.sellerId - The seller ID (for seller detection)
 * @param {boolean} props.isSeller - Whether the current user is the seller
 * @param {Function} props.onClose - Callback to close the chat panel
 * @param {boolean} props.isOverlay - Whether to render as transparent overlay
 * @param {Function} props.onMessageSeller - Callback for "Message Seller" CTA when show ends
 */
export default function SupabaseLiveChat({
  showId,
  sellerId,
  isSeller = false,
  onClose,
  isOverlay = true,
  onMessageSeller,
}) {
  // User state
  const [user, setUser] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  // Show state
  const [isChatAvailable, setIsChatAvailable] = useState(true);
  const [showEnded, setShowEnded] = useState(false);

  // UI state
  const [isMinimized, setIsMinimized] = useState(false);
  const [fadeMessages, setFadeMessages] = useState(false);

  // Buyer profile names cache (keyed by sender_id)
  const [buyerNames, setBuyerNames] = useState({});

  // Refs
  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const mountedRef = useRef(true);

  // Poll interval (ms)
  const POLL_INTERVAL = 2500;

  // ─────────────────────────────────────────────────────────────────────
  // LOAD USER
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadUser();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !mountedRef.current) {
        // Gracefully handle - user just can't chat
        return;
      }
      setUser(data?.user ?? null);
    } catch (error) {
      // Swallow errors - chat is non-critical
      console.log("[CHAT] User not logged in - view only mode");
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // FETCH BUYER NAMES FOR VIEWER MESSAGES
  // ─────────────────────────────────────────────────────────────────────
  const fetchBuyerNames = useCallback(async (messageList) => {
    // Get unique viewer sender_ids that we don't have names for yet
    const viewerIds = messageList
      .filter(m => m.sender_role === 'viewer' && !buyerNames[m.sender_id])
      .map(m => m.sender_id);
    
    const uniqueIds = [...new Set(viewerIds)];
    if (uniqueIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('buyer_profiles')
        .select('user_id, full_name')
        .in('user_id', uniqueIds);

      if (error || !data) return;

      // Build name map
      const newNames = {};
      data.forEach(profile => {
        newNames[profile.user_id] = profile.full_name || 'Buyer';
      });

      // Merge with existing cache
      if (Object.keys(newNames).length > 0 && mountedRef.current) {
        setBuyerNames(prev => ({ ...prev, ...newNames }));
      }
    } catch (err) {
      // Silently fail - names are non-critical
    }
  }, [buyerNames]);

  // ─────────────────────────────────────────────────────────────────────
  // CHECK VIEWER BAN STATUS
  // ─────────────────────────────────────────────────────────────────────
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
    refetchInterval: false,
    refetchOnWindowFocus: false
  });

  // Compute ban state (matches legacy behavior: chat, view, or full blocks chat)
  const isChatBanned = viewerBan && (
    viewerBan.ban_type === 'chat' || 
    viewerBan.ban_type === 'view' || 
    viewerBan.ban_type === 'full'
  );

  // ─────────────────────────────────────────────────────────────────────
  // CHECK CHAT AVAILABILITY
  // ─────────────────────────────────────────────────────────────────────
  const checkAvailability = useCallback(async () => {
    const available = await isLiveChatAvailable(showId);
    if (mountedRef.current) {
      setIsChatAvailable(available);
      if (!available) {
        setShowEnded(true);
      }
    }
  }, [showId]);

  // ─────────────────────────────────────────────────────────────────────
  // POLL FOR MESSAGES
  // ─────────────────────────────────────────────────────────────────────
  const pollMessages = useCallback(async () => {
    if (!showId) return;

    const { messages: newMessages, error } = await getLiveShowMessages(showId, {
      limit: 100,
    });

    if (mountedRef.current && !error) {
      // Merge new messages
      if (newMessages.length > 0) {
        const lastNewId = newMessages[newMessages.length - 1].id;

        // Check if we have new messages
        if (lastNewId !== lastMessageIdRef.current) {
          lastMessageIdRef.current = lastNewId;
          setMessages(newMessages);
          fetchBuyerNames(newMessages);
          resetFadeTimer();
        }
      }
    }

    // Also check availability periodically
    await checkAvailability();
  }, [showId, checkAvailability]);

  // Start/stop polling
  useEffect(() => {
    if (!showId) return;

    // Initial load
    pollMessages();

    // Start polling
    pollingIntervalRef.current = setInterval(pollMessages, POLL_INTERVAL);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [showId, pollMessages]);

  // ─────────────────────────────────────────────────────────────────────
  // AUTO-SCROLL TO BOTTOM
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isMinimized]);

  // ─────────────────────────────────────────────────────────────────────
  // FADE EFFECT FOR OVERLAY
  // ─────────────────────────────────────────────────────────────────────
  const resetFadeTimer = () => {
    if (!isOverlay) return;

    setFadeMessages(false);
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
    }
    fadeTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setFadeMessages(true);
      }
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault();

    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || !user || isSending) return;

    // ═══════════════════════════════════════════════════════════════════════════
    // SUSPENSION CHECK: Block chat for suspended accounts
    // ═══════════════════════════════════════════════════════════════════════════
    const { canProceed, error: guardError } = await checkAccountActiveAsync(supabase, user.id);
    if (!canProceed) {
      setSendError(guardError);
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BAN CHECK: Block chat for banned viewers (matches legacy behavior)
    // ═══════════════════════════════════════════════════════════════════════════
    if (isChatBanned) {
      setSendError("You have been banned from chatting in this seller's shows.");
      return;
    }

    // Prevent sending if chat is not available
    if (!isChatAvailable) {
      setSendError("Chat is only available during live shows");
      return;
    }

    setIsSending(true);
    setSendError(null);

    const senderRole = isSeller ? "seller" : "viewer";

    const { message, error } = await sendLiveShowMessage(
      showId,
      trimmedMessage,
      senderRole
    );

    if (mountedRef.current) {
      setIsSending(false);

      if (error) {
        setSendError(error);
      } else if (message) {
        // Add to local messages immediately for responsiveness
        setMessages((prev) => [...prev, message]);
        setNewMessage("");
        resetFadeTimer();
      }
    }
  };

  // Handle Enter key
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // RENDER - SHOW ENDED STATE
  // ─────────────────────────────────────────────────────────────────────
  if (showEnded && !isChatAvailable) {
    return (
      <div className={`${isOverlay ? "fixed bottom-20 left-4 right-4 z-40" : ""}`}>
        <div className="bg-black/80 backdrop-blur-md rounded-xl p-4 text-center border border-white/10">
          <MessageCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-white text-sm mb-3">Show has ended</p>
          {onMessageSeller && user && !isSeller && (
            <Button
              onClick={onMessageSeller}
              variant="outline"
              size="sm"
              className="text-white border-white/30 hover:bg-white/10"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Message Seller
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER - MINIMIZED STATE
  // ─────────────────────────────────────────────────────────────────────
  if (isMinimized) {
    return (
      <div className={`${isOverlay ? "fixed bottom-20 left-4 z-40" : ""}`}>
        <Button
          onClick={() => setIsMinimized(false)}
          className="bg-black/80 backdrop-blur-md hover:bg-black/90 text-white rounded-full p-3"
        >
          <MessageCircle className="w-5 h-5" />
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {messages.length > 99 ? "99+" : messages.length}
            </span>
          )}
        </Button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER - MAIN CHAT
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div
      className={`
        ${isOverlay ? "fixed bottom-20 left-4 right-4 z-40 max-w-md" : "w-full h-full"}
        flex flex-col
      `}
    >
      {/* Messages Container */}
      <div
        className={`
          ${isOverlay ? "max-h-48" : "flex-1"}
          overflow-y-auto mb-2
          ${fadeMessages && isOverlay ? "opacity-30" : "opacity-100"}
          transition-opacity duration-500
        `}
        onMouseEnter={() => setFadeMessages(false)}
        onTouchStart={() => setFadeMessages(false)}
      >
        {messages.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-white/50 text-sm">
              {isChatAvailable ? "No messages yet. Say hello!" : "Chat loading..."}
            </p>
          </div>
        ) : (
          <div className="space-y-2 px-1">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isCurrentUser={msg.sender_id === user?.id}
                isOverlay={isOverlay}
                buyerName={buyerNames[msg.sender_id]}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form */}
      {user ? (
        isChatBanned ? (
          <div 
            className={`
              flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl w-full
              ${isOverlay 
                ? "bg-red-600/90 backdrop-blur-md border border-white/30" 
                : "bg-red-600/80"
              }
            `}
          >
            <Ban className="w-4 h-4 text-white" />
            <p className="text-xs text-white font-medium">You are banned from chatting</p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isChatAvailable ? "Type a message..." : "Chat ended"}
                disabled={isSending || !isChatAvailable}
                maxLength={500}
                className={`
                  ${isOverlay
                    ? "bg-black/60 backdrop-blur-md border-white/20 text-white placeholder:text-white/50"
                    : "bg-white/10 border-gray-600 text-white"
                  }
                  pr-12
                `}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">
                {newMessage.length}/500
              </span>
            </div>
          <Button
            type="button"
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending || !isChatAvailable}
            className={`
              ${isOverlay
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-purple-600 hover:bg-purple-700"
              }
              text-white
            `}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        )
      ) : (
        <div className="text-center py-2">
          <p className="text-white/60 text-sm">Log in to chat</p>
        </div>
      )}

      {/* Error Display */}
      {sendError && (
        <p className="text-red-400 text-xs mt-1 text-center">{sendError}</p>
      )}

      {/* Live Indicator */}
      {isChatAvailable && (
        <div className="flex items-center justify-center gap-1 mt-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white/50 text-xs">Live Chat</span>
        </div>
      )}
    </div>
  );
}

/**
 * Individual Chat Message Component
 */
function ChatMessage({ message, isCurrentUser, isOverlay, buyerName }) {
  const isSeller = message.sender_role === "seller";
  const displayName = isSeller ? "Host" : (buyerName || "Buyer");

  return (
    <div
      className={`
        flex items-start gap-2
        ${isCurrentUser ? "flex-row-reverse" : ""}
      `}
    >
      {/* Avatar */}
      <div
        className={`
          w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
          ${isSeller ? "bg-purple-600" : "bg-gray-600"}
        `}
      >
        {isSeller ? (
          <Radio className="w-3 h-3 text-white" />
        ) : (
          <User className="w-3 h-3 text-white" />
        )}
      </div>

      {/* Message Bubble */}
      <div
        className={`
          max-w-[80%] rounded-lg px-3 py-1.5
          ${isOverlay
            ? isCurrentUser
              ? "bg-purple-600/80"
              : "bg-black/60 backdrop-blur-sm"
            : isCurrentUser
              ? "bg-purple-600"
              : "bg-gray-700"
          }
        `}
      >
        {/* Sender Name & Badge */}
        <div className="flex items-center gap-1 mb-0.5">
          {isSeller ? (
            <Badge className="bg-purple-500/30 text-purple-200 text-[10px] px-1 py-0">
              Host
            </Badge>
          ) : (
            <span className="text-white/70 text-[10px] font-medium">
              {displayName}
            </span>
          )}
          <span className="text-white/50 text-[10px]">
            {format(new Date(message.created_at), "h:mm a")}
          </span>
        </div>

        {/* Message Text */}
        <p className="text-white text-sm break-words">{message.message}</p>
      </div>
    </div>
  );
}

// Named export for PLAYER_STATE equivalent
export const CHAT_STATE = {
  LOADING: "loading",
  ACTIVE: "active",
  ENDED: "ended",
  ERROR: "error",
};





