import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle } from "lucide-react";

export default function ConversationList({ 
  conversations, 
  onSelectConversation, 
  selectedConversationId,
  currentUserType, // "buyer" or "seller"
  currentUserId, // Effective user ID (impersonated or real)
  currentSellerId // Seller ID if user is a seller
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <MessageCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Messages Yet</h3>
        <p className="text-gray-600">
          {currentUserType === "buyer" 
            ? "Start a conversation with a seller" 
            : "Buyers will appear here when they message you"}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {conversations.map((conversation) => {
        const unreadCount = currentUserType === "buyer" 
          ? conversation.buyer_unread_count 
          : conversation.seller_unread_count;
        
        const isSelected = conversation.id === selectedConversationId;
        
        // CRITICAL: Determine other party by checking WHO WE ARE in THIS specific conversation
        let otherParty;
        let isUserTheBuyer = conversation.buyer_id === currentUserId;
        let isUserTheSeller = conversation.seller_id === currentSellerId;
        
        if (isUserTheBuyer) {
          // We are the buyer in this conversation → show the seller
          otherParty = conversation.seller_info;
        } else if (isUserTheSeller) {
          // We are the seller in this conversation → show the buyer
          otherParty = conversation.buyer_info;
        } else {
          // Fallback: use the old logic
          otherParty = currentUserType === "buyer" 
            ? conversation.seller_info 
            : conversation.buyer_info;
        }

        return (
          <button
            key={conversation.id}
            onClick={() => onSelectConversation(conversation)}
            className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
              isSelected ? "bg-purple-50 border-l-4 border-purple-600" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <Avatar className="w-12 h-12 flex-shrink-0">
                <AvatarImage src={otherParty?.profile_image_url || otherParty?.image_url} />
                <AvatarFallback className="bg-gradient-to-r from-purple-600 to-blue-500 text-white">
                  {otherParty?.name?.[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-gray-900 truncate">
                    {otherParty?.name || "Unknown"}
                  </h4>
                  {conversation.last_message_at && (
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                      {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 truncate mb-1">
                  {conversation.last_message_preview || "No messages yet"}
                </p>

                {/* Order Info */}
                {conversation.order_info && (
                  <p className="text-xs text-gray-500 truncate">
                    Order: {conversation.order_info.product_title}
                  </p>
                )}
              </div>

              {/* Unread Badge */}
              {unreadCount > 0 && (
                <Badge className="bg-purple-600 text-white border-0 flex-shrink-0">
                  {unreadCount}
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}