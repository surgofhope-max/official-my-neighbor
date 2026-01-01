import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Star, Package, AlertCircle, MessageCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import ReviewSubmitDialog from "@/components/orders/ReviewSubmitDialog";
import { createPageUrl } from "@/utils";
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import {
  getNotificationsForUser,
  markNotificationAsRead,
} from "@/api/notifications";

export default function Notifications() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [effectiveUserId, setEffectiveUserId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState(null);
  const [reviewSeller, setReviewSeller] = useState(null);
  const [reviewNotificationId, setReviewNotificationId] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.warn("[Notifications] auth load failed", error);
        // FIX: Set isLoading to false so page doesn't show spinner forever
        setIsLoading(false);
        return;
      }
      const currentUser = data?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const context = getEffectiveUserContext(currentUser);
        setEffectiveUserId(context.effectiveUserId);
      } else {
        // FIX: No user logged in - stop loading
        setIsLoading(false);
      }
    } catch (error) {
      console.warn("Error loading user:", error);
      // FIX: Stop loading on error
      setIsLoading(false);
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
      // Option A: default feed hides read notifications (projection only)
      const unreadOnly = data.filter((n) => !n.read);
      setNotifications(unreadOnly);
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

  // Dismiss = mark as read; let collapse logic control visibility on next fetch.
  // No DELETE — preserves DB audit trail.
  const handleDismiss = async (notificationId) => {
    const success = await markNotificationAsRead(notificationId, effectiveUserId);
    if (success) {
      // Update local state to reflect read status (collapse will handle visibility)
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, read: true, read_at: new Date().toISOString() }
            : n
        )
      );
    }
  };

  const handleOpenReview = async (notification) => {
    setReviewNotificationId(notification.id);

    // Set seller info from notification metadata
    setReviewSeller({
      id: notification.metadata?.seller_id,
      business_name: notification.metadata?.seller_name,
    });

    // Fetch the order by order_id from metadata
    const orderId = notification.metadata?.order_id;
    if (orderId) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (!error && data) {
        setReviewOrder(data);
        setReviewOpen(true);
      } else {
        console.error("Failed to load order for review:", error);
      }
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
        // Open Supabase review dialog
        handleOpenReview(notification);
        break;

      case "order_update":
        // Navigate to BuyerOrders
        navigate(createPageUrl("BuyerOrders"));
        break;

      case "pickup_completed":
        // FIX: Navigate to BuyerOrders for pickup notifications
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
      case "pickup_completed":
        return <Package className="w-5 h-5 text-green-500" />;
      case "message":
        return <MessageCircle className="w-5 h-5 text-purple-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // FIX: Show login prompt if not logged in (after loading complete)
  if (!user && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Please Log In</h3>
            <p className="text-gray-600 mb-4">You need to be logged in to view your notifications.</p>
            <Button onClick={() => { sessionStorage.setItem("login_return_url", window.location.href); window.location.href = "/Login"; }}>
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading spinner while auth is loading
  if (!user && isLoading) {
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
                            {/* FIX: Use created_at (actual DB column) not created_date */}
                            {notification.created_at && format(new Date(notification.created_at), "MMM d, h:mm a")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Dismiss"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDismiss(notification.id);
                            }}
                            className="h-7 px-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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

      {reviewOpen && reviewOrder && (
        <ReviewSubmitDialog
          open={reviewOpen}
          onOpenChange={(open) => {
            if (!open) {
              setReviewOpen(false);
              setReviewOrder(null);
              setReviewSeller(null);
              setReviewNotificationId(null);
            }
          }}
          order={reviewOrder}
          seller={reviewSeller}
          notificationId={reviewNotificationId}
          currentUserId={user?.id}
          onSuccess={() => {
            setReviewOpen(false);
            setReviewOrder(null);
            setReviewSeller(null);
            setReviewNotificationId(null);
            loadNotifications();
          }}
        />
      )}
    </>
  );
}
