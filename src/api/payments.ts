/**
 * Payments API
 *
 * Handles Stripe payment integration via Supabase Edge Functions.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface CreatePaymentIntentResult {
  clientSecret: string | null;
  paymentIntentId: string | null;
  error: string | null;
}

/**
 * Create a PaymentIntent for an order via Edge Function.
 *
 * @param orderId - The order ID to create payment for
 * @returns PaymentIntent client secret for Stripe Elements
 *
 * This function:
 * - Never throws
 * - Returns null values on error with error message
 * - Calls Supabase Edge Function which handles Stripe
 */
export async function createPaymentIntent(
  orderId: string
): Promise<CreatePaymentIntentResult> {
  try {
    // Get the current session for auth header
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        clientSecret: null,
        paymentIntentId: null,
        error: "Not authenticated",
      };
    }

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke("create-payment-intent", {
      body: { order_id: orderId },
    });

    if (error) {
      console.warn("Failed to create payment intent:", error.message);
      return {
        clientSecret: null,
        paymentIntentId: null,
        error: error.message || "Failed to initialize payment",
      };
    }

    if (!data?.client_secret) {
      return {
        clientSecret: null,
        paymentIntentId: null,
        error: "Invalid response from payment service",
      };
    }

    return {
      clientSecret: data.client_secret,
      paymentIntentId: data.payment_intent_id,
      error: null,
    };
  } catch (err) {
    console.warn("Unexpected error creating payment intent:", err);
    return {
      clientSecret: null,
      paymentIntentId: null,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Poll for order payment status.
 * Used to check if webhook has updated order after payment.
 *
 * @param orderId - The order ID to check
 * @param maxAttempts - Maximum polling attempts (default 10)
 * @param intervalMs - Milliseconds between polls (default 1000)
 * @returns The updated order status or null
 */
export async function pollOrderPaymentStatus(
  orderId: string,
  maxAttempts: number = 10,
  intervalMs: number = 1000
): Promise<"paid" | "pending" | "cancelled" | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();

    if (error) {
      console.warn("Error polling order status:", error.message);
      return null;
    }

    if (data?.status === "paid") {
      return "paid";
    }

    if (data?.status === "cancelled") {
      return "cancelled";
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Still pending after max attempts
  return "pending";
}





