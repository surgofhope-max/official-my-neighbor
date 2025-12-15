/**
 * Supabase Edge Function: create-payment-intent
 *
 * Creates a Stripe PaymentIntent for an order.
 * Called by frontend after order is created with "pending" status.
 *
 * Flow:
 * 1. Frontend creates order (status: pending, inventory reserved)
 * 2. Frontend calls this function with order_id
 * 3. Function creates PaymentIntent and updates order with payment_intent_id
 * 4. Returns client_secret for Stripe Elements
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

    // If PaymentIntent already exists, retrieve it
    if (order.payment_intent_id) {
      const existingIntent = await stripe.paymentIntents.retrieve(order.payment_intent_id);
      
      if (existingIntent.status === "requires_payment_method" || 
          existingIntent.status === "requires_confirmation") {
        return new Response(
          JSON.stringify({
            client_secret: existingIntent.client_secret,
            payment_intent_id: existingIntent.id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Calculate amount in cents
    const amountInCents = Math.round((order.price || 0) * 100);

    if (amountInCents < 50) {
      return new Response(
        JSON.stringify({ error: "Order amount too small (minimum $0.50)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get seller's Stripe account for Connect (if applicable)
    const { data: seller } = await supabase
      .from("sellers")
      .select("stripe_account_id, business_name")
      .eq("id", order.seller_id)
      .single();

    // Create PaymentIntent
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        order_id: order.id,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        product_id: order.product_id || "",
        show_id: order.show_id || "",
      },
      description: `Order for ${order.product_title}`,
      receipt_email: order.buyer_email || undefined,
    };

    // If seller has Stripe Connect, use transfer_data
    if (seller?.stripe_account_id) {
      // Calculate platform fee (e.g., 5%)
      const platformFee = Math.round(amountInCents * 0.05);
      
      paymentIntentParams.transfer_data = {
        destination: seller.stripe_account_id,
      };
      paymentIntentParams.application_fee_amount = platformFee;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Update order with payment_intent_id
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_intent_id: paymentIntent.id,
      })
      .eq("id", order_id);

    if (updateError) {
      // Cancel the PaymentIntent since we couldn't store it
      await stripe.paymentIntents.cancel(paymentIntent.id);
      throw new Error("Failed to update order with payment intent");
    }

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





