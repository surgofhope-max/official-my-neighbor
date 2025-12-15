/**
 * Messages API
 *
 * Provides queries and mutations for message data.
 * Mirrors Base44 behavior exactly - polling only, no WebSockets.
 *
 * Base44 Parity:
 * - Impersonation handled first in every query
 * - read_by_buyer / read_by_seller per message
 * - Bulk mark as read when opening conversation
 * - No read receipts
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "buyer" | "seller" | "system";
  body: string;
  message_type?: "text" | "pickup_ready" | "pickup_confirmed" | "order_update";
  read_by_buyer: boolean;
  read_by_seller: boolean;
  read_at?: string;
  created_date: string;
}

export interface GetUnreadMessageCountParams {
  effectiveUserId: string | null;
  effectiveSellerId: string | null;
  role: "buyer" | "seller";
}

/**
 * Get the total count of unread messages across all conversations.
 *
 * @param params - The effective user context and role
 * @returns The total unread message count, or 0 if logged out or on error
 *
 * This function:
 * - Never throws
 * - Returns 0 for logged-out users
 * - Returns 0 on any error
 * - Safe for polling
 * - Respects admin impersonation via effectiveUserId/effectiveSellerId
 */
export async function getUnreadMessageCount(
  params: GetUnreadMessageCountParams
): Promise<number> {
  const { effectiveUserId, effectiveSellerId, role } = params;

  // Return 0 immediately for logged-out users
  if (!effectiveUserId) {
    return 0;
  }

  try {
    if (role === "seller") {
      // Seller: query conversations where seller_id matches
      if (!effectiveSellerId) {
        return 0;
      }

      const { data, error } = await supabase
        .from("conversations")
        .select("seller_unread_count")
        .eq("seller_id", effectiveSellerId)
        .eq("is_active", true);

      if (error) {
        console.warn("Failed to fetch seller unread message count:", error.message);
        return 0;
      }

      // Sum all seller_unread_count values
      const total = (data ?? []).reduce(
        (sum, conv) => sum + (conv.seller_unread_count ?? 0),
        0
      );
      return total;
    } else {
      // Buyer: query conversations where buyer_id matches
      const { data, error } = await supabase
        .from("conversations")
        .select("buyer_unread_count")
        .eq("buyer_id", effectiveUserId)
        .eq("is_active", true);

      if (error) {
        console.warn("Failed to fetch buyer unread message count:", error.message);
        return 0;
      }

      // Sum all buyer_unread_count values
      const total = (data ?? []).reduce(
        (sum, conv) => sum + (conv.buyer_unread_count ?? 0),
        0
      );
      return total;
    }
  } catch (err) {
    console.warn("Unexpected error fetching unread message count:", err);
    return 0;
  }
}

/**
 * Get messages for a conversation (Base44 parity).
 *
 * @param conversationId - The conversation ID
 * @returns Array of messages sorted by created_date ASC
 */
export async function getMessagesForConversation(
  conversationId: string | null
): Promise<Message[]> {
  if (!conversationId) return [];

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_date", { ascending: true });

    if (error) {
      console.warn("Failed to fetch messages:", error.message);
      return [];
    }

    return (data as Message[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching messages:", err);
    return [];
  }
}

/**
 * Send a message (Base44 parity).
 *
 * Creates a new message record.
 * Conversation update (last_message_at, unread count) is handled separately.
 *
 * QA HARDENING:
 * - Prevents empty/whitespace-only messages
 * - Validates all required inputs
 * - Never throws
 *
 * @param conversationId - The conversation ID
 * @param senderId - The sender's user ID
 * @param senderType - "buyer" or "seller"
 * @param body - The message body
 * @returns The created message or null
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  senderType: "buyer" | "seller",
  body: string
): Promise<Message | null> {
  // QA HARDENING: Validate all inputs
  if (!conversationId || !senderId || !senderType) {
    console.warn("sendMessage: Missing required parameters");
    return null;
  }

  // QA HARDENING: Prevent empty/whitespace-only messages
  const trimmedBody = (body || "").trim();
  if (!trimmedBody) {
    console.warn("sendMessage: Empty message body rejected");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        sender_type: senderType,
        body: trimmedBody,
        message_type: "text",
        read_by_buyer: senderType === "buyer", // Sender has read their own message
        read_by_seller: senderType === "seller",
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to send message:", error.message);
      return null;
    }

    return data as Message;
  } catch (err) {
    // QA HARDENING: Never throw
    console.warn("Unexpected error sending message:", err);
    return null;
  }
}

/**
 * Bulk mark messages as read (Base44 parity).
 *
 * Called when user opens a conversation.
 * - IF buyer: set read_by_buyer = true for all unread messages
 * - IF seller: set read_by_seller = true for all unread messages
 *
 * Only marks messages sent by the OTHER party.
 *
 * QA HARDENING:
 * - Safe if conversation doesn't exist (no-op)
 * - Never throws
 *
 * @param conversationId - The conversation ID
 * @param userType - "buyer" or "seller"
 */
export async function markMessagesAsRead(
  conversationId: string,
  userType: "buyer" | "seller"
): Promise<void> {
  // QA HARDENING: Validate inputs
  if (!conversationId || !userType) return;

  try {
    const readColumn = userType === "buyer" ? "read_by_buyer" : "read_by_seller";

    // QA HARDENING: Update query is safe even if no matching rows
    const { error } = await supabase
      .from("messages")
      .update({
        [readColumn]: true,
        read_at: new Date().toISOString(),
      })
      .eq("conversation_id", conversationId)
      .eq(readColumn, false)
      .neq("sender_type", userType); // Only mark messages from OTHER party

    // QA HARDENING: Log but don't throw on error
    if (error) {
      console.warn("Error in markMessagesAsRead:", error.message);
    }
  } catch (err) {
    // QA HARDENING: Never throw
    console.warn("Error marking messages as read:", err);
  }
}

/**
 * Create a system message (Base44 parity - schema ready only).
 *
 * System messages are used for:
 * - pickup_ready
 * - pickup_confirmed
 * - order_update
 *
 * @param conversationId - The conversation ID
 * @param messageType - The system message type
 * @param body - The message body
 * @returns The created message or null
 */
export async function createSystemMessage(
  conversationId: string,
  messageType: "pickup_ready" | "pickup_confirmed" | "order_update",
  body: string
): Promise<Message | null> {
  if (!conversationId || !body) return null;

  try {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: "system",
        sender_type: "system",
        body,
        message_type: messageType,
        read_by_buyer: false,
        read_by_seller: false,
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create system message:", error.message);
      return null;
    }

    return data as Message;
  } catch (err) {
    console.warn("Unexpected error creating system message:", err);
    return null;
  }
}
