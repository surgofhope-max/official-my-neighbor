/**
 * Supabase Edge Function: create-payment-intent
 *
 * Step 4: Creates a Stripe PaymentIntent from a checkout_intent (no order yet).
 * Called by frontend when user clicks "Continue to Payment".
 *
 * Flow:
 * 1. Frontend calls with checkout_intent_id
 * 2. Validate intent: buyer_id === auth.uid(), intent_status === 'intent', now() < intent_expires_at
 * 3. Transition intent: intent → locked, set lock_expires_at = now() + 4 minutes
 * 4. Create PaymentIntent on seller's connected account with metadata: checkout_intent_id, buyer_id, seller_id, product_id, show_id
 * 5. Store stripe_payment_intent_id on intent
 * 6. Return client_secret, payment_intent_id, lock_expires_at
 *
 * MODEL A: Direct Charges on Connected Account (unchanged).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOCK_TTL_MINUTES = 4;

interface CreatePaymentIntentRequest {
  checkout_intent_id: string;
}

interface CreatePaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
  lock_expires_at: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { checkout_intent_id }: CreatePaymentIntentRequest = await req.json();
    if (!checkout_intent_id) {
      console.error("CREATE_PI_VALIDATION_FAILED", {
        stage: "CHECKOUT_INTENT_ID_MISSING",
        checkout_intent_id,
        intent_status: null,
        intent_expires_at: null,
        now: new Date().toISOString(),
        buyer_id_from_intent: null,
        auth_user_id: user?.id ?? null,
        seller_id: null,
        stripe_account_id: null,
      });
      return new Response(
        JSON.stringify({ error: "checkout_intent_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: intent, error: intentError } = await supabase
      .from("checkout_intents")
      .select("*")
      .eq("id", checkout_intent_id)
      .single();

    if (intentError || !intent) {
      return new Response(
        JSON.stringify({ error: "Checkout session expired" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (intent.buyer_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to checkout intent" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (intent.intent_status !== "intent") {
      return new Response(
        JSON.stringify({ error: "Checkout session expired" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const intentExpiresAt = new Date(intent.intent_expires_at);
    if (now >= intentExpiresAt) {
      return new Response(
        JSON.stringify({ error: "Checkout session expired" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lockExpiresAt = new Date(now.getTime() + LOCK_TTL_MINUTES * 60 * 1000);
    const lockExpiresAtIso = lockExpiresAt.toISOString();

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, title, price, quantity, status")
      .eq("id", intent.product_id)
      .single();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (product.status !== "active" || (product.quantity ?? 0) < (intent.quantity ?? 1)) {
      console.error("CREATE_PI_VALIDATION_FAILED", {
        stage: "PRODUCT_UNAVAILABLE",
        checkout_intent_id,
        intent_status: intent?.intent_status ?? null,
        intent_expires_at: intent?.intent_expires_at ?? null,
        now: new Date().toISOString(),
        buyer_id_from_intent: intent?.buyer_id ?? null,
        auth_user_id: user?.id ?? null,
        seller_id: intent?.seller_id ?? null,
        stripe_account_id: null,
      });
      return new Response(
        JSON.stringify({ error: "Product no longer available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: seller, error: sellerError } = await supabase
      .from("sellers")
      .select("id, user_id, stripe_account_id, business_name")
      .eq("id", intent.seller_id)
      .single();

    if (sellerError || !seller?.stripe_account_id) {
      console.error("CREATE_PI_VALIDATION_FAILED", {
        stage: sellerError || !seller ? "SELLER_NOT_FOUND" : "SELLER_STRIPE_NOT_CONNECTED",
        checkout_intent_id,
        intent_status: intent?.intent_status ?? null,
        intent_expires_at: intent?.intent_expires_at ?? null,
        now: new Date().toISOString(),
        buyer_id_from_intent: intent?.buyer_id ?? null,
        auth_user_id: user?.id ?? null,
        seller_id: intent?.seller_id ?? null,
        stripe_account_id: seller?.stripe_account_id ?? null,
      });
      return new Response(
        JSON.stringify({ error: "Seller Stripe account not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const quantity = intent.quantity ?? 1;
    const pricePerUnit = Number(product.price) || 0;
    const amountInCents = Math.round(pricePerUnit * quantity * 100);
    if (amountInCents < 50) {
      console.error("CREATE_PI_VALIDATION_FAILED", {
        stage: "AMOUNT_INVALID",
        checkout_intent_id,
        intent_status: intent?.intent_status ?? null,
        intent_expires_at: intent?.intent_expires_at ?? null,
        now: new Date().toISOString(),
        buyer_id_from_intent: intent?.buyer_id ?? null,
        auth_user_id: user?.id ?? null,
        seller_id: intent?.seller_id ?? null,
        stripe_account_id: seller?.stripe_account_id ?? null,
      });
      return new Response(
        JSON.stringify({ error: "Order amount too small (minimum $0.50)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const platformFee = Math.round(amountInCents * 0.05);

    const nowIso = new Date().toISOString();

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2.1: ATOMIC LOCK — only one caller can transition intent→locked
    // ═══════════════════════════════════════════════════════════════════════════
    const { data: lockedIntent, error: lockErr } = await supabase
      .from("checkout_intents")
      .update({
        intent_status: "locked",
        lock_expires_at: lockExpiresAtIso,
        updated_at: nowIso,
      })
      .eq("id", checkout_intent_id)
      .eq("intent_status", "intent")
      .gt("intent_expires_at", nowIso)
      .select("*")
      .single();

    if (lockErr || !lockedIntent) {
      return new Response(
        JSON.stringify({ error: "Checkout session locked or expired" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2.2: Create PENDING order (triggers inventory decrement)
    // ═══════════════════════════════════════════════════════════════════════════
    const orderPrice = Number(product.price) || 0;
    const completionCode = Math.floor(100000000 + Math.random() * 900000000).toString();

    const { data: pendingOrder, error: orderErr } = await supabase
      .from("orders")
      .insert({
        batch_id: null,
        buyer_id: lockedIntent.buyer_id,
        seller_id: seller.user_id,
        seller_entity_id: lockedIntent.seller_id,
        product_id: lockedIntent.product_id,
        show_id: lockedIntent.show_id,
        quantity,
        completion_code: completionCode,
        price: orderPrice,
        delivery_fee: 0,
        status: "pending",
      })
      .select("id")
      .single();

    if (orderErr) {
      console.error("ORDER INSERT ERROR:", orderErr);
      await supabase
        .from("checkout_intents")
        .update({ intent_status: "intent", lock_expires_at: null, updated_at: new Date().toISOString() })
        .eq("id", checkout_intent_id)
        .eq("intent_status", "locked");
      return new Response(
        JSON.stringify({
          error: "ORDER_INSERT_FAILED",
          message: orderErr.message,
          details: orderErr,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!pendingOrder) {
      await supabase
        .from("checkout_intents")
        .update({ intent_status: "intent", lock_expires_at: null, updated_at: new Date().toISOString() })
        .eq("id", checkout_intent_id)
        .eq("intent_status", "locked");
      return new Response(
        JSON.stringify({ error: "Unable to reserve inventory" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2.3: Create Stripe PaymentIntent (after lock + pending order)
    // ═══════════════════════════════════════════════════════════════════════════
    let paymentIntent: { id: string; client_secret: string | null };
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountInCents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          application_fee_amount: platformFee,
          metadata: {
            order_id: pendingOrder.id,
            checkout_intent_id: checkout_intent_id,
            buyer_id: intent.buyer_id,
            seller_id: intent.seller_id,
            seller_entity_id: intent.seller_id,
            product_id: intent.product_id,
            show_id: intent.show_id,
            platform: "livemarket",
          },
          description: `Order for ${product.title}`,
        },
        { stripeAccount: seller.stripe_account_id }
      );
    } catch (stripeErr) {
      console.error("[create-payment-intent] Stripe PI create failed:", stripeErr);
      await supabase
        .from("orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", pendingOrder.id);
      await supabase
        .from("checkout_intents")
        .update({ intent_status: "intent", lock_expires_at: null, updated_at: new Date().toISOString() })
        .eq("id", checkout_intent_id)
        .eq("intent_status", "locked");
      return new Response(
        JSON.stringify({ error: "Failed to initialize payment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2.4: Store stripe_payment_intent_id on checkout_intents
    // ═══════════════════════════════════════════════════════════════════════════
    const { error: updateIntentErr } = await supabase
      .from("checkout_intents")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkout_intent_id)
      .eq("intent_status", "locked");

    if (updateIntentErr) {
      console.error("[create-payment-intent] Failed to store stripe_payment_intent_id:", updateIntentErr);
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id, { stripeAccount: seller.stripe_account_id });
      } catch (_) {}
      await supabase
        .from("orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", pendingOrder.id);
      await supabase
        .from("checkout_intents")
        .update({ intent_status: "intent", lock_expires_at: null, updated_at: new Date().toISOString() })
        .eq("id", checkout_intent_id)
        .eq("intent_status", "locked");
      return new Response(
        JSON.stringify({ error: "Failed to lock checkout intent" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response: CreatePaymentIntentResponse = {
      client_secret: paymentIntent.client_secret!,
      payment_intent_id: paymentIntent.id,
      lock_expires_at: lockExpiresAtIso,
    };

    console.log("CREATE_PI_SUCCESS", { checkout_intent_id, order_id: pendingOrder.id, payment_intent_id: paymentIntent.id });

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
