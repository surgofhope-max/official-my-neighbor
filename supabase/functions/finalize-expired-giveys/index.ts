/**
 * Finalize Expired Giveys Edge Function
 *
 * Selects givey_events with status='active' and ends_at <= now(),
 * then calls finalize_givey_event RPC for each.
 *
 * Intended to be invoked by pg_cron every 5 seconds.
 * Uses service role to bypass RLS.
 */

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const now = new Date().toISOString();

  const { data: expiredGiveys, error: fetchError } = await supabase
    .from("givey_events")
    .select("id")
    .eq("status", "active")
    .not("ends_at", "eq", null)
    .lte("ends_at", now)
    .order("ends_at", { ascending: true })
    .limit(200);

  if (fetchError) {
    console.error("Failed to fetch expired giveys", fetchError);
    return new Response(
      JSON.stringify({
        processed: 0,
        attempted: 0,
        errors: [fetchError.message],
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!expiredGiveys || expiredGiveys.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, attempted: 0, errors: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const errors: string[] = [];
  let processed = 0;

  for (const row of expiredGiveys) {
    try {
      const { error } = await supabase.rpc("finalize_givey_event", {
        p_givey_event_id: row.id,
      });
      if (error) {
        errors.push(`${row.id}: ${error.message}`);
      } else {
        processed++;
      }
    } catch (e) {
      errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(
    JSON.stringify({
      processed,
      attempted: expiredGiveys.length,
      errors,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
