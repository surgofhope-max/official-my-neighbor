import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Package } from "lucide-react";
import { format } from "date-fns";
import ReviewRequestBubble from "./ReviewRequestBubble";

export default function MessageBubble({ message, isCurrentUser, onConfirmPickup }) {
  const isSystemMessage = message.sender_type === "system";
  const isPickupReady = message.message_type === "pickup_ready";
  const isPickupConfirmed = message.message_type === "pickup_confirmed";
  const isReviewRequest = message.message_type === "review_request";

  // Render review request as special bubble
  if (isReviewRequest && !isCurrentUser) {
    return <ReviewRequestBubble message={message} />;
  }

  if (isSystemMessage) {
    return (
      <div className="flex justify-center my-4">
        <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs px-3 py-1">
          {message.body}
        </Badge>
      </div>
    );
  }

  return (
    <div className={`flex ${isCurrentUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[70%] ${isCurrentUser ? "items-end" : "items-start"}`}>
        {/* Message Bubble */}
        <div
          className={`rounded-2xl px-4 py-2 ${
            isCurrentUser
              ? "bg-purple-600 text-white"
              : "bg-gray-100 text-gray-900"
          }`}
        >
          {/* Pickup Ready Special Message */}
          {isPickupReady && !isCurrentUser && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4" />
                <span className="font-semibold">Order Ready for Pickup</span>
              </div>
              <p className="text-sm">{message.body}</p>
              {message.metadata?.order_details && (
                <div className="bg-white/10 rounded-lg p-2 text-xs space-y-1 mt-2">
                  <p><strong>Product:</strong> {message.metadata.order_details.product_title}</p>
                  <p><strong>Pickup Location:</strong> {message.metadata.order_details.pickup_location}</p>
                </div>
              )}
              {onConfirmPickup && !isPickupConfirmed && (
                <Button
                  size="sm"
                  onClick={() => onConfirmPickup(message)}
                  className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirm Pickup Received
                </Button>
              )}
            </div>
          )}

          {/* Pickup Confirmed Message */}
          {isPickupConfirmed && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span className="font-semibold">Pickup Confirmed</span>
              </div>
              <p className="text-sm">{message.body}</p>
            </div>
          )}

          {/* Regular Text Message */}
          {!isPickupReady && !isPickupConfirmed && (
            <p className="text-sm leading-relaxed break-words">{message.body}</p>
          )}
        </div>

        {/* Timestamp & Read Status */}
        <div className={`flex items-center gap-1 mt-1 px-2 ${isCurrentUser ? "justify-end" : "justify-start"}`}>
          <span className="text-xs text-gray-500">
            {format(new Date(message.created_date), "h:mm a")}
          </span>
          {isCurrentUser && (
            <>
              {message.read_by_buyer || message.read_by_seller ? (
                <CheckCircle className="w-3 h-3 text-purple-600" />
              ) : (
                <Clock className="w-3 h-3 text-gray-400" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}