/**
 * Supabase Edge Function: stripe-webhook
 *
 * Handles Stripe webhook events to update order status and Connect account status.
 * This is the ONLY way orders can be marked as "paid".
 *
 * Events handled:
 * - payment_intent.succeeded → order status = "paid"
 * - payment_intent.payment_failed → order status = "payment_failed"
 * - payment_intent.canceled → restore inventory (if needed)
 * - account.updated → sync seller stripe_connected status
 * - capability.updated → sync seller stripe_connected status
 * - account.application.deauthorized → mark seller as disconnected
 *
 * QA HARDENING:
 * - Idempotency: If order is already paid, do nothing
 * - Safe batch updates: Never regress terminal statuses
 * - Defensive lookups: Handle missing order/batch/seller gracefully
 * - Notification deduplication: Already handled via metadata check
 * - Connect status sync: Only write when state actually changes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Terminal order statuses that should never be overwritten
const TERMINAL_ORDER_STATUSES = ["paid", "picked_up", "completed", "cancelled", "refunded"];

// Terminal batch statuses that should never be regressed
const TERMINAL_BATCH_STATUSES = ["picked_up", "completed", "cancelled"];

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeSecretKey) {
      console.error("[WEBHOOK] STRIPE_SECRET_KEY not configured");
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    
    if (!webhookSecret) {
      console.error("[WEBHOOK] STRIPE_WEBHOOK_SECRET not configured");
      throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Initialize Supabase with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // QA HARDENING: Validate signature header exists
    if (!signature) {
      console.error("[WEBHOOK] Missing stripe-signature header");
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      // QA HARDENING: Clean error handling for signature failures
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[WEBHOOK] Signature verification failed:", errorMessage);
      return new Response(
        JSON.stringify({ error: "Invalid signature", details: errorMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONNECT EVENT DETECTION
    // When using Direct Charges (Model A), payment events originate from the
    // connected account. Stripe includes `event.account` to identify the source.
    // ═══════════════════════════════════════════════════════════════════════════
    const connectedAccountId = (event as any).account || null;
    
    if (connectedAccountId) {
      console.log(`[WEBHOOK] Connect event from account: ${connectedAccountId}`);
    }
    
    console.log(`[WEBHOOK] Processing event: ${event.type} (${event.id})${connectedAccountId ? ` [Connect: ${connectedAccountId}]` : ''}`);

    // Handle different event types
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[WEBHOOK] PaymentIntent metadata:`, JSON.stringify(paymentIntent.metadata));
        await handlePaymentSucceeded(supabase, paymentIntent, event.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(supabase, paymentIntent);
        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentCanceled(supabase, paymentIntent);
        break;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STRIPE CONNECT ACCOUNT LIFECYCLE EVENTS
      // ═══════════════════════════════════════════════════════════════════════

      case "account.updated": {
        const acct = event.data.object as any;
        // Attach stripe client for downstream helpers that need it
        (event as any).__stripe = stripe;
        await handleConnectAccountUpdated(supabase, acct);
        break;
      }

      case "capability.updated": {
        (event as any).__stripe = stripe;
        await handleConnectCapabilityUpdated(supabase, event, stripe);
        break;
      }

      case "account.application.deauthorized": {
        await handleConnectDeauthorized(supabase, event);
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true, event_id: event.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[WEBHOOK] Error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

/**
 * Handle successful payment - mark order as paid and send notification
 *
 * QA HARDENING:
 * - Idempotency: DB-backed via last_stripe_event_id UNIQUE constraint
 * - Idempotency: Skip if order already in terminal state
 * - Defensive: Handle missing order gracefully
 * - Safe batch update: Don't regress terminal batch statuses
 */
