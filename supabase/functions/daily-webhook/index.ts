/**
 * Supabase Edge Function: daily-webhook
 *
 * Handles Daily.co webhook events to track real-time viewer counts.
 *
 * Events handled:
 * - participant.joined → Increment viewer_count (if not owner)
 * - participant.left → Decrement viewer_count (if not owner)
 *
 * SAFETY GUARANTEES:
 * - NEVER touches public.shows table (viewer stats are isolated)
 * - NEVER throws on non-critical errors (always ACKs with 200)
 * - Uses service role for DB writes (bypasses RLS)
 * - Idempotent via UPSERT pattern
 * - Owner (host) is excluded from viewer counts
 *
 * SECURITY:
 * - Verifies x-webhook-secret header before processing
 * - Returns 401 only on signature failure (to trigger Daily retries)
 * - Returns 200 on all other cases (ACK to prevent retries)
 *
 * DEPENDENCIES:
 * - Table: public.show_realtime_stats (see migration)
 * - RPC: increment_show_viewer_count(p_show_id UUID)
 * - RPC: decrement_show_viewer_count(p_show_id UUID)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════════════════
// CORS headers (required for Supabase Edge Functions)
// ═══════════════════════════════════════════════════════════════════════════════
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Event types we handle (Daily uses dot-notation for webhooks)
// ═══════════════════════════════════════════════════════════════════════════════
const HANDLED_EVENTS = ["participant.joined", "participant.left"] as const;
type HandledEvent = (typeof HANDLED_EVENTS)[number];

// ═══════════════════════════════════════════════════════════════════════════════
// Type definitions for Daily webhook payload
// ═══════════════════════════════════════════════════════════════════════════════
interface DailyWebhookPayload {
  version?: string;
  type?: string;
  id?: string;
  event_ts?: number;
  payload?: {
    room?: string;
    session_id?: string;
    user_id?: string;
    user_name?: string;
    owner?: boolean;
    joined_at?: number;
    duration?: number;
    permissions?: {
      hasPresence?: boolean;
    };
  };
}

serve(async (req: Request) => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // [DAILY_WEBHOOK_AUDIT] TOP OF HANDLER - Log request metadata
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log("[DAILY_WEBHOOK_AUDIT] ════════════════════════════════════════════");
  console.log("[DAILY_WEBHOOK_AUDIT] REQUEST RECEIVED");
  console.log("[DAILY_WEBHOOK_AUDIT] Method:", req.method);
  console.log("[DAILY_WEBHOOK_AUDIT] URL:", req.url);
  
  // Log all headers
  const headersObj: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersObj[key] = key.toLowerCase().includes("secret") ? "[REDACTED]" : value;
  });
  console.log("[DAILY_WEBHOOK_AUDIT] Headers:", JSON.stringify(headersObj, null, 2));

  // ─────────────────────────────────────────────────────────────────────────────
  // CORS preflight
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    console.log("[DAILY_WEBHOOK_AUDIT] CORS preflight - returning ok");
    return new Response("ok", { headers: corsHeaders });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Read environment variables
  // ─────────────────────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dailyWebhookSecret = Deno.env.get("DAILY_WEBHOOK_SECRET");

  console.log("[DAILY_WEBHOOK_AUDIT] Env check - SUPABASE_URL:", !!supabaseUrl);
  console.log("[DAILY_WEBHOOK_AUDIT] Env check - SUPABASE_SERVICE_ROLE_KEY:", !!supabaseServiceKey);
  console.log("[DAILY_WEBHOOK_AUDIT] Env check - DAILY_WEBHOOK_SECRET:", !!dailyWebhookSecret);

  // Missing env vars = server misconfiguration, but ACK to prevent infinite retries
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[daily-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Missing env vars (SUPABASE_URL or SERVICE_ROLE_KEY)");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!dailyWebhookSecret) {
    console.error("[daily-webhook] Missing DAILY_WEBHOOK_SECRET");
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Missing DAILY_WEBHOOK_SECRET");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Verify webhook signature
  // Daily uses a shared secret in x-webhook-secret header
  // CRITICAL: Return 401 on signature failure to signal Daily to retry later
  // ─────────────────────────────────────────────────────────────────────────────
  const providedSecret = req.headers.get("x-webhook-secret");
  console.log("[DAILY_WEBHOOK_AUDIT] Secret provided:", !!providedSecret);
  console.log("[DAILY_WEBHOOK_AUDIT] Secret matches:", providedSecret === dailyWebhookSecret);

  if (providedSecret !== dailyWebhookSecret) {
    console.error("[daily-webhook] Invalid webhook secret");
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Invalid webhook secret (401)");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: Parse request body safely
  // If parsing fails, ACK with 200 (malformed payload, don't retry)
  // ─────────────────────────────────────────────────────────────────────────────
  let body: DailyWebhookPayload;
  let rawBody: string;
  try {
    rawBody = await req.text();
    console.log("[DAILY_WEBHOOK_AUDIT] Raw body (before parse):", rawBody);
    body = JSON.parse(rawBody);
  } catch {
    // Malformed JSON - ACK to prevent retries
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Malformed JSON - parse failed");
    return new Response(
      JSON.stringify({ received: true, skipped: "malformed_json" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // [DAILY_WEBHOOK_AUDIT] AFTER PARSE - Log parsed payload
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log("[DAILY_WEBHOOK_AUDIT] ────────────────────────────────────────────");
  console.log("[DAILY_WEBHOOK_AUDIT] PARSED PAYLOAD");
  console.log("[DAILY_WEBHOOK_AUDIT] event.type:", body.type);
  console.log("[DAILY_WEBHOOK_AUDIT] event.id:", body.id);
  console.log("[DAILY_WEBHOOK_AUDIT] event.version:", body.version);
  console.log("[DAILY_WEBHOOK_AUDIT] event.event_ts:", body.event_ts);
  console.log("[DAILY_WEBHOOK_AUDIT] payload.room:", body.payload?.room);
  console.log("[DAILY_WEBHOOK_AUDIT] payload.owner:", body.payload?.owner);
  console.log("[DAILY_WEBHOOK_AUDIT] payload.session_id:", body.payload?.session_id);
  console.log("[DAILY_WEBHOOK_AUDIT] payload.user_id:", body.payload?.user_id);
  console.log("[DAILY_WEBHOOK_AUDIT] payload.user_name:", body.payload?.user_name);
  console.log("[DAILY_WEBHOOK_AUDIT] payload.permissions:", JSON.stringify(body.payload?.permissions));
  console.log("[DAILY_WEBHOOK_AUDIT] FULL PARSED BODY:", JSON.stringify(body, null, 2));

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4: Check event type
  // Only process participant.joined and participant.left
  // ACK all other events silently
  // ─────────────────────────────────────────────────────────────────────────────
  const eventType = body.type;

  if (!eventType || !HANDLED_EVENTS.includes(eventType as HandledEvent)) {
    // Unknown or unhandled event type - ACK silently
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Unhandled event type");
    console.log("[DAILY_WEBHOOK_AUDIT]   event.id:", body.id);
    console.log("[DAILY_WEBHOOK_AUDIT]   event.type:", eventType);
    console.log("[DAILY_WEBHOOK_AUDIT]   reason: not in HANDLED_EVENTS", HANDLED_EVENTS);
    return new Response(
      JSON.stringify({ received: true, skipped: "unhandled_event_type", type: eventType }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 5: Extract payload fields
  // ─────────────────────────────────────────────────────────────────────────────
  const payload = body.payload;

  if (!payload) {
    // Missing payload - ACK to prevent retries
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Missing payload");
    console.log("[DAILY_WEBHOOK_AUDIT]   event.id:", body.id);
    console.log("[DAILY_WEBHOOK_AUDIT]   event.type:", eventType);
    console.log("[DAILY_WEBHOOK_AUDIT]   reason: payload is null/undefined");
    return new Response(
      JSON.stringify({ received: true, skipped: "missing_payload" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const roomName = payload.room;
  const isOwner = payload.owner;

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 6: Exclude owner (host) from viewer counts
  // The seller broadcasting the show should not count as a viewer
  // ─────────────────────────────────────────────────────────────────────────────
  if (isOwner === true) {
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Owner excluded");
    console.log("[DAILY_WEBHOOK_AUDIT]   event.id:", body.id);
    console.log("[DAILY_WEBHOOK_AUDIT]   event.type:", eventType);
    console.log("[DAILY_WEBHOOK_AUDIT]   reason: payload.owner === true");
    return new Response(
      JSON.stringify({ received: true, skipped: "owner_excluded" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 7: Validate and parse room name
  // Our convention: room_name = "show_{show_id}"
  // ─────────────────────────────────────────────────────────────────────────────
  if (!roomName || typeof roomName !== "string") {
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Missing room");
    console.log("[DAILY_WEBHOOK_AUDIT]   event.id:", body.id);
    console.log("[DAILY_WEBHOOK_AUDIT]   event.type:", eventType);
    console.log("[DAILY_WEBHOOK_AUDIT]   reason: roomName is null/undefined or not a string");
    return new Response(
      JSON.stringify({ received: true, skipped: "missing_room" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!roomName.startsWith("show_")) {
    // Room doesn't match our naming convention - might be a test room
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Unknown room format");
    console.log("[DAILY_WEBHOOK_AUDIT]   event.id:", body.id);
    console.log("[DAILY_WEBHOOK_AUDIT]   event.type:", eventType);
    console.log("[DAILY_WEBHOOK_AUDIT]   roomName:", roomName);
    console.log("[DAILY_WEBHOOK_AUDIT]   reason: does not start with 'show_'");
    return new Response(
      JSON.stringify({ received: true, skipped: "unknown_room_format" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const showId = roomName.replace("show_", "");

  // Basic UUID validation (loose check)
  if (!showId || showId.length < 10) {
    console.log("[DAILY_WEBHOOK_AUDIT] EARLY RETURN: Invalid show_id");
    console.log("[DAILY_WEBHOOK_AUDIT]   event.id:", body.id);
    console.log("[DAILY_WEBHOOK_AUDIT]   event.type:", eventType);
    console.log("[DAILY_WEBHOOK_AUDIT]   showId:", showId);
    console.log("[DAILY_WEBHOOK_AUDIT]   reason: showId too short (< 10 chars)");
    return new Response(
      JSON.stringify({ received: true, skipped: "invalid_show_id" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[DAILY_WEBHOOK_AUDIT] ────────────────────────────────────────────");
  console.log("[DAILY_WEBHOOK_AUDIT] VALIDATION PASSED - Proceeding to RPC");
  console.log("[DAILY_WEBHOOK_AUDIT]   show_id:", showId);
  console.log("[DAILY_WEBHOOK_AUDIT]   event.type:", eventType);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 8: Initialize Supabase client with service role
  // Service role bypasses RLS for server-side writes
  // ─────────────────────────────────────────────────────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 9: Update show_realtime_stats based on event type
  //
  // CRITICAL: We ONLY touch show_realtime_stats, NEVER public.shows
  //
  // Uses database RPC functions for atomic increment/decrement:
  // - increment_show_viewer_count: Atomically adds 1, updates max_viewers
  // - decrement_show_viewer_count: Atomically subtracts 1 (floor at 0)
  //
  // These functions use INSERT ... ON CONFLICT for idempotent upsert behavior.
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    if (eventType === "participant.joined") {
      // ═══════════════════════════════════════════════════════════════════════
      // INCREMENT: viewer_count += 1, max_viewers = GREATEST(max_viewers, new_count)
      // ═══════════════════════════════════════════════════════════════════════
      console.log("[DAILY_WEBHOOK_AUDIT] ════════════════════════════════════════════");
      console.log("[DAILY_WEBHOOK_AUDIT] APPLYING VIEWER MUTATION");
      console.log("[DAILY_WEBHOOK_AUDIT]   operation: INCREMENT");
      console.log("[DAILY_WEBHOOK_AUDIT]   show_id:", showId);
      console.log("[DAILY_WEBHOOK_AUDIT]   rpc: increment_show_viewer_count");

      const { data, error } = await supabase.rpc("increment_show_viewer_count", {
        p_show_id: showId,
      });

      console.log("[DAILY_WEBHOOK_AUDIT] RPC RESPONSE (increment):");
      console.log("[DAILY_WEBHOOK_AUDIT]   data:", JSON.stringify(data));
      console.log("[DAILY_WEBHOOK_AUDIT]   error:", error ? JSON.stringify(error) : "null");

      if (error) {
        // Log error but still ACK (don't cause infinite retries)
        console.error("[daily-webhook] increment_show_viewer_count error:", error.message);
      }
    } else if (eventType === "participant.left") {
      // ═══════════════════════════════════════════════════════════════════════
      // DECREMENT: viewer_count = GREATEST(viewer_count - 1, 0)
      // ═══════════════════════════════════════════════════════════════════════
      console.log("[DAILY_WEBHOOK_AUDIT] ════════════════════════════════════════════");
      console.log("[DAILY_WEBHOOK_AUDIT] APPLYING VIEWER MUTATION");
      console.log("[DAILY_WEBHOOK_AUDIT]   operation: DECREMENT");
      console.log("[DAILY_WEBHOOK_AUDIT]   show_id:", showId);
      console.log("[DAILY_WEBHOOK_AUDIT]   rpc: decrement_show_viewer_count");

      const { data, error } = await supabase.rpc("decrement_show_viewer_count", {
        p_show_id: showId,
      });

      console.log("[DAILY_WEBHOOK_AUDIT] RPC RESPONSE (decrement):");
      console.log("[DAILY_WEBHOOK_AUDIT]   data:", JSON.stringify(data));
      console.log("[DAILY_WEBHOOK_AUDIT]   error:", error ? JSON.stringify(error) : "null");

      if (error) {
        // Log error but still ACK
        console.error("[daily-webhook] decrement_show_viewer_count error:", error.message);
      }
    }
  } catch (err) {
    // Unexpected error - log but ACK to prevent retries
    console.error("[daily-webhook] Unexpected error:", err);
    console.log("[DAILY_WEBHOOK_AUDIT] UNEXPECTED ERROR in RPC block:", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 10: Return 200 OK
  // Always ACK the webhook to prevent Daily from retrying
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("[DAILY_WEBHOOK_AUDIT] ════════════════════════════════════════════");
  console.log("[DAILY_WEBHOOK_AUDIT] SUCCESS - Returning 200 OK");
  console.log("[DAILY_WEBHOOK_AUDIT]   event:", eventType);
  console.log("[DAILY_WEBHOOK_AUDIT]   show_id:", showId);

  return new Response(
    JSON.stringify({
      received: true,
      event: eventType,
      show_id: showId,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
