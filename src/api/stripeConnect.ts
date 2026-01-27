import { supabase } from "@/lib/supabase/supabaseClient";

export async function createStripeAccount() {
  const { data, error } = await supabase.functions.invoke("stripe-create-account", {
    body: {}
  });

  if (error) {
    console.error("Stripe create account error:", error);
    throw error;
  }

  return data;
}


