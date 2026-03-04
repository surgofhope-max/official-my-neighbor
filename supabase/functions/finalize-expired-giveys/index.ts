/**
 * Finalize Expired Giveys Edge Function
 *
 * Selects givey_events with status='active' and ends_at <= now(),
 * then calls finalize_givey_event RPC for each.
 *
 * Runs as a continuous worker loop: processes every ~1 second.
 * Uses service role to bypass RLS.
 */

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function processExpiredGiveys() {
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
    .lte("ends_at", now)
    .order("ends_at", { ascending: true })
    .limit(200);

  if (fetchError) {
    console.error("Failed to fetch expired giveys", fetchError);
    return;
  }

  if (!expiredGiveys || expiredGiveys.length === 0) {
    return;
  }

  for (const row of expiredGiveys) {
    try {
      const { error } = await supabase.rpc("finalize_givey_event", {
        p_givey_event_id: row.id,
      });
      if (error) {
        console.error(`${row.id}: ${error.message}`);
      }
    } catch (e) {
      console.error(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

serve(async () => {
  while (true) {
    await processExpiredGiveys();
    await new Promise((r) => setTimeout(r, 1000));
  }
});
