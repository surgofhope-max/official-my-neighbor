/**
 * Checkout Intents API (client-side).
 * Creates intent rows on Buy Now; no order, batch, or Stripe interaction.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface CreateCheckoutIntentInput {
  buyer_id: string;
  seller_id: string;   // sellers.id (entity)
  show_id: string;
  product_id: string;
  quantity?: number;
}

export interface CheckoutIntent {
  id: string;
  buyer_id: string;
  seller_id: string;
  show_id: string;
  product_id: string;
  quantity: number;
  intent_status: string;
  intent_expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create a checkout intent (Buy Now). No order, reservation, or Stripe.
 * RLS: buyer_id must equal auth.uid().
 */
export async function createCheckoutIntent(
  input: CreateCheckoutIntentInput
): Promise<CheckoutIntent> {
  const quantity = input.quantity ?? 1;
  const intentExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const payload = {
    buyer_id: input.buyer_id,
    seller_id: input.seller_id,
    show_id: input.show_id,
    product_id: input.product_id,
    quantity,
    intent_status: "intent",
    intent_expires_at: intentExpiresAt,
  };

  console.log("AUDIT_CREATE_CHECKOUT_INTENT_BEFORE_INSERT", {
    product_id: input.product_id,
    buyer_id: input.buyer_id,
    seller_id: input.seller_id,
    show_id: input.show_id,
    timestamp: new Date().toISOString()
  });
  const { data, error } = await supabase
    .from("checkout_intents")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(error.message || "Failed to create checkout intent");
  }

  console.log("AUDIT_CREATE_CHECKOUT_INTENT_AFTER_INSERT", {
    newIntentId: data?.id,
    product_id: input.product_id,
    timestamp: new Date().toISOString()
  });
  if (!data) {
    throw new Error("Failed to create checkout intent");
  }

  return data as CheckoutIntent;
}

/**
 * Get a checkout intent by id (for polling after payment).
 * RLS: buyer can only read own intents.
 */
export async function getCheckoutIntent(
  intentId: string | null
): Promise<{ intent_status: string; converted_order_id: string | null } | null> {
  if (!intentId) return null;
  const { data, error } = await supabase
    .from("checkout_intents")
    .select("intent_status, converted_order_id")
    .eq("id", intentId)
    .single();
  if (error || !data) return null;
  return data as { intent_status: string; converted_order_id: string | null };
}

/**
 * Poll until intent is converted or max attempts reached.
 * Returns { orderId, completionCode } when converted; completionCode from order.
 */
export async function pollIntentConverted(
  intentId: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<{ orderId: string; completionCode: string } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const intent = await getCheckoutIntent(intentId);
    if (!intent) return null;
    if (intent.intent_status === "converted" && intent.converted_order_id) {
      const { data: order } = await supabase
        .from("orders")
        .select("completion_code")
        .eq("id", intent.converted_order_id)
        .single();
      return {
        orderId: intent.converted_order_id,
        completionCode: order?.completion_code ?? "",
      };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Poll until intent is converted or max attempts reached.
 * Returns converted_order_id when status === "converted".
 */
export async function pollIntentForConvertedOrderId(
  intentId: string,
  maxAttempts = 30,
  intervalMs = 1000
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const row = await getCheckoutIntent(intentId);
    if (row?.intent_status === "converted" && row.converted_order_id) {
      return row.converted_order_id;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
