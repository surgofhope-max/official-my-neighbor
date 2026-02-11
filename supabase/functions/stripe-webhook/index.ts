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

// Paid-only batch: open batches can receive new paid orders
const OPEN_BATCH_STATUSES = ["active", "pending"];
const CLOSED_BATCH_STATUSES = ["ready", "completed", "picked_up", "cancelled"];

/** Generate 9-digit completion code (same format as CheckoutOverlay) */
function generateCompletionCode(): string {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

/** Generate batch number (same format as CheckoutOverlay) */
function generateBatchNumber(showId: string, buyerId: string): string {
  const shortShowId = showId.substring(0, 8);
  const shortBuyerId = buyerId.substring(0, 8);
  const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
  return `BATCH-${shortShowId}-${shortBuyerId}-${timestamp}`;
}

/** Find an open batch for the given key (buyer_id, seller_id, show_id). */
async function findOpenBatchForKey(
  supabase: ReturnType<typeof createClient>,
  key: { buyer_id: string; seller_id: string; show_id: string }
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("batches")
    .select("id")
    .eq("buyer_id", key.buyer_id)
    .eq("seller_id", key.seller_id)
    .eq("show_id", key.show_id)
    .in("status", OPEN_BATCH_STATUSES)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[WEBHOOK] findOpenBatchForKey error:", error.message);
    return null;
  }
  return data as { id: string } | null;
}