async function handlePaymentSucceeded(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent,
  eventId: string
) {
  const orderId = paymentIntent.metadata?.order_id;
  
  if (!orderId) {
    console.error("[WEBHOOK] No order_id in PaymentIntent metadata");
    return;
  }

  console.log(`[WEBHOOK] Payment succeeded for order: ${orderId}`);

  // QA HARDENING: Fetch order first to check current status
  const { data: existingOrder, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, batch_id, buyer_id, seller_id")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError) {
    console.error("[WEBHOOK] Failed to fetch order:", fetchError.message);
    return;
  }

  // QA HARDENING: Handle missing order gracefully
  if (!existingOrder) {
    console.warn(`[WEBHOOK] Order ${orderId} not found - skipping`);
    return;
  }

  // QA HARDENING: Idempotency - skip if already in terminal state
  if (TERMINAL_ORDER_STATUSES.includes(existingOrder.status)) {
    console.log(`[WEBHOOK] Order ${orderId} already in terminal state (${existingOrder.status}) - skipping`);
    return;
  }

  // DB-backed idempotency claim: first writer wins
  // If Stripe retries/replays the same event, the UNIQUE index will reject duplicates.
  const { error: claimErr } = await supabase
    .from("orders")
    .update({ last_stripe_event_id: eventId })
    .eq("id", orderId);

  if (claimErr) {
    // Duplicate delivery or already-claimed event: exit safely
    if (
      claimErr.message?.toLowerCase().includes("duplicate") ||
      claimErr.code === "23505"
    ) {
      console.log(`[WEBHOOK] Duplicate Stripe event ignored: ${eventId} (order ${orderId})`);
      return;
    }

    console.error("[WEBHOOK] Failed to claim idempotency key on order:", claimErr);
    throw new Error("Failed idempotency claim");
  }

  // Update order status to paid + persist payment_intent_id for refunds
  const { data: updatedOrder, error: updateError } = await supabase
    .from("orders")
    .update({
      status: "paid",
      payment_intent_id: paymentIntent.id,
    })
    .eq("id", orderId)
    .select("id")
    .single();

  if (updateError || !updatedOrder) {
    console.error("[WEBHOOK] Failed to update order status:", updateError?.message || "No row matched");
    throw new Error(updateError?.message || `Order ${orderId} not found or already updated`);
  }

  // QA HARDENING: Safe batch status update
  if (existingOrder.batch_id) {
    await updateBatchStatusSafely(supabase, existingOrder.batch_id);
  }

  // Create notification for buyer (with deduplication)
  await createPaymentNotificationSafely(supabase, existingOrder, orderId);

  console.log(`[WEBHOOK] Order ${orderId} marked as paid`);
}

/**
 * Safely update batch status - never regress terminal statuses
 */
async function updateBatchStatusSafely(
  supabase: ReturnType<typeof createClient>,
  batchId: string
) {
  try {
    // QA HARDENING: Fetch batch to check current status
    const { data: batch, error: batchFetchError } = await supabase
      .from("batches")
      .select("id, status")
      .eq("id", batchId)
      .maybeSingle();

    if (batchFetchError || !batch) {
      console.warn(`[WEBHOOK] Batch ${batchId} not found - skipping batch update`);
      return;
    }

    // QA HARDENING: Never regress terminal batch statuses
    if (TERMINAL_BATCH_STATUSES.includes(batch.status)) {
      console.log(`[WEBHOOK] Batch ${batchId} already in terminal state (${batch.status}) - skipping`);
      return;
    }

    // Check if all orders in batch are paid
    const { data: batchOrders, error: ordersError } = await supabase
      .from("orders")
      .select("status")
      .eq("batch_id", batchId);

    if (ordersError || !batchOrders) {
      console.warn(`[WEBHOOK] Failed to fetch orders for batch ${batchId}`);
      return;
    }

    const allPaid = batchOrders.every(
      (o) => o.status === "paid" || o.status === "ready" || o.status === "picked_up"
    );

    if (allPaid) {
      const { error: batchUpdateError } = await supabase
        .from("batches")
        .update({ status: "pending" })
        .eq("id", batchId)
        .not("status", "in", `(${TERMINAL_BATCH_STATUSES.join(",")})`); // Extra safety

      if (batchUpdateError) {
        console.warn(`[WEBHOOK] Failed to update batch ${batchId}:`, batchUpdateError.message);
      }
    }
  } catch (err) {
    // QA HARDENING: Never throw on batch update - log and continue
    console.warn("[WEBHOOK] Error updating batch status:", err);
  }
}

/**
 * Create payment notification with deduplication
 */
