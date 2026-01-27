/**
 * Notifications API
 *
 * Provides queries and mutations for notification data.
 * Supports order lifecycle notifications (order_update, review_request).
 * Uses effectiveUserId for proper data scoping (supports admin impersonation).
 *
 * ORDER VALIDATION REGIME:
 * Notifications are validated by checking if the referenced order EXISTS,
 * not by checking order status. This allows refund notifications to appear
 * in feeds even when order status is "refunded" or "cancelled".
 */

import { supabase } from "@/lib/supabase/supabaseClient";

/**
 * Supported notification types (Base44 parity + pickup flow).
 */
export type NotificationType =
  | "order_update"      // Order lifecycle events (payment confirmed, order completed)
  | "review_request"    // Request to leave a review after pickup
  | "pickup_completed"  // Order successfully picked up by buyer
  | "message"           // New message notification (placeholder - not wired yet)
  | "system";           // System announcements

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
  created_at: string;  // FIX: Use created_at (actual DB column) not created_date
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
 * Helper to detect if an error indicates Supabase is degraded (503/timeout).
 */
function isDegradedError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { message?: string; code?: string; status?: number; statusCode?: number };
  const msg = (err.message || "").toLowerCase();
  const code = err.code || "";
  const status = err.status || err.statusCode;
  
  return (
    status === 503 ||
    code === "503" ||
    msg.includes("503") ||
    msg.includes("upstream connect error") ||
    msg.includes("connection timeout") ||
    msg.includes("fetch failed") ||
    msg.includes("networkerror") ||
    msg.includes("failed to fetch")
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION ORDER VALIDATION (DECOUPLED FROM ACTIVE ORDERS FILTER)
// ═══════════════════════════════════════════════════════════════════════════════
// Notifications are validated by checking if the referenced order EXISTS,
// NOT by checking if the order is in an "active" status.
// This allows refund notifications (order status = "refunded") to appear in feeds.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an order exists for notification validation purposes.
 * 
 * IMPORTANT: This function intentionally does NOT apply status filters.
 * It only checks if the order row exists in the database.
 * This decouples notification visibility from the Active Orders filter
 * (applyValidOrderStatusFilter), allowing notifications for refunded orders
 * to appear in the buyer's feed.
 * 
 * @param orderId - The order ID to check
 * @returns true if order exists, false otherwise
 */
async function orderExistsForNotification(orderId: string): Promise<boolean> {
  if (!orderId) return false;

  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.warn("[Notifications] order existence check failed:", error.message);
    return false;
  }

  return !!data;
}

/**
 * Filter notifications to exclude those tied to non-existent orders.
 *
 * - If notification.metadata.order_id exists, check if order exists (any status)
 * - If order does not exist, exclude notification
 * - Notifications without order_id are always included
 * 
 * NOTE: This does NOT filter by order status. Refunded/cancelled order
 * notifications are intentionally allowed through to the feed.
 */
