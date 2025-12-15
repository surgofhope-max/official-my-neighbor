import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Star, Package, AlertCircle, MessageCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import ReviewModal from "../components/reviews/ReviewModal";
import { createPageUrl } from "@/utils";
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import {
  getNotificationsForUser,
  markNotificationAsRead,
  deleteNotification,
} from "@/api/notifications";

export default function Notifications() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [effectiveUserId, setEffectiveUserId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReviewRequest, setSelectedReviewRequest] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      if (currentUser) {
        const context = getEffectiveUserContext(currentUser);
        setEffectiveUserId(context.effectiveUserId);
      }
    } catch (error) {
      console.warn("Error loading user:", error);
    }
  };

  // Load notifications when effectiveUserId is ready
  useEffect(() => {
    if (!effectiveUserId) return;

    loadNotifications();

    // Poll every 10 seconds
    const pollInterval = setInterval(() => {
      loadNotifications();
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [effectiveUserId]);

  const loadNotifications = async () => {
    if (!effectiveUserId) return;

    try {
      const data = await getNotificationsForUser(effectiveUserId);
      setNotifications(data);
    } catch (error) {
      console.warn("Error loading notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    const success = await markNotificationAsRead(notificationId);
    if (success) {
      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, read: true, read_at: new Date().toISOString() }
            : n
        )
      );
    }
  };

  const handleDelete = async (notificationId) => {
    const success = await deleteNotification(notificationId);
    if (success) {
      // Update local state
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    }
  };

  const handleNotificationClick = (notification) => {
    // Mark as read if unread
    if (!notification.read) {
      handleMarkAsRead(notification.id);
    }

    // Handle click based on notification type
    switch (notification.type) {
      case "review_request":
        // Open review modal
        setSelectedReviewRequest(notification);
        break;

      case "order_update":
        // Navigate to BuyerOrders
        navigate(createPageUrl("BuyerOrders"));
        break;

      case "message":
        // Navigate to Messages (placeholder - not wired yet)
        if (notification.metadata?.conversation_id) {
          navigate(createPageUrl(`Messages?conversationId=${notification.metadata.conversation_id}`));
        } else {
          navigate(createPageUrl("Messages"));
        }
        break;

      default:
        // System notifications - no action
        break;
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "review_request":
        return <Star className="w-5 h-5 text-yellow-500" />;
      case "order_update":
        return <Package className="w-5 h-5 text-blue-500" />;
      case "message":
        return <MessageCircle className="w-5 h-5 text-purple-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-gray-600 mt-1">
                  {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : notifications.length === 0 ? (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="p-12 text-center">
                <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No notifications</h3>
                <p className="text-gray-600">You're all caught up!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    notification.read ? "bg-white" : "bg-blue-50 border-blue-200"
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                          {!notification.read && (
                            <Badge className="bg-blue-600 text-white">New</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{notification.body}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {format(new Date(notification.created_date), "MMM d, h:mm a")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(notification.id);
                            }}
                            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedReviewRequest && (
        <ReviewModal
          seller={{
            id: selectedReviewRequest.metadata.seller_id,
            business_name: selectedReviewRequest.metadata.seller_name,
          }}
          orderId={selectedReviewRequest.metadata.order_id}
          onClose={() => {
            setSelectedReviewRequest(null);
            handleDelete(selectedReviewRequest.id);
          }}
        />
      )}
    </>
  );
}
