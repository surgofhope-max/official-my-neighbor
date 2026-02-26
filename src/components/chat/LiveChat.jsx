import React, { useState, useEffect, useRef } from "react";
import { devLog, devWarn } from "@/utils/devLog";
import { supabase } from "@/lib/supabase/supabaseClient";
import { getLiveShowMessages, sendLiveShowMessage } from "@/api/liveChat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Users, MoreVertical, Ban, AlertCircle } from "lucide-react";
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
      const { data, error } = await supabase
        .from('viewer_bans')
        .select('id, ban_type, reason')
        .eq('seller_id', sellerId)
        .eq('viewer_id', user.id)
        .maybeSingle();

      if (error) {
        devWarn('[CHAT] Failed to check ban status:', error.message);
        return null;
      }
      return data;
    },
    enabled: !!sellerId && !!user && !isSeller,
    staleTime: 300000, // 5 minutes - ban status rarely changes
    refetchInterval: false, // DO NOT poll continuously
    refetchOnWindowFocus: false
  });

  const { data: messagesResult } = useQuery({
    queryKey: ['chat-messages', showId],
    queryFn: async () => {
      const result = await getLiveShowMessages(showId, { limit: 200 });
      return result;
    },
    enabled: !!showId,
    staleTime: 3000
  });

  const messages = messagesResult?.messages || [];

  const sendMessageMutation = useMutation({
    mutationFn: async (trimmedMessage) => {
      const senderRole = isSeller ? "seller" : "viewer";
      return await sendLiveShowMessage(showId, trimmedMessage, senderRole);
    },
    onSuccess: (result) => {
      if (!result.error) {
        queryClient.invalidateQueries({ queryKey: ['chat-messages', showId] });
        setMessage("");
      }
    },
  });

  const handleSend = (e) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || !user) return;

    if (userBan && (userBan.ban_type === 'chat' || userBan.ban_type === 'view' || userBan.ban_type === 'full')) {
      alert("You have been banned from chatting in this seller's shows.");
      return;
    }

    sendMessageMutation.mutate(trimmedMessage);
  };

  const handleBanViewer = (msg) => {
    devLog("🚫 Ban viewer clicked for message:", msg);
    setBanningViewer({
      user_id: msg.sender_id,
      user_name: msg.sender_name || msg.sender_id
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Note: live_show_messages table doesn't support pinning
  const regularMessages = messages;
  const isChatBanned = userBan && (userBan.ban_type === 'chat' || userBan.ban_type === 'view' || userBan.ban_type === 'full');

  if (isEmbedded) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 pb-4">
          {regularMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 text-sm">
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                {(msg.sender_name || msg.sender_id)?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className={`font-semibold text-xs ${msg.sender_role === 'seller' ? 'text-purple-600' : 'text-gray-900'}`}>
                    {msg.sender_name || msg.sender_id}
                  </span>
                  {msg.sender_role === 'seller' && (
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
            <>
            {devLog("[CHAT DEBUG DESKTOP] user:", user)}
            {devLog("[CHAT DEBUG DESKTOP] isSeller:", isSeller)}
            {devLog("[CHAT DEBUG DESKTOP] showId:", showId)}
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
            </>
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
                {(msg.sender_name || msg.sender_id)?.[0]?.toUpperCase() || '?'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${msg.sender_role === 'seller' ? 'text-purple-600' : 'text-gray-900'}`}>
                    {msg.sender_name || msg.sender_id}
                  </span>
                  {msg.sender_role === 'seller' && (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 border text-xs">
                      Seller
                    </Badge>
                  )}
                  <span className="text-xs text-gray-500">
                    {format(new Date(msg.created_at), 'h:mm a')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 break-words">{msg.message}</p>
              </div>

              {isSeller && msg.sender_role !== 'seller' && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
                        Mute from chat
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