async function filterNotificationsByValidOrders(
  notifications: Notification[]
): Promise<Notification[]> {
  const filtered: Notification[] = [];
  
  for (const notification of notifications) {
    const orderId = notification.metadata?.order_id as string | undefined;
    
    // No order_id — keep the notification
    if (!orderId) {
      filtered.push(notification);
      continue;
    }
    
    // Has order_id — check if order exists (status-agnostic)
    const exists = await orderExistsForNotification(orderId);
    if (exists) {
      filtered.push(notification);
    }
    // If order does not exist, skip this notification
  }
  
  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION COLLAPSE (READ-TIME PROJECTION)
// ═══════════════════════════════════════════════════════════════════════════════
// Option A: Non-destructive collapse at read time; preserves DB audit trail.
// UI is a projection — collapse groups of related notifications into one.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Collapse notifications into a deduplicated projection for UI display.
 *
 * Rules:
 * - Collapse by (type + order_id/batch_id) for specific types only
 * - Prefer newest UNREAD notification in each group; else newest overall
 * - For order_update: terminal "completed" state dominates over "fulfilled"
 * - Other types pass through unchanged
 * - Preserves newest-first ordering
 */
function collapseNotifications(notifications: Notification[]): Notification[] {
  // Group notifications by collapse key
  const groups = new Map<string, Notification[]>();
  const passThrough: Notification[] = [];

  for (const notification of notifications) {
    const key = getCollapseKey(notification);
    
    if (key === null) {
      // Non-collapsible — pass through as-is
      passThrough.push(notification);
    } else {
      // Add to collapse group
      const group = groups.get(key) || [];
      group.push(notification);
      groups.set(key, group);
    }
  }

  // Select one representative from each group
  const collapsed: Notification[] = [];

  for (const [key, group] of groups) {
    const selected = selectFromGroup(key, group);
    if (selected) {
      collapsed.push(selected);
    }
  }

  // Combine collapsed + passThrough, sort by created_at DESC
  const all = [...collapsed, ...passThrough];
  all.sort((a, b) => {
    const timeA = Date.parse(a.created_at) || 0;
    const timeB = Date.parse(b.created_at) || 0;
    return timeB - timeA; // Newest first
  });

  return all;
}

/**
 * Generate collapse key for a notification.
 * Returns null if notification should not be collapsed.
 */
function getCollapseKey(notification: Notification): string | null {
  const { type, metadata } = notification;

  // Defensive extraction — only use if string
  const orderId = typeof metadata?.order_id === "string" ? metadata.order_id : null;
  const batchId = typeof metadata?.batch_id === "string" ? metadata.batch_id : null;

  switch (type) {
    case "order_update":
      // Collapse by order_id
      return orderId ? `order_update:${orderId}` : null;

    case "review_request":
      // Collapse by batch_id
      return batchId ? `review_request:${batchId}` : null;

    case "pickup_completed":
      // Collapse by batch_id
      return batchId ? `pickup_completed:${batchId}` : null;

    default:
      // Do not collapse other types
      return null;
  }
}

/**
 * Select one representative notification from a collapse group.
 *
 * Selection rules:
 * 1. For order_update: if any notification is "completed", only consider completed ones
 * 2. Read-state dominance: if ANY notification is read, select newest (suppress unread siblings)
 * 3. Only if ALL are unread: prefer newest unread
 * 4. Else choose newest overall
 */
function selectFromGroup(key: string, group: Notification[]): Notification | null {
  if (group.length === 0) return null;
  if (group.length === 1) return group[0];

  let candidates = group;

  // Special handling for order_update: terminal "completed" dominance
  if (key.startsWith("order_update:")) {
    const completedOnes = group.filter((n) => {
      const event = n.metadata?.event;
      const status = n.metadata?.status;
      return event === "completed" || event === "order_completed" || status === "completed";
    });

    // If any completed exists, only consider those
    if (completedOnes.length > 0) {
      candidates = completedOnes;
    }
  }

  // Read-state dominance: once any notification in a group is read,
  // suppress unread siblings from reappearing in the projection.
  const anyRead = candidates.some((n) => n.read);
  if (anyRead) {
    // Group has been "acknowledged" — just return newest, ignore read flag
    return getNewest(candidates);
  }

  // All notifications in group are unread — prefer newest unread
  const unread = candidates.filter((n) => !n.read);
  if (unread.length > 0) {
    return getNewest(unread);
  }

  // Fallback: newest overall
  return getNewest(candidates);
}

/**
 * Get the newest notification by created_at.
 */
function getNewest(notifications: Notification[]): Notification | null {
  if (notifications.length === 0) return null;

  return notifications.reduce((newest, current) => {
    const newestTime = Date.parse(newest.created_at) || 0;
    const currentTime = Date.parse(current.created_at) || 0;
    return currentTime > newestTime ? current : newest;
  });
}

/**
 * Get the count of unread notifications for a user.
 *
 * @param effectiveUserId - The effective user ID (resolved upstream, supports impersonation)
 * @returns The count of unread notifications, or null if fetch failed (degraded/503)
 *
 * This function:
 * - Returns 0 for logged-out users
 * - Returns null on 503/timeout (caller should NOT interpret as "0 unread")
 * - Excludes notifications tied to invalid orders (same rules as feed)
 * - Safe for polling
 */
export async function getUnreadNotificationCount(
  effectiveUserId: string | null
): Promise<number | null> {
  // Return 0 immediately for logged-out users
  if (!effectiveUserId) {
    return 0;
  }

  try {
    // Fetch unread notifications with lightweight columns for filtering
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, read, read_at, metadata, created_at")
      .eq("user_id", effectiveUserId)
      .eq("read", false)
      .order("created_at", { ascending: false });

    if (error) {
      // Check if degraded - return null instead of 0
      if (isDegradedError(error)) {
        console.warn("[Notifications] Supabase degraded (503/timeout) - returning null");
        return null;
      }
      console.warn("Failed to fetch unread notification count:", error.message);
      return null; // Return null on error, not 0
    }

    // Apply valid-order filter to match feed exclusion rules
    const filtered = await filterNotificationsByValidOrders((data as Notification[]) ?? []);
    return filtered.length;
  } catch (err) {
    // Check if degraded - return null instead of 0
    if (isDegradedError(err)) {
      console.warn("[Notifications] Supabase degraded (503/timeout) - returning null");
      return null;
    }
    console.warn("Unexpected error fetching unread notification count:", err);
    return null; // Return null on error, not 0
  }
}

/**
 * Get all notifications for a user.
 *
 * @param effectiveUserId - The effective user ID
 * @returns Array of notifications sorted by created_at DESC
 *
 * VALID ORDER REGIME:
 * Excludes notifications tied to invalid orders (same rules as unread count).
 *
 * COLLAPSE REGIME (Option A):
 * Non-destructive collapse at read time; preserves DB audit trail.
 * Groups related notifications and returns one representative per group.
 */
export async function getNotificationsForUser(
  effectiveUserId: string | null
): Promise<Notification[]> {
  if (!effectiveUserId) {
    return [];
  }

  try {
    // FIX: Use created_at (actual DB column) not created_date
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch notifications:", error.message);
      return [];
    }

    // Apply valid-order filter to exclude notifications tied to invalid orders
    const filtered = await filterNotificationsByValidOrders((data as Notification[]) ?? []);

    // Option A: non-destructive collapse at read time; preserves DB audit trail.
    const collapsed = collapseNotifications(filtered);
    return collapsed;
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
    // INSERT ONLY - no .select() to avoid RLS SELECT failure
    // when seller creates notification for buyer
    const { error } = await supabase
      .from("notifications")
      .insert({
        user_id: input.user_id,
        title: input.title,
        body: input.body,
        type: input.type,
        metadata: input.metadata || {},
        read: input.read ?? false,
        read_at: null,
      });

    if (error) {
      console.warn("Failed to create notification:", error.message);
      return null;
    }

    return null; // Intentionally not returning row (RLS prevents cross-user SELECT)
  } catch (err) {
    console.warn("Unexpected error creating notification:", err);
    return null;
  }
}

