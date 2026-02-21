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
import { Send, MessageCircle, X, Radio, User, Ban, MoreVertical } from "lucide-react";
import { format } from "date-fns";
import { checkAccountActiveAsync } from "@/lib/auth/accountGuards";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ViewerBanDialog from "../host/ViewerBanDialog";

/**
 * SupabaseLiveChat Component
 *
 * @param {Object} props
 * @param {string} props.showId - The show ID
 * @param {string} props.sellerId - The seller ID (for seller detection)
 * @param {boolean} props.isSeller - Whether the current user is the seller
 * @param {Object} props.user - The canonical authenticated user (from SupabaseAuthProvider)
 * @param {Function} props.onClose - Callback to close the chat panel
 * @param {boolean} props.isOverlay - Whether to render as transparent overlay
 * @param {Function} props.onMessageSeller - Callback for "Message Seller" CTA when show ends
 */
export default function SupabaseLiveChat({
  showId,
  sellerId,
  isSeller = false,
  user,
  onClose,
  isOverlay = true,
  onMessageSeller,
}) {
  console.log("[CHAT PROPS DEBUG][SupabaseLiveChat]", {
    showId,
    sellerId,
    isSeller,
    userId: user?.id ?? null,
    userRole: user?.role ?? null,
  });

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

  // Moderation state
  const [banningViewer, setBanningViewer] = useState(null);

  // Buyer profile names cache (keyed by sender_id)
  const [buyerNames, setBuyerNames] = useState({});

  // Refs
  const messagesEndRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const knownMessageIdsRef = useRef(new Set()); // Track IDs we've already processed
  const mountedRef = useRef(true);
  const realtimeActiveRef = useRef(false);

  // Poll interval (ms)
  const POLL_INTERVAL = 2500;

  // Cleanup ref on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  const enabled = !!sellerId && !!user && !isSeller;
  const viewerBanQueryKey = ['viewer-ban-check', sellerId, user?.id];
  const viewerBanQuery = useQuery({
    queryKey: viewerBanQueryKey,
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
    enabled,
    staleTime: 300000, // 5 minutes - ban status rarely changes
    refetchInterval: false,
    refetchOnWindowFocus: false,
    // Debug callbacks
    onSuccess: (data) => {
      console.log("[VB QUERY][SUCCESS]", { key: viewerBanQueryKey, data, fetchedAt: Date.now() });
    },
    onError: (error) => {
      console.log("[VB QUERY][ERROR]", { key: viewerBanQueryKey, error });
    },
  });
  const viewerBan = viewerBanQuery.data;

  // Debug: observe query state changes
  useEffect(() => {
    console.log("[VB QUERY][STATE]", {
      key: viewerBanQueryKey,
      enabled,
      status: viewerBanQuery.status,
      fetchStatus: viewerBanQuery.fetchStatus,
      isFetching: viewerBanQuery.isFetching,
      dataUpdatedAt: viewerBanQuery.dataUpdatedAt,
    });
  }, [viewerBanQuery.status, viewerBanQuery.fetchStatus]);

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
  // APPLY INCOMING MESSAGES (shared by polling, realtime, send)
  // ─────────────────────────────────────────────────────────────────────
  const applyIncomingMessages = useCallback(async (newMessages) => {
    const accepted = newMessages.filter((m) => !knownMessageIdsRef.current.has(m.id));
    if (accepted.length === 0) return;

    accepted.forEach((m) => knownMessageIdsRef.current.add(m.id));
    if (knownMessageIdsRef.current.size > 150) {
      const idsArray = Array.from(knownMessageIdsRef.current);
      knownMessageIdsRef.current = new Set(idsArray.slice(-100));
    }

    setMessages((prev) => {
      const merged = [...prev, ...accepted];
      return merged.length > 100 ? merged.slice(-100) : merged;
    });

    resetFadeTimer();
    const acceptedViewers = accepted.filter((m) => m.sender_role === "viewer");
    if (acceptedViewers.length > 0) {
      await fetchBuyerNames(acceptedViewers);
    }
  }, [fetchBuyerNames]);

  // ─────────────────────────────────────────────────────────────────────
  // POLL FOR MESSAGES
  // ─────────────────────────────────────────────────────────────────────
  const pollMessages = useCallback(async () => {
    if (!showId) return;

    // Gate message fetch when realtime is active — reduces burst load, availability still runs
    if (!realtimeActiveRef.current) {
      const { messages: serverMessages, error } = await getLiveShowMessages(showId, {
        limit: 100,
      });

      if (mountedRef.current && !error && serverMessages.length > 0) {
        const lastServerId = serverMessages[serverMessages.length - 1].id;

        // Only process if there are new messages (compare last ID)
        if (lastServerId !== lastMessageIdRef.current) {
          lastMessageIdRef.current = lastServerId;

          // INCREMENTAL APPEND: Find only truly new messages using ref for O(1) lookup
          const onlyNew = serverMessages.filter((m) => !knownMessageIdsRef.current.has(m.id));

          if (onlyNew.length > 0) {
            const ordered = [...onlyNew].reverse();
            await applyIncomingMessages(ordered);
          }
        }
      }
    }

    // Also check availability periodically (always runs)
    await checkAvailability();
  }, [showId, checkAvailability, fetchBuyerNames, applyIncomingMessages]);

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
  // REALTIME SUBSCRIPTION (INSERT on live_show_messages)
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showId) return;

    const channel = supabase
      .channel(`live_show_messages:${showId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_show_messages",
          filter: `show_id=eq.${showId}`,
        },
        async (payload) => {
          const row = payload?.new;
          if (!row?.id) return;
          console.log("[REALTIME_CHAT] insert", { id: row.id, showId });
          await applyIncomingMessages([row]);
        }
      )
      .subscribe((status) => {
        realtimeActiveRef.current = status === "SUBSCRIBED";
        console.log("[REALTIME_CHAT] status", { status, showId });
      });

    console.log("[REALTIME_CHAT] subscribed", { showId });

    return () => {
      realtimeActiveRef.current = false;
      supabase.removeChannel(channel);
      console.log("[REALTIME_CHAT] unsubscribed", { showId });
    };
  }, [showId, applyIncomingMessages]);

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
        await applyIncomingMessages([message]);
        setNewMessage("");
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

  // Handle ban viewer action
  const handleBanViewer = (msg) => {
    setBanningViewer({
      user_id: msg.sender_id,
      user_name: buyerNames[msg.sender_id] || "Buyer"
    });
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
        ${isOverlay ? "fixed bottom-0 left-4 right-4 z-40 max-w-md" : "w-full h-full"}
        flex flex-col
      `}
    >
      {/* Messages Container */}
      <div
        className={`
          ${isOverlay ? "max-h-[50vh] pb-12" : "flex-1"}
          overflow-y-auto mb-1
          opacity-100
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
              <div key={msg.id} className="group flex items-start gap-1">
                <ChatMessage
                  message={msg}
                  isCurrentUser={msg.sender_id === user?.id}
                  isOverlay={isOverlay}
                  buyerName={buyerNames[msg.sender_id]}
                />

                {isSeller && msg.sender_role !== "seller" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/20 rounded">
                        <MoreVertical className="w-4 h-4 text-white/60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleBanViewer(msg)}
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Mute from chat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form */}
      {console.log("[CHAT DEBUG] viewer user:", user)}
      {console.log("[CHAT DEBUG] sellerId:", sellerId)}
      {console.log("[CHAT DEBUG] showId:", showId)}
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

      {/* Viewer Ban Dialog */}
      <ViewerBanDialog
        open={!!banningViewer}
        onOpenChange={() => setBanningViewer(null)}
        viewer={banningViewer}
        sellerId={sellerId}
        showId={showId}
      />
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
      {/* Message Text - Simple overlay style (no bubbles) */}
      <div
        className={`
          ${isOverlay
            ? "text-sm leading-tight"
            : "max-w-[80%] rounded-lg px-3 py-1.5 " + (isCurrentUser ? "bg-purple-600" : "bg-gray-700")
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
        <p className="text-white text-sm break-words font-semibold">{message.message}</p>
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





