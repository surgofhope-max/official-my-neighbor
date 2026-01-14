/**
 * Auto-Complete Stale Orders Edge Function
 *
 * Runs daily to auto-complete orders that have been in 'paid' or 'fulfilled'
 * status for more than 5 days without seller pickup verification.
 *
 * This provides a safety net for orders where sellers don't complete pickup.
 *
 * Schedule: Daily at 02:00 UTC (configurable via CRON_SCHEDULE env var)
 *
 * SAFETY:
 * - Uses service role (bypasses RLS)
 * - Idempotent (WHERE guards prevent double-completion)
 * - Excludes cancelled/refunded orders
 * - Does NOT depend on client auth
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Types
interface StaleOrder {
  id: string;
  status: string;
  paid_at: string;
  buyer_id: string;
  seller_id: string;
}

interface CompletionResult {
  orderId: string;
  success: boolean;
  error?: string;
}

// Configuration
const STALE_DAYS = 5;

Deno.serve(async (req) => {
  // Only allow POST (from cron) or GET (for manual trigger/testing)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Initialize Supabase client with service role (bypasses RLS)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[auto_complete_orders] Missing environment variables");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const now = new Date().toISOString();
  console.log(`[auto_complete_orders] Starting at ${now}`);

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Query stale orders
    // ─────────────────────────────────────────────────────────────────────────
    // Orders are stale if:
    // - status is 'paid' or 'fulfilled' (not yet completed)
    // - paid_at is older than STALE_DAYS days
    // - status is NOT 'cancelled' or 'refunded' (excluded by IN clause)
    
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - STALE_DAYS);
    const staleThresholdISO = staleThreshold.toISOString();

    console.log(`[auto_complete_orders] Looking for orders paid before: ${staleThresholdISO}`);

    const { data: staleOrders, error: queryError } = await supabase
      .from("orders")
      .select("id, status, paid_at, buyer_id, seller_id")
      .in("status", ["paid", "fulfilled"])
      .lte("paid_at", staleThresholdISO)
      .order("paid_at", { ascending: true });

    if (queryError) {
      console.error("[auto_complete_orders] Query error:", queryError.message);
      return new Response(
        JSON.stringify({ error: "Failed to query stale orders", details: queryError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const ordersToComplete = (staleOrders as StaleOrder[]) || [];
    console.log(`[auto_complete_orders] Found ${ordersToComplete.length} stale orders`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Auto-complete each order (with idempotency guard)
    // ─────────────────────────────────────────────────────────────────────────
    const completedAt = new Date().toISOString();
    const results: CompletionResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const order of ordersToComplete) {
      // Idempotency: Only update if status is still in eligible state
      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({
          status: "completed",
          completed_at: completedAt,
        })
        .eq("id", order.id)
        .in("status", ["paid", "fulfilled"]) // Guard: prevent double-completion
        .select("id")
        .single();

      if (updateError) {
        // PGRST116 = no rows returned (already completed/changed)
        if (updateError.code === "PGRST116") {
          console.log(`[auto_complete_orders] Order ${order.id} already completed or status changed`);
          results.push({ orderId: order.id, success: true, error: "Already completed" });
          successCount++; // Count as success (idempotent)
        } else {
          console.error(`[auto_complete_orders] Failed to complete order ${order.id}:`, updateError.message);
          results.push({ orderId: order.id, success: false, error: updateError.message });
          failCount++;
        }
      } else if (updated) {
        console.log(`[auto_complete_orders] ✓ Completed order ${order.id}`);
        results.push({ orderId: order.id, success: true });
        successCount++;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Summary logging
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`[auto_complete_orders] Summary:`);
    console.log(`  - Orders evaluated: ${ordersToComplete.length}`);
    console.log(`  - Orders completed: ${successCount}`);
    console.log(`  - Orders failed: ${failCount}`);

    if (successCount > 0) {
      const completedIds = results
        .filter((r) => r.success && !r.error)
        .map((r) => r.orderId);
      console.log(`[auto_complete_orders] Completed order IDs: ${completedIds.join(", ")}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Return response
    // ─────────────────────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        evaluated: ordersToComplete.length,
        completed: successCount,
        failed: failCount,
        completedAt: completedAt,
        results: results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[auto_complete_orders] Unexpected error:", err);
    return new Response(
      JSON.stringify({
        error: "Unexpected error",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});