async function createPaymentNotificationSafely(
  supabase: ReturnType<typeof createClient>,
  order: { buyer_id: string; seller_id: string; batch_id?: string },
  orderId: string
) {
  if (!order.buyer_id) {
    return;
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // DUAL-READ: Get seller for notification body
    // Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
    // - New orders: seller_entity_id = sellers.id (canonical entity PK)
    // - Legacy orders: seller_id = sellers.user_id (auth.users.id FK)
    // ═══════════════════════════════════════════════════════════════════════════
    const sellerEntityId = (order as any).seller_entity_id || null;
    let seller: any = null;
    let sellerName: string | null = null;

    // Try canonical lookup first (seller_entity_id → sellers.id)
    if (sellerEntityId) {
      const { data } = await supabase
        .from("sellers")
        .select("id, user_id, business_name")
        .eq("id", sellerEntityId)
        .maybeSingle();
      seller = data;
    }

    // Fallback to legacy lookup (seller_id → sellers.user_id)
    if (!seller && order.seller_id) {
      const { data } = await supabase
        .from("sellers")
        .select("id, user_id, business_name")
        .eq("user_id", order.seller_id)
        .maybeSingle();
      seller = data;
    }

    sellerName = seller?.business_name ?? null;

    // QA HARDENING: Check for existing notification (idempotency)
    const { data: existingNotif } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", order.buyer_id)
      .eq("type", "order_update")
      .contains("metadata", { order_id: orderId, event: "payment_confirmed" })
      .maybeSingle();

    if (existingNotif) {
      console.log(`[WEBHOOK] Notification already exists for order ${orderId} - skipping`);
      return;
    }

    // Create notification
    const notifBody = sellerName
      ? `Your order from ${sellerName} is confirmed and is being prepared.`
      : "Your order is confirmed and is being prepared.";

    const { error: notifError } = await supabase
      .from("notifications")
      .insert({
        user_id: order.buyer_id,
        title: "Payment Confirmed",
        body: notifBody,
        type: "order_update",
        metadata: {
          order_id: orderId,
          seller_user_id: order.seller_id || null,                    // Legacy: auth.users.id
          seller_entity_id: seller?.id || sellerEntityId || null,     // Canonical: sellers.id
          seller_name: sellerName,
          batch_id: order.batch_id,
          event: "payment_confirmed",
        },
        read: false,
        read_at: null,
      });

    if (notifError) {
      // QA HARDENING: Never throw on notification failure - log and continue
      console.warn("[WEBHOOK] Failed to create payment notification:", notifError.message);
    } else {
      console.log(`[WEBHOOK] Payment notification sent to buyer ${order.buyer_id}`);
    }
  } catch (err) {
    // QA HARDENING: Never throw on notification - log and continue
    console.warn("[WEBHOOK] Error creating notification:", err);
  }
}

/**
 * Handle failed payment - update order status
 *
 * QA HARDENING: Defensive handling, never throw
 */
async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderId = paymentIntent.metadata?.order_id;
  
  if (!orderId) {
    console.error("[WEBHOOK] No order_id in PaymentIntent metadata");
    return;
  }

  console.log(`[WEBHOOK] Payment failed for order: ${orderId}`);

  // Get the failure reason
  const failureMessage = paymentIntent.last_payment_error?.message || "Payment failed";

  // QA HARDENING: Check if order exists and is in pending state
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!existingOrder) {
    console.warn(`[WEBHOOK] Order ${orderId} not found for failed payment`);
    return;
  }

  // QA HARDENING: Only update if still pending (allow retry)
  if (existingOrder.status !== "pending") {
    console.log(`[WEBHOOK] Order ${orderId} not in pending state (${existingOrder.status}) - skipping failure update`);
    return;
  }

  // Keep status as pending to allow retry - just log the failure
  console.log(`[WEBHOOK] Payment failed for order ${orderId}: ${failureMessage}`);
}

/**
 * Handle canceled payment - restore inventory
 *
 * QA HARDENING: Idempotency and defensive handling
 */
