import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config();

/**
 * Givey Realtime Executor
 *
 * Server-side process that monitors active Giveys and calls finalize_givey_event
 * exactly when ends_at is reached. Uses in-memory timers + Supabase realtime.
 * Cron (finalize-expired-giveys) remains as fallback safety.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[GIVEY EXECUTOR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Map: givey id -> { timeoutId, endsAt } */
const timers = new Map();

function scheduleTimer(id, endsAt) {
  if (timers.has(id)) {
    return;
  }

  const endsAtMs = new Date(endsAt).getTime();
  const nowMs = Date.now();
  const delayMs = Math.max(0, endsAtMs - nowMs);

  const timeoutId = setTimeout(async () => {
    timers.delete(id);
    console.log("[GIVEY EXECUTOR] finalize attempted", { id });

    try {
      const { error } = await supabase.rpc("finalize_givey_event", {
        p_givey_event_id: id,
      });

      if (error) {
        console.log("[GIVEY EXECUTOR] finalize error", { id, error: error.message });
        return;
      }

      console.log("[GIVEY EXECUTOR] finalize resolved", { id });
    } catch (err) {
      console.log("[GIVEY EXECUTOR] finalize error", {
        id,
        error: err?.message ?? String(err),
      });
    }
  }, delayMs);

  timers.set(id, { timeoutId, endsAt });
  console.log("[GIVEY EXECUTOR] timer scheduled", { id, endsAt, delayMs });
}

function clearTimer(id) {
  const entry = timers.get(id);
  if (entry) {
    clearTimeout(entry.timeoutId);
    timers.delete(id);
    console.log("[GIVEY EXECUTOR] timer cleared", { id });
  }
}

async function loadActiveGiveys() {
  const { data, error } = await supabase
    .from("givey_events")
    .select("id, ends_at")
    .eq("status", "active");

  if (error) {
    console.error("[GIVEY EXECUTOR] load error", error.message);
    return;
  }

  const rows = data ?? [];
  console.log("[GIVEY EXECUTOR] active giveys loaded", { count: rows.length });

  for (const row of rows) {
    if (row.id && row.ends_at) {
      scheduleTimer(row.id, row.ends_at);
    }
  }
}

function startRealtimeSubscription() {
  const channel = supabase
    .channel("givey-executor-realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "givey_events",
      },
      (payload) => {
        const row = payload.new;
        if (row?.status === "active" && row?.id && row?.ends_at) {
          scheduleTimer(row.id, row.ends_at);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "givey_events",
      },
      (payload) => {
        const row = payload.new;
        const status = row?.status;
        if (
          status === "winner_selected" ||
          status === "expired" ||
          status === "claimed"
        ) {
          if (row?.id) {
            clearTimer(row.id);
          }
        }
      }
    )
    .subscribe((status) => {
      console.log("[GIVEY EXECUTOR] realtime status", status);
    });

  return channel;
}

async function main() {
  console.log("[GIVEY EXECUTOR] executor started");

  await loadActiveGiveys();
  startRealtimeSubscription();
}

main().catch((err) => {
  console.error("[GIVEY EXECUTOR] fatal", err);
  process.exit(1);
});
