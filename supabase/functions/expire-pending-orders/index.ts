import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // TTL: 7 minutes + 60s buffer = 8 minutes
  const expirationCutoff = new Date(
    Date.now() - (8 * 60 * 1000)
  ).toISOString();

  const { data: expiredOrders, error: fetchError } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", expirationCutoff);

  if (fetchError) {
    console.error("Failed to fetch expired pending orders", fetchError);
    return new Response("ERROR", { status: 500 });
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    console.log("No expired pending orders found");
    return new Response("OK", { status: 200 });
  }

  const orderIds = expiredOrders.map((o) => o.id);

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .in("id", orderIds)
    .eq("status", "pending"); // idempotency guard

  if (updateError) {
    console.error("Failed to cancel expired orders", updateError);
    return new Response("ERROR", { status: 500 });
  }

  console.log(`Expired ${orderIds.length} pending orders`);

  return new Response("OK", { status: 200 });
});