async function handlePaymentCanceled(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderId = paymentIntent.metadata?.order_id;
  
  if (!orderId) {
    console.error("[WEBHOOK] No order_id in PaymentIntent metadata");
    return;
  }

  console.log(`[WEBHOOK] Payment canceled for order: ${orderId}`);

  // QA HARDENING: Check current order status first
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!existingOrder) {
    console.warn(`[WEBHOOK] Order ${orderId} not found for cancellation`);
    return;
  }

  // QA HARDENING: Idempotency - skip if already cancelled or in terminal state
  if (existingOrder.status === "cancelled") {
    console.log(`[WEBHOOK] Order ${orderId} already cancelled - skipping`);
    return;
  }

  if (TERMINAL_ORDER_STATUSES.includes(existingOrder.status) && existingOrder.status !== "pending") {
    console.log(`[WEBHOOK] Order ${orderId} in terminal state (${existingOrder.status}) - cannot cancel`);
    return;
  }

  // Mark order as cancelled - this will trigger inventory restore via DB trigger
  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
    })
    .eq("id", orderId);

  if (error) {
    console.error("[WEBHOOK] Failed to cancel order:", error.message);
    throw error;
  }

  console.log(`[WEBHOOK] Order ${orderId} cancelled, inventory restored by DB trigger`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE CONNECT ACCOUNT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upsert seller Stripe connection status with idempotency.
 * Only writes when a change is actually needed.
 */
async function upsertSellerStripeConnectionFromAccount(
  supabase: ReturnType<typeof createClient>,
  stripeAccountId: string,
  enabled: boolean
) {
  // Idempotency: only write when a change is needed
  const { data: existing, error: readErr } = await supabase
    .from("sellers")
    .select("id, stripe_connected, stripe_connected_at")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  if (readErr) {
    console.error("[WEBHOOK][CONNECT] Failed reading seller by stripe_account_id:", readErr.message);
    return;
  }
  if (!existing?.id) {
    console.warn("[WEBHOOK][CONNECT] No seller found for stripe_account_id:", stripeAccountId);
    return;
  }

  const nextConnected = enabled === true;
  const nextConnectedAt = nextConnected ? new Date().toISOString() : null;

  const already =
    existing.stripe_connected === nextConnected &&
    (nextConnected ? !!existing.stripe_connected_at : existing.stripe_connected_at === null);

  if (already) {
    console.log("[WEBHOOK][CONNECT] No-op (already in desired state):", stripeAccountId, nextConnected);
    return;
  }

  const { error: updErr } = await supabase
    .from("sellers")
    .update({
      stripe_connected: nextConnected,
      stripe_connected_at: nextConnectedAt,
    })
    .eq("id", existing.id);

  if (updErr) {
    console.error("[WEBHOOK][CONNECT] Failed updating seller stripe flags:", updErr.message);
    return;
  }

  console.log("[WEBHOOK][CONNECT] Updated seller stripe flags:", {
    seller_id: existing.id,
    stripe_account_id: stripeAccountId,
    stripe_connected: nextConnected,
  });
}

/**
 * Handle account.updated event from Stripe Connect.
 * Syncs charges_enabled && payouts_enabled to sellers.stripe_connected.
 */
async function handleConnectAccountUpdated(
  supabase: ReturnType<typeof createClient>,
  acct: any
) {
  const stripeAccountId = acct?.id;
  if (!stripeAccountId) {
    console.warn("[WEBHOOK][CONNECT] account.updated missing acct.id");
    return;
  }

  const chargesEnabled = acct?.charges_enabled === true;
  const payoutsEnabled = acct?.payouts_enabled === true;

  // Canonical definition: "connected" means Stripe says both money rails are enabled
  const enabled = chargesEnabled && payoutsEnabled;

  console.log("[WEBHOOK][CONNECT] account.updated:", {
    stripe_account_id: stripeAccountId,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    enabled,
  });

  await upsertSellerStripeConnectionFromAccount(supabase, stripeAccountId, enabled);
}

/**
 * Handle capability.updated event from Stripe Connect.
 * Fetches fresh account data and syncs status.
 */
async function handleConnectCapabilityUpdated(
  supabase: ReturnType<typeof createClient>,
  event: any,
  stripe: any
) {
  // capability.updated objects may not include acct flags; we just resync using event.account or object.account
  const obj = event?.data?.object as any;
  const stripeAccountId = obj?.account || event?.account || null;

  if (!stripeAccountId) {
    console.warn("[WEBHOOK][CONNECT] capability.updated missing account id");
    return;
  }

  // Pull the account fresh (authoritative)
  if (!stripe?.accounts?.retrieve) {
    console.warn("[WEBHOOK][CONNECT] capability.updated cannot retrieve account (stripe client missing)");
    return;
  }

  const acct = await stripe.accounts.retrieve(stripeAccountId).catch((e: any) => {
    console.error("[WEBHOOK][CONNECT] Failed to retrieve account for capability.updated:", e?.message || e);
    return null;
  });

  if (!acct) return;
  await handleConnectAccountUpdated(supabase, acct);
}

/**
 * Handle account.application.deauthorized event.
 * Marks seller as disconnected when they revoke access.
 */
async function handleConnectDeauthorized(
  supabase: ReturnType<typeof createClient>,
  event: any
) {
  // account.application.deauthorized object includes "account"
  const obj = event?.data?.object as any;
  const stripeAccountId = obj?.account || null;

  if (!stripeAccountId) {
    console.warn("[WEBHOOK][CONNECT] deauthorized missing account id");
    return;
  }

  console.log("[WEBHOOK][CONNECT] account.application.deauthorized:", { stripe_account_id: stripeAccountId });

  // Canonical: deauthorized => not connected
  await upsertSellerStripeConnectionFromAccount(supabase, stripeAccountId, false);
}
