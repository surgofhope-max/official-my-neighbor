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

export interface CreatePaymentIntentResultWithLock {
  clientSecret: string | null;
  paymentIntentId: string | null;
  lockExpiresAt: string | null;
  error: string | null;
}

/**
 * Create a PaymentIntent for a checkout intent via Edge Function (Step 4).
 * No order exists yet; order is created in webhook on payment success.
 *
 * @param checkoutIntentId - The checkout_intent id (from Buy Now)
 * @returns client_secret, payment_intent_id, lock_expires_at for Stripe Elements and expiry UI
 */
export async function createPaymentIntent(
  checkoutIntentId: string
): Promise<CreatePaymentIntentResult & CreatePaymentIntentResultWithLock> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
      return {
        clientSecret: null,
        paymentIntentId: null,
        lockExpiresAt: null,
        error: "Not authenticated",
      };
    }

    const { data, error } = await supabase.functions.invoke(
      "create-payment-intent",
      {
        body: { checkout_intent_id: checkoutIntentId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    if (error) {
      console.warn("Failed to create payment intent:", error.message);
      return {
        clientSecret: null,
        paymentIntentId: null,
        lockExpiresAt: null,
        error: error.message || "Failed to initialize payment",
      };
    }

    if (!data?.client_secret) {
      return {
        clientSecret: null,
        paymentIntentId: null,
        lockExpiresAt: null,
        error: (data?.error as string) || "Invalid response from payment service",
      };
    }

    return {
      clientSecret: data.client_secret,
      paymentIntentId: data.payment_intent_id,
      lockExpiresAt: data.lock_expires_at ?? null,
      error: null,
    };
  } catch (err) {
    console.warn("Unexpected error creating payment intent:", err);
    return {
      clientSecret: null,
      paymentIntentId: null,
      lockExpiresAt: null,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Poll checkout_intent until webhook marks it converted; return orderId and completionCode.
 * Used after Stripe confirmPayment succeeds in intent flow (Step 4).
 */
export async function pollCheckoutIntentConverted(
  checkoutIntentId: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<{ orderId: string; completionCode: string | null } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: intent, error: intentErr } = await supabase
      .from("checkout_intents")
      .select("intent_status, converted_order_id")
      .eq("id", checkoutIntentId)
      .single();

    if (intentErr || !intent) return null;
    if (intent.intent_status === "converted" && intent.converted_order_id) {
      const orderId = intent.converted_order_id as string;
      const { data: order } = await supabase
        .from("orders")
        .select("completion_code")
        .eq("id", orderId)
        .single();
      return {
        orderId,
        completionCode: (order as { completion_code?: string } | null)?.completion_code ?? null,
      };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
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





