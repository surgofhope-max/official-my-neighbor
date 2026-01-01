import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Pin, Users, MessageCircle, MoreVertical, Ban, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ViewerBanDialog from "../host/ViewerBanDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LiveChat({ showId, isSeller = false, isEmbedded = false, sellerId = null }) {
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [banningViewer, setBanningViewer] = useState(null);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        // Gracefully handle auth errors - user just can't chat
        setUser(null);
        return;
      }
      setUser(data?.user ?? null);
    } catch (error) {
      // Swallow errors - chat is non-critical, don't block rendering
      setUser(null);
    }
  };

  const { data: userBan } = useQuery({
    queryKey: ['viewer-ban-check', sellerId, user?.id],
    queryFn: async () => {
      if (!sellerId || !user?.id) return null;
      const bans = await base44.entities.ViewerBan.filter({
        seller_id: sellerId,
        viewer_id: user.id
      });
      return bans.length > 0 ? bans[0] : null;
    },
    enabled: !!sellerId && !!user && !isSeller,
    staleTime: 300000, // 5 minutes - ban status rarely changes
    refetchInterval: false, // DO NOT poll continuously
    refetchOnWindowFocus: false
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['chat-messages', showId],
    queryFn: () => base44.entities.ChatMessage.filter({ show_id: showId }, 'created_date'),
    refetchInterval: 2000,
    enabled: !!showId
  });

  const sendMessageMutation = useMutation({
    mutationFn: (messageData) => base44.entities.ChatMessage.create(messageData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', showId] });
      setMessage("");
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: ({ id, isPinned }) => base44.entities.ChatMessage.update(id, { is_pinned: isPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', showId] });
    },
  });

  const handleSend = (e) => {
    e.preventDefault();
    if (!message.trim() || !user) return;

    if (userBan && (userBan.ban_type === 'chat' || userBan.ban_type === 'view' || userBan.ban_type === 'full')) {
      alert("You have been banned from chatting in this seller's shows.");
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
    console.log("🚫 Ban viewer clicked for message:", msg);
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
  const isChatBanned = userBan && (userBan.ban_type === 'chat' || userBan.ban_type === 'view' || userBan.ban_type === 'full');

  if (isEmbedded) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden">
        {pinnedMessages.length > 0 && (
          <div className="bg-yellow-50 border-b border-yellow-200 p-2 space-y-1">
            {pinnedMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-2 text-xs">
                <Pin className="w-3 h-3 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-yellow-900">{msg.user_name}:</span>{" "}
                  <span className="text-yellow-800">{msg.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 pb-4">
          {regularMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 text-sm">
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                {msg.user_avatar ? (
                  <img src={msg.user_avatar} alt={msg.user_name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  msg.user_name[0].toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className={`font-semibold text-xs ${msg.is_seller ? 'text-purple-600' : 'text-gray-900'}`}>
                    {msg.user_name}
                  </span>
                  {msg.is_seller && (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 border text-[10px] px-1 py-0">
                      Seller
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-700 break-words">{msg.message}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-200 flex-shrink-0 mb-2">
          {isChatBanned ? (
            <div className="text-center text-red-600 py-2 text-xs">
              You are banned from chatting
            </div>
          ) : user ? (
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message..."
                className="flex-1 text-sm h-10"
                maxLength={500}
              />
              <Button
                type="submit"
                size="sm"
                className="bg-gradient-to-r from-purple-600 to-blue-600 h-10 px-4"
                disabled={!message.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-2 text-xs">
              Log in to chat
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-full border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="w-5 h-5" />
          Live Chat
          <Badge className="bg-white/20 text-white border-0 ml-auto">
            {messages.length} messages
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {pinnedMessages.length > 0 && (
          <div className="bg-yellow-50 border-b border-yellow-200 p-3 space-y-2">
            {pinnedMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-2 text-sm">
                <Pin className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold text-yellow-900">{msg.user_name}:</span>{" "}
                  <span className="text-yellow-800">{msg.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {regularMessages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p>No messages yet. Be the first to say hello!</p>
            </div>
          )}

          {regularMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-3 group">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                {msg.user_avatar ? (
                  <img src={msg.user_avatar} alt={msg.user_name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  msg.user_name[0].toUpperCase()
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${msg.is_seller ? 'text-purple-600' : 'text-gray-900'}`}>
                    {msg.user_name}
                  </span>
                  {msg.is_seller && (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 border text-xs">
                      Seller
                    </Badge>
                  )}
                  <span className="text-xs text-gray-500">
                    {format(new Date(msg.created_date), 'h:mm a')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 break-words">{msg.message}</p>
              </div>

              {isSeller && !msg.is_seller && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => handlePin(msg)}
                    className="p-1 hover:bg-gray-200 rounded"
                    title={msg.is_pinned ? "Unpin message" : "Pin message"}
                  >
                    <Pin className={`w-4 h-4 ${msg.is_pinned ? 'text-yellow-600' : 'text-gray-600'}`} />
                  </button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 hover:bg-gray-200 rounded" title="More options">
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleBanViewer(msg)}
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Ban Viewer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-200">
          {isChatBanned ? (
            <Alert className="border-red-500 bg-red-50">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <AlertDescription className="text-red-900 text-xs sm:text-sm">
                You have been banned from chatting in this seller's shows.
              </AlertDescription>
            </Alert>
          ) : user ? (
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                maxLength={500}
              />
              <Button
                type="submit"
                className="bg-gradient-to-r from-purple-600 to-blue-600"
                disabled={!message.trim() || sendMessageMutation.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-2">
              <p className="text-sm">Please log in to chat</p>
            </div>
          )}
        </form>
      </CardContent>

      <ViewerBanDialog
        open={!!banningViewer}
        onOpenChange={() => setBanningViewer(null)}
        viewer={banningViewer}
        sellerId={sellerId}
        showId={showId}
      />
    </Card>
  );
}