/** Create a new batch for a paid order (called when no open batch exists). */
async function createBatchForPaidOrder(
  supabase: ReturnType<typeof createClient>,
  key: { buyer_id: string; seller_id: string; show_id: string }
): Promise<{ id: string } | null> {
  const completionCode = generateCompletionCode();
  const batchNumber = generateBatchNumber(key.show_id, key.buyer_id);

  const { data, error } = await supabase
    .from("batches")
    .insert({
      buyer_id: key.buyer_id,
      seller_id: key.seller_id,
      show_id: key.show_id,
      batch_number: batchNumber,
      completion_code: completionCode,
      status: "active",
      total_items: 0,
      total_amount: 0,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[WEBHOOK] createBatchForPaidOrder error:", error.message);
    return null;
  }
  console.log("[WEBHOOK] Created batch", data.id, "for key", { buyer_id: key.buyer_id, seller_id: key.seller_id, show_id: key.show_id });
  return data as { id: string };
}

/** Recompute batch totals from orders that have completed payment. */
async function recomputeBatchTotalsFromPaidOrders(
  supabase: ReturnType<typeof createClient>,
  batchId: string
): Promise<void> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("price, delivery_fee")
    .eq("batch_id", batchId)
    .in("status", ["paid", "ready", "fulfilled", "completed"]);

  if (error) {
    console.error("[WEBHOOK] recomputeBatchTotalsFromPaidOrders: failed to fetch orders:", error.message);
    throw new Error("WEBHOOK_BATCH_ATTACH_FAILED:recompute_fetch_orders");
  }

  const totalItems = (orders ?? []).length;
  const totalAmount = (orders ?? []).reduce(
    (sum, o) => sum + (Number(o.price) || 0) + (Number(o.delivery_fee) || 0),
    0
  );

  const { error: updateErr } = await supabase
    .from("batches")
    .update({ total_items: totalItems, total_amount: totalAmount })
    .eq("id", batchId);

  if (updateErr) {
    console.error("[WEBHOOK] recomputeBatchTotalsFromPaidOrders: failed to update batch:", updateErr.message);
    throw new Error("WEBHOOK_BATCH_ATTACH_FAILED:recompute_update_batch");
  }
  console.log("[WEBHOOK] Recomputed batch totals:", { batchId, totalItems, totalAmount });
}

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
  const orderIdFromMeta = paymentIntent.metadata?.order_id;
  const checkoutIntentId = paymentIntent.metadata?.checkout_intent_id;

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH A: metadata.order_id present — update existing pending order to paid
  // ═══════════════════════════════════════════════════════════════════════════
  if (orderIdFromMeta) {
    const { data: existingOrder, error: fetchErr } = await supabase
      .from("orders")
      .select("id, status, batch_id, buyer_id, seller_id, seller_entity_id, show_id")
      .eq("id", orderIdFromMeta)
      .single();

    if (fetchErr || !existingOrder) {
      console.error("[WEBHOOK] Order from metadata not found:", orderIdFromMeta, fetchErr?.message);
      return;
    }

    if (TERMINAL_ORDER_STATUSES.includes(existingOrder.status)) {
      console.log(`[WEBHOOK] Order ${orderIdFromMeta} already terminal (${existingOrder.status}) - idempotent skip`);
      return;
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "paid",
        payment_intent_id: paymentIntent.id,
        last_stripe_event_id: eventId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderIdFromMeta)
      .in("status", ["pending"]);

    if (updateErr) {
      console.error("[WEBHOOK] Failed to mark order paid:", updateErr.message);
      throw new Error(updateErr.message || "Failed to mark order paid");
    }

    const orderId = existingOrder.id;
    console.log(`[WEBHOOK] Order ${orderId} marked as paid (from metadata.order_id)`);

    if (checkoutIntentId) {
      await supabase
        .from("checkout_intents")
        .update({
          intent_status: "converted",
          converted_order_id: orderId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkoutIntentId)
        .in("intent_status", ["locked", "intent"]);
    }

    if (existingOrder.show_id) {
      try {
        const { error: incErr } = await supabase.rpc("increment_show_sales_count", { p_show_id: existingOrder.show_id });
        if (incErr) console.error("[WEBHOOK] increment_show_sales_count failed:", incErr);
      } catch (e) {
        console.error("[WEBHOOK] increment_show_sales_count exception:", e);
      }
    }

    let resolvedBatchId: string | null = existingOrder.batch_id ?? null;
    const sellerIdForBatch = (existingOrder as any).seller_entity_id || existingOrder.seller_id;

    if (existingOrder.buyer_id && sellerIdForBatch && existingOrder.show_id) {
      if (!resolvedBatchId) {
        const key = {
          buyer_id: existingOrder.buyer_id,
          seller_id: sellerIdForBatch,
          show_id: existingOrder.show_id,
        };
        let batch = await findOpenBatchForKey(supabase, key);
        if (!batch) batch = await createBatchForPaidOrder(supabase, key);
        if (batch) {
          await supabase.from("orders").update({ batch_id: batch.id }).eq("id", orderId);
          resolvedBatchId = batch.id;
          await supabase
            .from("batches")
            .update({ status: "pending" })
            .eq("id", resolvedBatchId)
            .eq("status", "active");
        }
      }
      if (resolvedBatchId) {
        try {
          await recomputeBatchTotalsFromPaidOrders(supabase, resolvedBatchId);
        } catch (e) {
          console.error("[WEBHOOK] recomputeBatchTotals failed:", e);
        }
      }
    }

    const orderForNotification = {
      ...existingOrder,
      batch_id: resolvedBatchId ?? undefined,
      seller_entity_id: sellerIdForBatch ?? (existingOrder as any).seller_entity_id,
    };
    await createPaymentNotificationSafely(supabase, orderForNotification, orderId);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH B: No order_id — fallback create paid order from intent (legacy)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!checkoutIntentId) {
    console.error("[WEBHOOK] No checkout_intent_id and no order_id in PaymentIntent metadata");
    return;
  }

  console.log(`[WEBHOOK] Payment succeeded for checkout_intent: ${checkoutIntentId} (no order_id, creating from intent)`);

  const { data: intent, error: intentErr } = await supabase
    .from("checkout_intents")
    .select("*")
    .eq("id", checkoutIntentId)
    .single();

  if (intentErr || !intent) {
    console.error("[WEBHOOK] Checkout intent not found:", checkoutIntentId, intentErr?.message);
    return;
  }

  if (intent.intent_status === "converted") {
    console.log(`[WEBHOOK] Intent ${checkoutIntentId} already converted - idempotent skip`);
    return;
  }

  const { data: product, error: productErr } = await supabase
    .from("products")
    .select("id, title, price, quantity")
    .eq("id", intent.product_id)
    .single();

  if (productErr || !product) {
    console.error("[WEBHOOK] Product not found for intent:", intent.product_id);
    return;
  }

  const { data: seller, error: sellerErr } = await supabase
    .from("sellers")
    .select("id, user_id")
    .eq("id", intent.seller_id)
    .single();

  if (sellerErr || !seller) {
    console.error("[WEBHOOK] Seller not found for intent:", intent.seller_id);
    return;
  }

  const completionCode = generateCompletionCode();
  const quantity = intent.quantity ?? 1;
  const price = Number(product.price) || 0;
  const deliveryFee = 0;

  const { data: newOrder, error: orderInsertErr } = await supabase
    .from("orders")
    .insert({
      batch_id: null,
      buyer_id: intent.buyer_id,
      seller_id: seller.user_id,
      seller_entity_id: intent.seller_id,
      product_id: intent.product_id,
      show_id: intent.show_id,
      completion_code: completionCode,
      price,
      delivery_fee: deliveryFee,
      status: "paid",
      payment_intent_id: paymentIntent.id,
      last_stripe_event_id: eventId,
    })
    .select("id, status, batch_id, buyer_id, seller_id, seller_entity_id, show_id")
    .single();

  if (orderInsertErr || !newOrder) {
    console.error("[WEBHOOK] Failed to create order from intent:", orderInsertErr?.message);
    throw new Error(orderInsertErr?.message || "Failed to create order");
  }

  const orderId = newOrder.id;
  console.log(`[WEBHOOK] Created order ${orderId} from intent ${checkoutIntentId}`);

  const { error: intentUpdateErr } = await supabase
    .from("checkout_intents")
    .update({
      intent_status: "converted",
      converted_order_id: orderId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", checkoutIntentId)
    .in("intent_status", ["locked"]);

  if (intentUpdateErr) {
    console.error("[WEBHOOK] Failed to mark intent converted:", intentUpdateErr.message);
    throw new Error("Failed to mark intent converted");
  }

  try {
    const { error: incErr } = await supabase.rpc("increment_show_sales_count", { p_show_id: intent.show_id });
    if (incErr) console.error("[WEBHOOK] increment_show_sales_count failed:", incErr);
  } catch (e) {
    console.error("[WEBHOOK] increment_show_sales_count exception:", e);
  }

  let resolvedBatchId: string | null = newOrder.batch_id ?? null;
  const sellerIdForBatch = (newOrder as any).seller_entity_id || newOrder.seller_id;
  const existingOrder = newOrder;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAID-ONLY BATCH ATTACH: Create or reuse ONE open batch per (buyer, seller, show)
  // ═══════════════════════════════════════════════════════════════════════════
  const logCtx = (stage: string, attemptedBatchId?: string | null) => ({
    order_id: orderId,
    buyer_id: existingOrder.buyer_id,
    seller_id: sellerIdForBatch,
    show_id: existingOrder.show_id,
    attempted_batch_id: attemptedBatchId ?? resolvedBatchId ?? null,
    stage,
  });

  if (!existingOrder.buyer_id || !sellerIdForBatch || !existingOrder.show_id) {
    console.warn("[WEBHOOK] Order missing batch key fields - skipping batch attach");
  } else {
    if (!resolvedBatchId) {
      // Order has no batch: find or create open batch
      const key = {
        buyer_id: existingOrder.buyer_id,
        seller_id: sellerIdForBatch,
        show_id: existingOrder.show_id,
      };
      let batch = await findOpenBatchForKey(supabase, key);
      if (!batch) {
        batch = await createBatchForPaidOrder(supabase, key);
      }
      if (!batch) {
        console.error("[WEBHOOK] Paid-only batch attach failed", logCtx("create_batch"));
        throw new Error("WEBHOOK_BATCH_ATTACH_FAILED:create_batch");
      }
      const { error: attachErr } = await supabase
        .from("orders")
        .update({ batch_id: batch.id })
        .eq("id", orderId);

      if (attachErr) {
        console.error("[WEBHOOK] Paid-only batch attach failed", logCtx("attach_order", batch.id));
        throw new Error("WEBHOOK_BATCH_ATTACH_FAILED:attach_order");
      }
      resolvedBatchId = batch.id;
      console.log("[WEBHOOK] Attached order", orderId, "to batch", resolvedBatchId);

      // Promote batch to pending on first paid order
      if (resolvedBatchId) {
        const { error: promoteErr } = await supabase
          .from("batches")
          .update({ status: "pending" })
          .eq("id", resolvedBatchId)
          .eq("status", "active");

        if (promoteErr) {
          console.error("[WEBHOOK] failed to promote batch to pending", {
            batch_id: resolvedBatchId,
            error: promoteErr,
          });
          throw new Error("WEBHOOK_BATCH_PROMOTION_FAILED");
        } else {
          console.log("[WEBHOOK] batch promoted to pending", {
            batch_id: resolvedBatchId,
          });
        }
      }
    }

    if (resolvedBatchId) {
      try {
        await recomputeBatchTotalsFromPaidOrders(supabase, resolvedBatchId);
      } catch (e) {
        console.error("[WEBHOOK] Paid-only batch attach failed", logCtx("recompute_totals"));
        throw new Error("WEBHOOK_BATCH_ATTACH_FAILED:recompute_totals");
      }
    }
  }

  const orderForNotification = { ...existingOrder, batch_id: resolvedBatchId ?? undefined, seller_entity_id: sellerIdForBatch };
  await createPaymentNotificationSafely(supabase, orderForNotification, orderId);

  console.log(`[WEBHOOK] Order ${orderId} marked as paid (from intent ${checkoutIntentId})`);
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
 * Handle failed payment - mark intent expired if not converted.
 * Converted intents are NEVER expired or cancelled.
 */
async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderIdFromMeta = paymentIntent.metadata?.order_id;
  const checkoutIntentId = paymentIntent.metadata?.checkout_intent_id;

  if (orderIdFromMeta) {
    await supabase
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", orderIdFromMeta)
      .in("status", ["pending"]);
  }

  if (!checkoutIntentId) return;

  const failureMessage = paymentIntent.last_payment_error?.message || "Payment failed";
  console.log(`[WEBHOOK] Payment failed for intent ${checkoutIntentId}: ${failureMessage}`);

  const { data: intent } = await supabase
    .from("checkout_intents")
    .select("id, intent_status")
    .eq("id", checkoutIntentId)
    .single();

  if (!intent) return;
  if (intent.intent_status === "converted") return;

  await supabase
    .from("checkout_intents")
    .update({ intent_status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", checkoutIntentId)
    .in("intent_status", ["intent", "locked"]);
}

/**
 * Handle canceled payment - mark intent cancelled if not converted.
 * No order exists yet in intent flow; converted intents are NEVER expired or cancelled.
 */
async function handlePaymentCanceled(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderIdFromMeta = paymentIntent.metadata?.order_id;
  const checkoutIntentId = paymentIntent.metadata?.checkout_intent_id;

  if (orderIdFromMeta) {
    await supabase
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", orderIdFromMeta)
      .in("status", ["pending"]);
  }

  if (!checkoutIntentId) return;

  console.log(`[WEBHOOK] Payment canceled for intent: ${checkoutIntentId}`);

  const { data: intent } = await supabase
    .from("checkout_intents")
    .select("id, intent_status")
    .eq("id", checkoutIntentId)
    .single();

  if (!intent) return;
  if (intent.intent_status === "converted") return;

  await supabase
    .from("checkout_intents")
    .update({ intent_status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", checkoutIntentId)
    .in("intent_status", ["intent", "locked"]);

  console.log("[WEBHOOK] Intent", checkoutIntentId, "marked cancelled");
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
 * 
 * MODEL A: stripe_connected means "Stripe Connect relationship exists and is active."
 * It does NOT flip false due to charges/payouts toggling.
 * Only account.application.deauthorized may set it false.
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

  // MODEL A:
  // Connected means the Stripe account exists and is not deauthorized.
  // Charges/payouts are informational only — they do NOT affect stripe_connected.
  const connected = !!stripeAccountId;

  console.log("[WEBHOOK][CONNECT][MODEL_A] account.updated:", {
    stripe_account_id: stripeAccountId,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    connected,
  });

  await upsertSellerStripeConnectionFromAccount(supabase, stripeAccountId, true);
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