/**
 * Mark a notification as read.
 *
 * DURABLE READ STATE:
 * Sets BOTH read = true AND read_at = now() to ensure persistence.
 * Filters by BOTH id AND user_id for security.
 *
 * @param notificationId - The notification ID
 * @param userId - The user ID (for additional safety)
 * @returns Success boolean
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId?: string
): Promise<boolean> {
  if (!notificationId) {
    return false;
  }

  try {
    let query = supabase
      .from("notifications")
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId);

    // Add user_id filter for safety if provided
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { error } = await query;

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

    // INSERT ONLY - no .select() to avoid RLS SELECT failure
    // when seller creates notification for buyer
    const { error } = await supabase
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
      });

    if (error) {
      console.warn("Failed to create order update notification:", error.message);
      return null;
    }

    return null; // Intentionally not returning row (RLS prevents cross-user SELECT)
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

// ─────────────────────────────────────────────────────────────────────────────
// PICKUP COMPLETED NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for creating a pickup completed notification.
 */
export interface PickupCompletedNotificationInput {
  buyerUserId: string;
  sellerId: string;
  sellerName: string;
  batchId: string;
  showId?: string;
}

/**
 * Create a pickup completed notification for the buyer.
 *
 * This is called from completeBatchPickup in fulfillment.ts after
 * successful pickup verification.
 *
 * Idempotency: Checks for existing notification with same batch_id
 * to prevent duplicates.
 *
 * @param input - The pickup completed input
 * @returns The created notification or null
 */
export async function createPickupCompletedNotification(
  input: PickupCompletedNotificationInput
): Promise<Notification | null> {
  const { buyerUserId, sellerId, sellerName, batchId, showId } = input;

  if (!buyerUserId || !batchId) {
    console.warn("createPickupCompletedNotification: Missing required fields");
    return null;
  }

  try {
    // ─────────────────────────────────────────────────────────────────────
    // IDEMPOTENCY CHECK: Prevent duplicate pickup notifications
    // ─────────────────────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", buyerUserId)
      .eq("type", "pickup_completed")
      .contains("metadata", { batch_id: batchId })
      .maybeSingle();

    if (existing) {
      // Already notified about this pickup
      return null;
    }

    // INSERT ONLY - no .select() to avoid RLS SELECT failure
    // when seller creates notification for buyer
    const { error } = await supabase
      .from("notifications")
      .insert({
        user_id: buyerUserId,
        title: "Order picked up",
        body: sellerName
          ? `Your order from ${sellerName} has been successfully picked up.`
          : "Your order has been successfully picked up.",
        type: "pickup_completed",
        metadata: {
          batch_id: batchId,
          seller_id: sellerId,
          seller_name: sellerName,
          show_id: showId,
          related_id: batchId,
          related_type: "batch",
        },
        read: false,
        read_at: null,
      });

    if (error) {
      console.warn("Failed to create pickup completed notification:", error.message);
      return null;
    }

    return null; // Intentionally not returning row (RLS prevents cross-user SELECT)
  } catch (err) {
    console.warn("Unexpected error creating pickup completed notification:", err);
    return null;
  }
}
