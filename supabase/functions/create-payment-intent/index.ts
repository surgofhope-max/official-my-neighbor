/**
 * Supabase Edge Function: create-payment-intent
 *
 * Creates a Stripe PaymentIntent for an order using MODEL A (Direct Charges).
 * Called by frontend after order is created with "pending" status.
 *
 * Flow:
 * 1. Frontend creates order (status: pending, inventory reserved)
 * 2. Frontend calls this function with order_id
 * 3. Function creates PaymentIntent ON THE CONNECTED ACCOUNT (seller)
 * 4. Returns client_secret for Stripe Elements (frontend must use same stripeAccount)
 *
 * MODEL A: Direct Charges on Connected Account
 * - PaymentIntent is created ON the seller's connected account
 * - Platform collects application_fee_amount (5%)
 * - clientSecret belongs to connected account context
 * - Frontend MUST use loadStripe(pk, { stripeAccount: acct_xxx })
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreatePaymentIntentRequest {
  order_id: string;
}

interface CreatePaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Stripe secret key from environment
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
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

    // Get authenticated user from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user's JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { order_id }: CreatePaymentIntentRequest = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the order belongs to the authenticated user
    if (order.buyer_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to order" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify order is in pending state
    if (order.status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Order status is ${order.status}, expected pending` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate amount in cents
    const amountInCents = Math.round((order.price || 0) * 100);

    if (amountInCents < 50) {
      return new Response(
        JSON.stringify({ error: "Order amount too small (minimum $0.50)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Get seller's Stripe account for Connect (REQUIRED for Model A)
    // DUAL-READ: Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
    // - New orders: seller_entity_id = sellers.id (canonical entity PK)
    // - Legacy orders: seller_id = sellers.user_id (auth.users.id FK)
    // ═══════════════════════════════════════════════════════════════════════════
    const sellerEntityId = (order as any).seller_entity_id || null;

    let seller: any = null;

    // Try canonical lookup first (seller_entity_id → sellers.id)
    if (sellerEntityId) {
      const { data } = await supabase
        .from("sellers")
        .select("id, user_id, stripe_account_id, business_name")
        .eq("id", sellerEntityId)
        .single();
      seller = data;
    }

    // Fallback to legacy lookup (seller_id → sellers.user_id)
    if (!seller && order.seller_id) {
      const { data } = await supabase
        .from("sellers")
        .select("id, user_id, stripe_account_id, business_name")
        .eq("user_id", order.seller_id)
        .single();
      seller = data;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODEL A: Direct Charges on Connected Account
    // - Seller MUST have stripe_account_id
    // - PaymentIntent is created ON the connected account
    // - NO transfer_data.destination (that's for destination charges)
    // ═══════════════════════════════════════════════════════════════════════════

    // Require seller to have Stripe Connect for live payments
    if (!seller?.stripe_account_id) {
      return new Response(
        JSON.stringify({ error: "Seller Stripe account not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const connectedAccountId = seller.stripe_account_id;

    // Calculate platform fee (5%)
    const platformFee = Math.round(amountInCents * 0.05);

    // Create PaymentIntent params - NO transfer_data (that's destination charges)
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      // Platform fee collected from this direct charge
      application_fee_amount: platformFee,
      metadata: {
        order_id: order.id,
        buyer_id: order.buyer_id,
        seller_user_id: order.seller_id || "",           // Legacy: auth.users.id
        seller_entity_id: seller?.id || sellerEntityId || "",  // Canonical: sellers.id
        product_id: order.product_id || "",
        show_id: order.show_id || "",
        platform: "livemarket",
      },
      description: `Order for ${order.product_title}`,
      receipt_email: order.buyer_email || undefined,
    };

    // Audit log BEFORE creating PaymentIntent
    console.log("[create-payment-intent] MODELA direct charge", {
      orderId: order?.id,
      sellerId: seller?.id,
      connectedAccountId,
      amountInCents,
      platformFee,
      hasTransferData: !!paymentIntentParams.transfer_data,
    });

    // Create PaymentIntent ON THE CONNECTED ACCOUNT (Direct Charges / Model A)
    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams,
      { stripeAccount: connectedAccountId }
    );

    // Audit log AFTER creating PaymentIntent
    console.log("[create-payment-intent] PI created", {
      orderId: order?.id,
      connectedAccountId,
      paymentIntentId: paymentIntent?.id,
    });

    const response: CreatePaymentIntentResponse = {
      client_secret: paymentIntent.client_secret!,
      payment_intent_id: paymentIntent.id,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error creating payment intent:", error);
    
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





