/**
 * Live Show Chat API
 *
 * Provides ephemeral chat functionality for live shows.
 *
 * Features:
 * - Messages scoped to a show
 * - Only accessible while show is live
 * - No persistence after show ends (enforced by RLS)
 * - Simple text messages only
 *
 * This is separate from the persistent messaging system.
 */

import { supabase } from "@/lib/supabase/supabaseClient";
import { devLog, devWarn } from "@/utils/devLog";

/**
 * Live chat message
 */
export interface LiveChatMessage {
  id: string;
  show_id: string;
  sender_id: string;
  sender_role: "seller" | "viewer";
  message: string;
  created_at: string;
  // Enriched fields (added client-side)
  sender_name?: string;
  sender_avatar?: string;
}

/**
 * Result of fetching messages
 */
export interface GetMessagesResult {
  messages: LiveChatMessage[];
  error: string | null;
}

/**
 * Result of sending a message
 */
export interface SendMessageResult {
  message: LiveChatMessage | null;
  error: string | null;
}

/**
 * Get live chat messages for a show.
 *
 * Returns empty array if:
 * - Show is not live (RLS blocks access)
 * - No messages exist
 * - Error occurs
 *
 * @param showId - The show ID to get messages for
 * @param options - Optional query options
 * @returns Messages sorted chronologically (oldest first)
 *
 * Example:
 * ```typescript
 * const { messages, error } = await getLiveShowMessages("show-uuid");
 * ```
 */
export async function getLiveShowMessages(
  showId: string | null,
  options: {
    limit?: number;
    afterId?: string;
  } = {}
): Promise<GetMessagesResult> {
  devLog("[CHAT DEBUG] getLiveShowMessages - auth user:", await supabase.auth.getUser());
  devLog("[CHAT DEBUG] getLiveShowMessages - showId:", showId);

  if (!showId) {
    return { messages: [], error: null };
  }

  const { limit = 100, afterId } = options;

  try {
    let query = supabase
      .from("live_show_messages")
      .select("*")
      .eq("show_id", showId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // If afterId provided, only get messages after that one
    if (afterId) {
      // Get the created_at of the after message first
      const { data: afterMsg } = await supabase
        .from("live_show_messages")
        .select("created_at")
        .eq("id", afterId)
        .single();

      if (afterMsg) {
        query = query.gt("created_at", afterMsg.created_at);
      }
    }

    const { data, error } = await query;
    devLog("[CHAT DEBUG] getLiveShowMessages - query result:", { data, error });

    if (error) {
      // RLS error when show is not live - expected, return empty
      if (error.code === "PGRST301" || error.message.includes("RLS")) {
        return { messages: [], error: null };
      }
      devWarn("Failed to fetch live chat messages:", error.message);
      return { messages: [], error: error.message };
    }

    return {
      messages: (data as LiveChatMessage[]) || [],
      error: null,
    };
  } catch (err) {
    devWarn("Unexpected error fetching live chat messages:", err);
    return { messages: [], error: "Failed to load messages" };
  }
}

/**
 * Send a message to the live chat.
 *
 * Will fail if:
 * - User is not authenticated
 * - Show is not live (RLS blocks)
 * - Message is empty or too long
 *
 * @param showId - The show ID to send message to
 * @param message - The message text (max 500 chars)
 * @param senderRole - Role of the sender
 * @returns The sent message or error
 *
 * Example:
 * ```typescript
 * const { message, error } = await sendLiveShowMessage(
 *   "show-uuid",
 *   "Hello everyone!",
 *   "viewer"
 * );
 * ```
 */
export async function sendLiveShowMessage(
  showId: string,
  message: string,
  senderRole: "seller" | "viewer"
): Promise<SendMessageResult> {
  devLog("[CHAT DEBUG] sendLiveShowMessage - auth user:", await supabase.auth.getUser());
  devLog("[CHAT DEBUG] sendLiveShowMessage - showId:", showId, "senderRole:", senderRole);

  // Validate input
  const trimmedMessage = message.trim();
  
  if (!trimmedMessage) {
    return { message: null, error: "Message cannot be empty" };
  }

  if (trimmedMessage.length > 500) {
    return { message: null, error: "Message too long (max 500 characters)" };
  }

  if (!showId) {
    return { message: null, error: "Show ID is required" };
  }

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { message: null, error: "You must be logged in to chat" };
    }

    // Insert message
    const { data, error } = await supabase
      .from("live_show_messages")
      .insert({
        show_id: showId,
        sender_id: user.id,
        sender_role: senderRole,
        message: trimmedMessage,
      })
      .select()
      .single();
    devLog("[CHAT DEBUG] sendLiveShowMessage - insert result:", { data, error });

    if (error) {
      // RLS error when show is not live
      if (error.code === "PGRST301" || error.message.includes("RLS")) {
        return { message: null, error: "Chat is only available during live shows" };
      }
      devWarn("Failed to send live chat message:", error.message);
      return { message: null, error: "Failed to send message" };
    }

    return {
      message: data as LiveChatMessage,
      error: null,
    };
  } catch (err) {
    devWarn("Unexpected error sending live chat message:", err);
    return { message: null, error: "Failed to send message" };
  }
}

/**
 * Check if live chat is available for a show.
 *
 * AUTHORITATIVE: stream_status === "live" is the ONLY rule.
 *
 * @param showId - The show ID to check
 * @returns True if chat is available (stream_status === "live")
 */
export async function isLiveChatAvailable(showId: string): Promise<boolean> {
  if (!showId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("shows")
      .select("stream_status")
      .eq("id", showId)
      .single();

    if (error || !data) {
      return false;
    }

    // AUTHORITATIVE: Chat available during "starting" or "live"
    return data.stream_status === "live" || data.stream_status === "starting";
  } catch {
    return false;
  }
}

/**
 * Create a live chat poller.
 *
 * @param showId - The show ID to poll
 * @param onMessages - Callback when new messages arrive
 * @param options - Polling options
 * @returns Control functions
 *
 * Example:
 * ```typescript
 * const { start, stop } = createLiveChatPoller(
 *   "show-uuid",
 *   (messages) => setMessages(prev => [...prev, ...messages]),
 *   { interval: 2000 }
 * );
 *
 * start();
 * // On unmount:
 * stop();
 * ```
 */
export function createLiveChatPoller(
  showId: string,
  onMessages: (messages: LiveChatMessage[]) => void,
  options: { interval?: number } = {}
): {
  start: () => void;
  stop: () => void;
  poll: () => Promise<void>;
} {
  const { interval = 2000 } = options;

  let timer: number | null = null;
  let lastMessageId: string | null = null;
  let isPolling = false;

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;

    try {
      const { messages } = await getLiveShowMessages(showId, {
        limit: 50,
        afterId: lastMessageId || undefined,
      });

      if (messages.length > 0) {
        lastMessageId = messages[messages.length - 1].id;
        onMessages(messages);
      }
    } catch (err) {
      // Ignore polling errors
    } finally {
      isPolling = false;
    }
  };

  const start = () => {
    if (timer !== null) return;

    // Poll immediately for initial messages
    poll();

    // Then poll on interval
    timer = setInterval(poll, interval) as unknown as number;
  };

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    lastMessageId = null;
  };

  return { start, stop, poll };
}





