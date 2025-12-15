/**
 * Conversations API
 *
 * Provides queries and mutations for conversation data.
 * Mirrors Base44 behavior exactly - polling only, no WebSockets.
 *
 * Base44 Parity:
 * - Impersonation handled first in every query
 * - Unread counts are per-conversation (buyer_unread_count, seller_unread_count)
 * - Soft delete via is_active (no hard delete)
 * - Race conditions allowed (eventual consistency)
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface Conversation {
  id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at?: string;
  last_message_preview?: string;
  buyer_unread_count: number;
  seller_unread_count: number;
  is_active: boolean;
  created_date?: string;
}

export interface EnrichedConversation extends Conversation {
  seller_info?: {
    id: string;
    name: string;
    image_url?: string;
  };
  buyer_info?: {
    id: string;
    name: string;
    profile_image_url?: string;
  };
}

export interface ConversationContext {
  effectiveUserId: string | null;
  effectiveSellerId: string | null;
  userType: "buyer" | "seller";
  isImpersonating: boolean;
}

/**
 * Get conversations for inbox (Base44 parity).
 *
 * Query logic:
 * - IF buyer context: conversation.buyer_id = effectiveUserId
 * - IF seller context: conversation.seller_id = effectiveSellerId
 *   OR conversation.buyer_id = effectiveUserId (seller messaging other sellers)
 *
 * Sorted by last_message_at DESC.
 *
 * @param context - The effective user context (impersonation-aware)
 * @returns Array of conversations sorted by last_message_at DESC
 */
