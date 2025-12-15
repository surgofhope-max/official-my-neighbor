import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, MoreVertical, AlertCircle, Ban, Loader2, RefreshCw, Trash2 } from "lucide-react";
import MessageBubble from "../components/messaging/MessageBubble";
import MessageInput from "../components/messaging/MessageInput";
import ConversationList from "../components/messaging/ConversationList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createPageUrl } from "@/utils";

// Supabase API imports
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import { getSellerByUserId, getSellerById } from "@/api/sellers";
import {
  getConversationsForInbox,
  getConversationById,
  findOrCreateConversation,
  resetUnreadCount,
  updateConversationOnSend,
  deleteConversation,
} from "@/api/conversations";
import {
  getMessagesForConversation,
  sendMessage,
  markMessagesAsRead,
} from "@/api/messages";

export default function Messages() {
  const messagesEndRef = useRef(null);
  const initialLoadDone = useRef(false);
  
  // Auth state
  const [user, setUser] = useState(null);
  const [seller, setSeller] = useState(null);
  const [userType, setUserType] = useState(null);
  const [effectiveUserId, setEffectiveUserId] = useState(null);
  const [effectiveSellerId, setEffectiveSellerId] = useState(null);
  
  // Conversation state
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  
  // Messages state
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  // UI state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const urlConversationId = urlParams.get('conversationId');
  const urlSellerId = urlParams.get('sellerId');

  // Load user and seller on mount
  useEffect(() => {
    loadUser();
  }, []);

  // Clear selection when URL params change
  useEffect(() => {
    setSelectedConversation(null);
  }, [urlConversationId, urlSellerId]);

  // Load user with impersonation support
  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      if (!currentUser) {
        setUser(null);
        setUserType(null);
        return;
      }

      setUser(currentUser);

      // Resolve impersonation context
      const context = getEffectiveUserContext(currentUser);
      setEffectiveUserId(context.effectiveUserId);

      // Check for admin impersonation
      if (context.isImpersonating && context.impersonatedSellerId) {
        const impersonatedSeller = await getSellerById(context.impersonatedSellerId);
        if (impersonatedSeller) {
          setSeller(impersonatedSeller);
          setEffectiveSellerId(impersonatedSeller.id);
          setUserType("seller");
          return;
        }
      }

      // Normal flow - check if user is a seller
      const userSeller = await getSellerByUserId(currentUser.id);
      if (userSeller && userSeller.status === "approved") {
        setSeller(userSeller);
        setEffectiveSellerId(userSeller.id);
        setUserType("seller");
      } else {
        setSeller(null);
        setEffectiveSellerId(null);
        setUserType("buyer");
      }
    } catch (error) {
      console.warn("Error loading user:", error);
      setUser(null);
      setUserType(null);
    }
  };

  // Load conversations when context is ready
  useEffect(() => {
    if (!effectiveUserId || !userType) return;

    loadConversations();

    // Poll every 30 seconds (Base44 parity)
    const pollInterval = setInterval(() => {
      loadConversations();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [effectiveUserId, effectiveSellerId, userType]);

  // Load conversations from Supabase
  const loadConversations = async () => {
    if (!effectiveUserId || !userType) return;

    try {
      const convs = await getConversationsForInbox({
        effectiveUserId,
        effectiveSellerId,
        userType,
        isImpersonating: false, // Already resolved via effectiveUserId
      });

      setConversations(convs);
      initialLoadDone.current = true;
    } catch (error) {
      console.warn("Error loading conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  };

  // Auto-select conversation from URL after conversations load
  useEffect(() => {
    if (!conversations.length || !user || !initialLoadDone.current) return;

    // If conversationId is in URL, select it directly
    if (urlConversationId) {
      const target = conversations.find(c => c.id === urlConversationId);
      if (target) {
        setSelectedConversation(target);
      }
    }
    // If sellerId is in URL but no conversationId, try to find existing conversation
    else if (urlSellerId && userType === "buyer") {
      const existing = conversations.find(c => c.seller_id === urlSellerId);
      if (existing) {
        setSelectedConversation(existing);
        window.history.replaceState({}, '', createPageUrl(`Messages?conversationId=${existing.id}`));
      }
    }
  }, [urlConversationId, urlSellerId, conversations, user, userType]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }

    loadMessages();

    // Poll every 2 seconds for messages (faster than inbox)
    const pollInterval = setInterval(() => {
      loadMessages();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [selectedConversation?.id]);

  // Load messages from Supabase
  const loadMessages = async () => {
    if (!selectedConversation) return;

    setMessagesLoading(messages.length === 0); // Only show loading on first load

    try {
      const msgs = await getMessagesForConversation(selectedConversation.id);
      setMessages(msgs);
    } catch (error) {
      console.warn("Error loading messages:", error);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Mark messages as read when conversation is opened (Base44 parity)
  useEffect(() => {
    if (selectedConversation && messages.length > 0 && userType) {
      handleMarkAsRead();
    }
  }, [selectedConversation?.id, messages.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark messages as read (Base44 parity)
  const handleMarkAsRead = async () => {
    if (!selectedConversation || !userType) return;

    try {
      // Bulk mark messages as read
      await markMessagesAsRead(selectedConversation.id, userType);

      // Reset unread count on conversation
      await resetUnreadCount(selectedConversation.id, userType);

      // Refresh conversations to update badge
      loadConversations();
    } catch (error) {
      console.warn("Error marking messages as read:", error);
    }
  };

  // Send a message (Base44 parity)
  // QA HARDENING: Prevents empty messages and double-submit
  const handleSendMessage = async (messageBody) => {
    // QA HARDENING: Validate required context
    if (!selectedConversation || !effectiveUserId || !userType) return;

    // QA HARDENING: Prevent empty/whitespace-only messages
    const trimmedBody = (messageBody || "").trim();
    if (!trimmedBody) {
      return;
    }

    // QA HARDENING: Prevent double-submit
    if (isSending) {
      return;
    }

    setIsSending(true);

    try {
      // Create the message
      const newMessage = await sendMessage(
        selectedConversation.id,
        effectiveUserId,
        userType,
        trimmedBody
      );

      if (newMessage) {
        // Update conversation (last_message_at, increment unread)
        await updateConversationOnSend(
          selectedConversation.id,
          trimmedBody,
          userType
        );

        // Refresh messages and conversations
        await loadMessages();
        await loadConversations();
      }
    } catch (error) {
      console.warn("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  // Delete conversation (soft delete - Base44 parity)
  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;

    setIsDeleting(true);

    try {
      await deleteConversation(selectedConversation.id);

      setShowDeleteDialog(false);
      setSelectedConversation(null);
      window.history.replaceState({}, '', createPageUrl("Messages"));

      // Refresh conversations
      await loadConversations();
    } catch (error) {
      console.warn("Error deleting conversation:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Block user (placeholder - uses legacy entity for now)
  const handleBlockUser = async () => {
    if (!selectedConversation || !user) return;

    try {
      const otherUserId = userType === "buyer"
        ? selectedConversation.seller_id
        : selectedConversation.buyer_id;

      await base44.entities.Block.create({
        blocker_id: user.id,
        blocked_id: otherUserId,
        reason: "Blocked from messages"
      });

      alert("User blocked successfully");
      setSelectedConversation(null);
      window.history.replaceState({}, '', createPageUrl("Messages"));
      loadConversations();
    } catch (error) {
      console.warn("Error blocking user:", error);
    }
  };

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
    window.history.replaceState({}, '', createPageUrl(`Messages?conversationId=${conversation.id}`));
  };

  const handleBack = () => {
    setSelectedConversation(null);
    window.history.replaceState({}, '', createPageUrl("Messages"));
  };

  const handleForceRefresh = () => {
    loadConversations();
  };

  // Loading state
  if (!user || !userType) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const otherParty = selectedConversation
    ? (userType === "buyer" ? selectedConversation.seller_info : selectedConversation.buyer_info)
    : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex overflow-hidden">
        {/* Conversations List */}
        <div className={`w-full sm:w-96 border-r border-gray-200 bg-white overflow-y-auto ${
          selectedConversation ? "hidden sm:block" : ""
        }`}>
          <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
              <Button variant="ghost" size="icon" onClick={handleForceRefresh} title="Refresh conversations">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-600">
              {userType === "seller" ? "Customer messages" : "Your conversations"}
            </p>
          </div>
          
          {conversationsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading...</p>
              </div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-center p-8">
              <div>
                <p className="text-gray-500 mb-2">No conversations yet</p>
                <p className="text-sm text-gray-400">Message a seller to start chatting</p>
              </div>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              onSelectConversation={handleSelectConversation}
              selectedConversationId={selectedConversation?.id}
              currentUserType={userType}
              currentUserId={effectiveUserId}
              currentSellerId={effectiveSellerId}
            />
          )}
        </div>

        {/* Conversation View */}
        <div className={`flex-1 flex flex-col bg-white ${
          !selectedConversation ? "hidden sm:flex" : ""
        }`}>
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="border-b border-gray-200 bg-white p-4 flex-shrink-0 z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={handleBack} className="sm:hidden">
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={otherParty?.profile_image_url || otherParty?.image_url} />
                      <AvatarFallback className="bg-gradient-to-r from-purple-600 to-blue-500 text-white">
                        {otherParty?.name?.[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <h2 className="font-semibold text-gray-900">{otherParty?.name || "User"}</h2>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Conversation
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleBlockUser} className="text-red-600">
                        <Ban className="w-4 h-4 mr-2" />
                        Block User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center">
                      <div>
                        <p className="text-gray-500">No messages yet</p>
                        <p className="text-sm text-gray-400 mt-2">Start the conversation!</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} isCurrentUser={message.sender_id === effectiveUserId} />
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Input */}
                <div className="flex-shrink-0 border-t border-gray-200 bg-white">
                  <MessageInput onSend={handleSendMessage} disabled={isSending} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <div>
                <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
                <p className="text-gray-600">Choose a conversation from the list</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the conversation from your view. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
