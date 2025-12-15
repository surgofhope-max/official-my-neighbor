/**
 * Notifications API
 *
 * Provides queries and mutations for notification data.
 * Supports order lifecycle notifications (order_update, review_request).
 * Uses effectiveUserId for proper data scoping (supports admin impersonation).
 */

import { supabase } from "@/lib/supabase/supabaseClient";

/**
 * Supported notification types (Base44 parity).
 */
export type NotificationType =
  | "order_update"    // Order lifecycle events (payment confirmed, order completed)
  | "review_request"  // Request to leave a review after pickup
  | "message"         // New message notification (placeholder - not wired yet)
  | "system";         // System announcements

/**
 * Notification entity.
 */
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType;
  metadata?: Record<string, unknown>;
  read: boolean;
  read_at?: string;
  created_date: string;
}

/**
 * Input for creating a notification.
 */
export interface CreateNotificationInput {
  user_id: string;
  title: string;
  body: string;
  type: NotificationType;
  metadata?: Record<string, unknown>;
  read?: boolean;
}

/**
 * Get the count of unread notifications for a user.
 *
 * @param effectiveUserId - The effective user ID (resolved upstream, supports impersonation)
 * @returns The count of unread notifications, or 0 if logged out or on error
 *
 * This function:
 * - Never throws
 * - Returns 0 for logged-out users
 * - Returns 0 on any error
 * - Safe for polling
 */
export async function getUnreadNotificationCount(
  effectiveUserId: string | null
): Promise<number> {
  // Return 0 immediately for logged-out users
  if (!effectiveUserId) {
    return 0;
  }

  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", effectiveUserId)
      .eq("read", false);

    if (error) {
      console.warn("Failed to fetch unread notification count:", error.message);
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    console.warn("Unexpected error fetching unread notification count:", err);
    return 0;
  }
}

/**
 * Get all notifications for a user.
 *
 * @param effectiveUserId - The effective user ID
 * @returns Array of notifications sorted by created_date DESC
 */
export async function getNotificationsForUser(
  effectiveUserId: string | null
): Promise<Notification[]> {
  if (!effectiveUserId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch notifications:", error.message);
      return [];
    }

    return (data as Notification[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching notifications:", err);
    return [];
  }
}

/**
 * Create a notification.
 *
 * @param input - The notification input
 * @returns The created notification or null
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<Notification | null> {
  if (!input.user_id || !input.title || !input.body) {
    console.warn("createNotification: Missing required fields");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: input.user_id,
        title: input.title,
        body: input.body,
        type: input.type,
        metadata: input.metadata || {},
        read: input.read ?? false,
        read_at: null,
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create notification:", error.message);
      return null;
    }

    return data as Notification;
  } catch (err) {
    console.warn("Unexpected error creating notification:", err);
    return null;
  }
}

/**
 * Mark a notification as read.
 *
 * @param notificationId - The notification ID
 * @returns Success boolean
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<boolean> {
  if (!notificationId) {
    return false;
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId);

    if (error) {
      console.warn("Failed to mark notification as read:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("Unexpected error marking notification as read:", err);
    return false;
  }
}

/**
 * Delete a notification.
 *
 * @param notificationId - The notification ID
 * @returns Success boolean
 */
export async function deleteNotification(
  notificationId: string
): Promise<boolean> {
  if (!notificationId) {
    return false;
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    if (error) {
      console.warn("Failed to delete notification:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("Unexpected error deleting notification:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER UPDATE NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Order update event types.
 */
export type OrderUpdateEvent =
  | "payment_confirmed"  // Payment succeeded (via Stripe webhook)
  | "order_completed";   // Order picked up / fulfilled

/**
 * Input for creating an order update notification.
 */
export interface OrderUpdateNotificationInput {
  buyerUserId: string;
  orderId: string;
  sellerId?: string;
  sellerName?: string;
  batchId?: string;
  event: OrderUpdateEvent;
}

/**
 * Create an order update notification with idempotency.
 *
 * Idempotency: Checks for existing notification with same order_id and event
 * in metadata to prevent duplicates.
 *
 * @param input - The order update input
 * @returns The created notification or null (if duplicate or error)
 */
export async function createOrderUpdateNotification(
  input: OrderUpdateNotificationInput
): Promise<Notification | null> {
  const { buyerUserId, orderId, sellerId, sellerName, batchId, event } = input;

  if (!buyerUserId || !orderId) {
    console.warn("createOrderUpdateNotification: Missing required fields");
    return null;
  }

  try {
    // ─────────────────────────────────────────────────────────────────────
    // IDEMPOTENCY CHECK: Prevent duplicate notifications for same event
    // ─────────────────────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", buyerUserId)
      .eq("type", "order_update")
      .contains("metadata", { order_id: orderId, event: event })
      .maybeSingle();

    if (existing) {
      // Duplicate notification - skip creation
      return null;
    }

    // Build notification content based on event
    let title: string;
    let body: string;

    switch (event) {
      case "payment_confirmed":
        title = "Payment Confirmed";
        body = sellerName
          ? `Your order from ${sellerName} is confirmed and is being prepared.`
          : "Your order is confirmed and is being prepared.";
        break;

      case "order_completed":
        title = "Order Completed";
        body = sellerName
          ? `Your order from ${sellerName} has been marked picked up.`
          : "Your order has been marked picked up.";
        break;

      default:
        title = "Order Update";
        body = "Your order status has been updated.";
    }

    // Create notification
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: buyerUserId,
        title,
        body,
        type: "order_update",
        metadata: {
          order_id: orderId,
          seller_id: sellerId,
          seller_name: sellerName,
          batch_id: batchId,
          event,
        },
        read: false,
        read_at: null,
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create order update notification:", error.message);
      return null;
    }

    return data as Notification;
  } catch (err) {
    console.warn("Unexpected error creating order update notification:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW REQUEST NOTIFICATIONS (Base44 parity)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for creating a review request notification.
 */
export interface ReviewRequestNotificationInput {
  buyerUserId: string;
  sellerId: string;
  sellerName: string;
  orderId: string;
  batchId: string;
}

/**
 * Create a review request notification.
 *
 * This is called from completeBatchPickup in fulfillment.ts.
 * Kept as a separate function for clarity and Base44 parity.
 *
 * @param input - The review request input
 * @returns The created notification or null
 */
export async function createReviewRequestNotification(
  input: ReviewRequestNotificationInput
): Promise<Notification | null> {
  const { buyerUserId, sellerId, sellerName, orderId, batchId } = input;

  if (!buyerUserId || !sellerId || !orderId) {
    console.warn("createReviewRequestNotification: Missing required fields");
    return null;
  }

  // Check for existing review request for this batch
  try {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", buyerUserId)
      .eq("type", "review_request")
      .contains("metadata", { batch_id: batchId })
      .maybeSingle();

    if (existing) {
      // Already sent review request for this batch
      return null;
    }
  } catch {
    // Continue with creation attempt
  }

  return createNotification({
    user_id: buyerUserId,
    title: "Leave a Review",
    body: `Your order from ${sellerName} is complete. Tap to leave a review.`,
    type: "review_request",
    metadata: {
      seller_id: sellerId,
      seller_name: sellerName,
      order_id: orderId,
      batch_id: batchId,
    },
    read: false,
  });
}