export async function getConversationsForInbox(
  context: ConversationContext
): Promise<EnrichedConversation[]> {
  const { effectiveUserId, effectiveSellerId, userType } = context;

  if (!effectiveUserId) {
    return [];
  }

  try {
    let conversations: Conversation[] = [];

    if (userType === "seller" && effectiveSellerId) {
      // Seller context: get conversations where they're the seller OR buyer
      // (sellers can also message other sellers as buyers)
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("is_active", true)
        .or(`seller_id.eq.${effectiveSellerId},buyer_id.eq.${effectiveUserId}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) {
        console.warn("Failed to fetch seller conversations:", error.message);
        return [];
      }

      conversations = (data as Conversation[]) ?? [];
    } else {
      // Buyer context: get conversations where they're the buyer
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("buyer_id", effectiveUserId)
        .eq("is_active", true)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) {
        console.warn("Failed to fetch buyer conversations:", error.message);
        return [];
      }

      conversations = (data as Conversation[]) ?? [];
    }

    // Enrich with seller and buyer info
    return await enrichConversations(conversations);
  } catch (err) {
    console.warn("Unexpected error fetching conversations:", err);
    return [];
  }
}

/**
 * Enrich conversations with seller and buyer details.
 */
async function enrichConversations(
  conversations: Conversation[]
): Promise<EnrichedConversation[]> {
  if (conversations.length === 0) return [];

  // Get unique seller and buyer IDs
  const sellerIds = [...new Set(conversations.map((c) => c.seller_id).filter(Boolean))];
  const buyerIds = [...new Set(conversations.map((c) => c.buyer_id).filter(Boolean))];

  // Fetch sellers
  let sellersMap: Record<string, { id: string; name: string; image_url?: string }> = {};
  if (sellerIds.length > 0) {
    const { data: sellers } = await supabase
      .from("sellers")
      .select("id, business_name, profile_image_url")
      .in("id", sellerIds);

    if (sellers) {
      sellersMap = sellers.reduce((acc, s) => {
        acc[s.id] = {
          id: s.id,
          name: s.business_name,
          image_url: s.profile_image_url,
        };
        return acc;
      }, {} as Record<string, { id: string; name: string; image_url?: string }>);
    }
  }

  // Fetch buyer profiles
  let buyersMap: Record<string, { id: string; name: string; profile_image_url?: string }> = {};
  if (buyerIds.length > 0) {
    const { data: buyers } = await supabase
      .from("buyer_profiles")
      .select("id, user_id, full_name, profile_image_url")
      .in("user_id", buyerIds);

    if (buyers) {
      buyersMap = buyers.reduce((acc, b) => {
        acc[b.user_id] = {
          id: b.id,
          name: b.full_name || "Buyer",
          profile_image_url: b.profile_image_url,
        };
        return acc;
      }, {} as Record<string, { id: string; name: string; profile_image_url?: string }>);
    }
  }

  // Enrich conversations
  return conversations.map((conv) => ({
    ...conv,
    seller_info: sellersMap[conv.seller_id] || null,
    buyer_info: buyersMap[conv.buyer_id] || {
      id: conv.buyer_id,
      name: "Buyer",
      profile_image_url: undefined,
    },
  }));
}

/**
 * Get a single conversation by ID.
 *
 * @param conversationId - The conversation ID
 * @returns The conversation or null
 */
export async function getConversationById(
  conversationId: string | null
): Promise<EnrichedConversation | null> {
  if (!conversationId) return null;

  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const enriched = await enrichConversations([data as Conversation]);
    return enriched[0] || null;
  } catch (err) {
    console.warn("Unexpected error fetching conversation:", err);
    return null;
  }
}

/**
 * Find or create a conversation between buyer and seller (Base44 parity).
 *
 * @param buyerId - The buyer's user ID
 * @param sellerId - The seller ID
 * @returns The existing or new conversation
 */
export async function findOrCreateConversation(
  buyerId: string,
  sellerId: string
): Promise<Conversation | null> {
  if (!buyerId || !sellerId) return null;

  try {
    // Check for existing conversation
    const { data: existing, error: findError } = await supabase
      .from("conversations")
      .select("*")
      .eq("buyer_id", buyerId)
      .eq("seller_id", sellerId)
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") {
      console.warn("Error finding conversation:", findError.message);
      return null;
    }

    if (existing) {
      // Reactivate if soft-deleted
      if (!existing.is_active) {
        const { data: reactivated, error: reactivateError } = await supabase
          .from("conversations")
          .update({ is_active: true })
          .eq("id", existing.id)
          .select()
          .single();

        if (reactivateError) {
          console.warn("Error reactivating conversation:", reactivateError.message);
          return existing as Conversation;
        }
        return reactivated as Conversation;
      }
      return existing as Conversation;
    }

    // Create new conversation
    const { data: created, error: createError } = await supabase
      .from("conversations")
      .insert({
        buyer_id: buyerId,
        seller_id: sellerId,
        buyer_unread_count: 0,
        seller_unread_count: 0,
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      console.warn("Error creating conversation:", createError.message);
      return null;
    }

    return created as Conversation;
  } catch (err) {
    console.warn("Unexpected error in findOrCreateConversation:", err);
    return null;
  }
}

/**
 * Reset unread count for a conversation (Base44 parity).
 *
 * Called when user opens a conversation.
 * - IF buyer: buyer_unread_count = 0
 * - IF seller: seller_unread_count = 0
 *
 * QA HARDENING:
 * - Safe if conversation doesn't exist (no-op)
 * - Never throws
 *
 * @param conversationId - The conversation ID
 * @param userType - "buyer" or "seller"
 */
export async function resetUnreadCount(
  conversationId: string,
  userType: "buyer" | "seller"
): Promise<void> {
  // QA HARDENING: Validate inputs
  if (!conversationId || !userType) return;

  try {
    const updates =
      userType === "buyer"
        ? { buyer_unread_count: 0 }
        : { seller_unread_count: 0 };

    // QA HARDENING: Check if conversation exists before updating
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!existing) {
      // Conversation doesn't exist - safe no-op
      return;
    }

    await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversationId);
  } catch (err) {
    // QA HARDENING: Never throw - log and continue
    console.warn("Error resetting unread count:", err);
  }
}

/**
 * Increment unread count for a conversation (Base44 parity).
 *
 * Called when a message is sent.
 * Increments the OTHER party's unread count.
 *
 * @param conversationId - The conversation ID
 * @param senderType - "buyer" or "seller"
 */
export async function incrementUnreadCount(
  conversationId: string,
  senderType: "buyer" | "seller"
): Promise<void> {
  if (!conversationId) return;

  try {
    // Get current count
    const { data: conv, error: fetchError } = await supabase
      .from("conversations")
      .select(senderType === "buyer" ? "seller_unread_count" : "buyer_unread_count")
      .eq("id", conversationId)
      .single();

    if (fetchError) {
      console.warn("Error fetching conversation for increment:", fetchError.message);
      return;
    }

    const currentCount =
      senderType === "buyer"
        ? conv?.seller_unread_count || 0
        : conv?.buyer_unread_count || 0;

    const updates =
      senderType === "buyer"
        ? { seller_unread_count: currentCount + 1 }
        : { buyer_unread_count: currentCount + 1 };

    await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversationId);
  } catch (err) {
    console.warn("Error incrementing unread count:", err);
  }
}

/**
 * Update conversation after sending a message (Base44 parity).
 *
 * Updates:
 * - last_message_at = now()
 * - last_message_preview = message body (first 100 chars)
 * - Increment other party's unread count
 *
 * QA HARDENING:
 * - Safe if conversation doesn't exist
 * - Never throws
 *
 * @param conversationId - The conversation ID
 * @param messageBody - The message body
 * @param senderType - "buyer" or "seller"
 */
export async function updateConversationOnSend(
  conversationId: string,
  messageBody: string,
  senderType: "buyer" | "seller"
): Promise<void> {
  // QA HARDENING: Validate inputs
  if (!conversationId || !senderType) return;

  try {
    // Get current unread count for the other party
    const { data: conv, error: fetchError } = await supabase
      .from("conversations")
      .select("buyer_unread_count, seller_unread_count")
      .eq("id", conversationId)
      .maybeSingle(); // QA HARDENING: Use maybeSingle to not throw if missing

    // QA HARDENING: Handle missing conversation gracefully
    if (fetchError || !conv) {
      console.warn("Conversation not found for update:", conversationId);
      return;
    }

    const updates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: (messageBody || "").substring(0, 100),
    };

    // Increment OTHER party's unread count
    if (senderType === "buyer") {
      updates.seller_unread_count = (conv?.seller_unread_count || 0) + 1;
    } else {
      updates.buyer_unread_count = (conv?.buyer_unread_count || 0) + 1;
    }

    await supabase.from("conversations").update(updates).eq("id", conversationId);
  } catch (err) {
    // QA HARDENING: Never throw - log and continue
    console.warn("Error updating conversation on send:", err);
  }
}

/**
 * Soft delete a conversation (Base44 parity).
 *
 * Sets is_active = false (no hard delete).
 *
 * @param conversationId - The conversation ID
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  if (!conversationId) return;

  try {
    await supabase
      .from("conversations")
      .update({ is_active: false })
      .eq("id", conversationId);
  } catch (err) {
    console.warn("Error deleting conversation:", err);
  }
}

