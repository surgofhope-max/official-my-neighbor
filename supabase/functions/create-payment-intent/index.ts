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
      return new Response(
        JSON.stringify({ error: "Seller Stripe account not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const quantity = intent.quantity ?? 1;
    const pricePerUnit = Number(product.price) || 0;
    const amountInCents = Math.round(pricePerUnit * quantity * 100);
    if (amountInCents < 50) {
      return new Response(
        JSON.stringify({ error: "Order amount too small (minimum $0.50)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const platformFee = Math.round(amountInCents * 0.05);

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        application_fee_amount: platformFee,
        metadata: {
          checkout_intent_id: intent.id,
          buyer_id: intent.buyer_id,
          seller_id: intent.seller_id,
          product_id: intent.product_id,
          show_id: intent.show_id,
          platform: "livemarket",
        },
        description: `Order for ${product.title}`,
      },
      { stripeAccount: seller.stripe_account_id }
    );

    const { error: updateIntentErr } = await supabase
      .from("checkout_intents")
      .update({
        intent_status: "locked",
        lock_expires_at: lockExpiresAtIso,
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkout_intent_id)
      .in("intent_status", ["intent"]);

    if (updateIntentErr) {
      console.error("[create-payment-intent] Failed to lock intent:", updateIntentErr);
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
