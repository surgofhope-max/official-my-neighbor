import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  console.log("[seller_refund_stripe_only] handler entered", req.method, req.url);

  // --------------------------------------------
  // CORS PREFLIGHT
  // --------------------------------------------
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2024-04-10",
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("UNAUTHORIZED", 401);
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: authData } = await supabase.auth.getUser(jwt);
    if (!authData?.user) {
      return jsonError("UNAUTHORIZED", 401);
    }

    const sellerUserId = authData.user.id;
    const body = await req.json();
    const { order_id, reason } = body ?? {};

    if (!order_id) {
      return jsonError("ORDER_ID_REQUIRED", 400);
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, buyer_id, seller_id, seller_entity_id, batch_id, status, stripe_refund_id, payment_intent_id")
      .eq("id", order_id)
      .single();

    if (error || !order) {
      return jsonError("ORDER_NOT_FOUND", 404);
    }

    if (order.seller_id !== sellerUserId) {
      return jsonError("FORBIDDEN", 403);
    }

    if (order.status !== "paid") {
      return jsonError("ORDER_NOT_REFUNDABLE", 400);
    }

    if (order.stripe_refund_id) {
      return jsonSuccess({
        stripe_refund_id: order.stripe_refund_id,
        idempotent: true,
      });
    }

    if (!order.payment_intent_id) {
      return jsonError("MISSING_PAYMENT_INTENT", 400);
    }

    // Fetch seller's Stripe connected account
    // Try seller_entity_id first (canonical), fallback to seller_id (legacy)
    let seller: { stripe_account_id: string | null } | null = null;

    if (order.seller_entity_id) {
      const { data } = await supabase
        .from("sellers")
        .select("stripe_account_id")
        .eq("id", order.seller_entity_id)
        .single();
      seller = data;
    }

    if (!seller && order.seller_id) {
      const { data } = await supabase
        .from("sellers")
        .select("stripe_account_id")
        .eq("user_id", order.seller_id)
        .single();
      seller = data;
    }

    if (!seller?.stripe_account_id) {
      return jsonError("SELLER_STRIPE_NOT_CONNECTED", 400);
    }

    // Execute refund on the CONNECTED ACCOUNT (same account that created the PaymentIntent)
    const refund = await stripe.refunds.create(
      {
        payment_intent: order.payment_intent_id,
        reason: reason ?? undefined,
      },
      {
        stripeAccount: seller.stripe_account_id,
        idempotencyKey: `refund_order_${order_id}`,
      }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Update order status to 'refunded' + store stripe_refund_id
    // Idempotency: Only update if stripe_refund_id was previously NULL
    // This triggers DB inventory restore trigger (status → 'refunded')
    // ─────────────────────────────────────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        stripe_refund_id: refund.id,
        status: "refunded",
      })
      .eq("id", order_id)
      .is("stripe_refund_id", null);

    if (updateErr) {
      console.error("[seller_refund] Failed to update order status:", updateErr.message);
      // Stripe refund succeeded but DB update failed - log but don't fail the request
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1.5: Create buyer notification (NON-BLOCKING)
    // Notify buyer that refund is being processed
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert({
          user_id: order.buyer_id,
          title: "Refund initiated",
          body: "Your refund is being processed and will appear shortly.",
          type: "order_update",
          metadata: {
            event: "refund_initiated",
            order_id: order.id,
            batch_id: order.batch_id,
            seller_id: order.seller_id,
          },
          read: false,
          read_at: null,
        });

      if (notifError) {
        console.warn("[REFUND] Failed to create buyer notification:", notifError.message);
      }
    } catch (e) {
      console.warn("[REFUND] Unexpected error creating buyer notification:", e);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Evaluate batch lifecycle
    // If ALL orders in the batch are now 'refunded', auto-complete the batch
    // ─────────────────────────────────────────────────────────────────────────
    let batchAutoCompleted = false;

    if (order.batch_id) {
      try {
        // Fetch all orders in this batch
        const { data: batchOrders, error: batchOrdersErr } = await supabase
          .from("orders")
          .select("id, status")
          .eq("batch_id", order.batch_id);

        if (!batchOrdersErr && batchOrders && batchOrders.length > 0) {
          // Check if ALL orders are now refunded (or cancelled)
          const allRefundedOrCancelled = batchOrders.every(
            (o) => o.status === "refunded" || o.status === "cancelled"
          );

          if (allRefundedOrCancelled) {
            // Auto-complete the batch since no orders remain for pickup
            const now = new Date().toISOString();
            const { error: batchUpdateErr } = await supabase
              .from("batches")
              .update({
                status: "completed",
                completed_at: now,
              })
              .eq("id", order.batch_id)
              .not("status", "in", "(completed,picked_up,cancelled)"); // Don't regress terminal states

            if (batchUpdateErr) {
              console.warn("[seller_refund] Failed to auto-complete batch:", batchUpdateErr.message);
            } else {
              batchAutoCompleted = true;
              console.log(`[seller_refund] Batch ${order.batch_id} auto-completed (all orders refunded)`);
            }
          }
        }
      } catch (batchErr) {
        // Batch evaluation failed - log but don't fail the refund
        console.warn("[seller_refund] Batch evaluation error:", batchErr);
      }
    }

    return jsonSuccess({
      stripe_refund_id: refund.id,
      payment_intent: refund.payment_intent,
      status: refund.status,
      order_status: "refunded",
      batch_auto_completed: batchAutoCompleted,
    });

  } catch (err) {
    console.error(err);
    return jsonError("STRIPE_REFUND_FAILED", 500);
  }
});

function jsonError(code: string, status = 400) {
  return new Response(
    JSON.stringify({ ok: false, error: code }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

function jsonSuccess(data: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: true, ...data }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
