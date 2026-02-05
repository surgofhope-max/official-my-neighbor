/**
 * DRY-RUN WRITE: Show Reminder System - Step 5
 * 
 * PURPOSE: Test the write path for marking reminders as sent,
 * WITHOUT sending actual emails.
 * 
 * THIS FUNCTION:
 * - ✅ READS shows, bookmarked_shows, auth.users
 * - ✅ WRITES to sent_show_reminders (idempotent)
 * - ✅ Uses ON CONFLICT DO NOTHING for safety
 * - ✅ Logs all operations
 * 
 * THIS FUNCTION DOES NOT:
 * - ❌ Send any emails
 * - ❌ Import or use Resend
 * - ❌ Write to notifications table
 * - ❌ Schedule cron
 * - ❌ Update any other table
 * 
 * SAFE TO RUN REPEATEDLY (idempotent via UNIQUE constraint)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("[DRY-RUN] Show Reminder Write Test - NO EMAILS");
  console.log("═══════════════════════════════════════════════════════════════");

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Get current database server time
    // ═══════════════════════════════════════════════════════════════════════
    const now = new Date();
    const windowStart = new Date(now.getTime() + 4 * 60 * 1000); // +4 minutes
    const windowEnd = new Date(now.getTime() + 6 * 60 * 1000);   // +6 minutes

    console.log("[DRY-RUN] Current time:", now.toISOString());
    console.log("[DRY-RUN] Reminder window START:", windowStart.toISOString());
    console.log("[DRY-RUN] Reminder window END:", windowEnd.toISOString());
    console.log("───────────────────────────────────────────────────────────────");

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Query shows in the reminder window
    // ═══════════════════════════════════════════════════════════════════════
    console.log("[DRY-RUN] Querying scheduled shows in reminder window...");

    const { data: eligibleShows, error: showsError } = await supabase
      .from("shows")
      .select("id, title, scheduled_start_time, status")
      .eq("status", "scheduled")
      .gte("scheduled_start_time", windowStart.toISOString())
      .lt("scheduled_start_time", windowEnd.toISOString());

    if (showsError) {
      console.error("[DRY-RUN] Shows query error:", showsError.message);
      return new Response(JSON.stringify({ error: showsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const showsChecked = eligibleShows?.length || 0;
    console.log(`[DRY-RUN] Shows in window: ${showsChecked}`);

    if (showsChecked === 0) {
      console.log("[DRY-RUN] No shows in reminder window. Nothing to do.");
      console.log("═══════════════════════════════════════════════════════════════");
      return new Response(JSON.stringify({
        mode: "WRITE_ONLY_DRY_RUN",
        result: "NO_SHOWS_IN_WINDOW",
        window: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
        },
        shows_checked: 0,
        bookmark_rows: 0,
        eligible_reminders: 0,
        rows_inserted: 0,
        rows_skipped: 0,
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log shows found
    eligibleShows.forEach((show, idx) => {
      console.log(`[DRY-RUN] Show ${idx + 1}: ${show.id} | "${show.title}" | ${show.scheduled_start_time}`);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Get bookmarks for these shows
    // ═══════════════════════════════════════════════════════════════════════
    const showIds = eligibleShows.map(s => s.id);
    
    console.log("───────────────────────────────────────────────────────────────");
    console.log(`[DRY-RUN] Querying bookmarks for ${showIds.length} show(s)...`);

    const { data: bookmarks, error: bookmarksError } = await supabase
      .from("bookmarked_shows")
      .select("id, user_id, show_id")
      .in("show_id", showIds);

    if (bookmarksError) {
      console.error("[DRY-RUN] Bookmarks query error:", bookmarksError.message);
      return new Response(JSON.stringify({ error: bookmarksError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bookmarkRows = bookmarks?.length || 0;
    console.log(`[DRY-RUN] Bookmarks found: ${bookmarkRows}`);

    if (bookmarkRows === 0) {
      console.log("[DRY-RUN] No bookmarks for shows in window. Nothing to do.");
      console.log("═══════════════════════════════════════════════════════════════");
      return new Response(JSON.stringify({
        mode: "WRITE_ONLY_DRY_RUN",
        result: "NO_BOOKMARKS",
        window: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
        },
        shows_checked: showsChecked,
        bookmark_rows: 0,
        eligible_reminders: 0,
        rows_inserted: 0,
        rows_skipped: 0,
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Check which reminders have already been sent
    // ═══════════════════════════════════════════════════════════════════════
    console.log("───────────────────────────────────────────────────────────────");
    console.log("[DRY-RUN] Checking sent_show_reminders for existing entries...");

    let alreadySent: Set<string> = new Set();
    
    const { data: sentReminders, error: sentError } = await supabase
      .from("sent_show_reminders")
      .select("user_id, show_id")
      .in("show_id", showIds);

    if (sentError) {
      if (sentError.message.includes("does not exist") || sentError.code === "42P01") {
        console.log("[DRY-RUN] Table sent_show_reminders does not exist yet.");
        console.log("[DRY-RUN] Please create the table first with the migration.");
        return new Response(JSON.stringify({
          error: "Table sent_show_reminders does not exist",
          hint: "Run the migration to create the table first",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[DRY-RUN] sent_show_reminders query error:", sentError.message);
      return new Response(JSON.stringify({ error: sentError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sentReminders) {
      sentReminders.forEach(r => {
        alreadySent.add(`${r.user_id}:${r.show_id}`);
      });
    }
    console.log(`[DRY-RUN] Already sent reminders: ${alreadySent.size}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Build list of eligible reminders (not yet sent)
    // ═══════════════════════════════════════════════════════════════════════
    console.log("───────────────────────────────────────────────────────────────");
    console.log("[DRY-RUN] Building eligible reminder list...");

    interface ReminderToInsert {
      user_id: string;
      show_id: string;
    }

    const remindersToInsert: ReminderToInsert[] = [];

    for (const bookmark of bookmarks) {
      const pairKey = `${bookmark.user_id}:${bookmark.show_id}`;
      if (!alreadySent.has(pairKey)) {
        remindersToInsert.push({
          user_id: bookmark.user_id,
          show_id: bookmark.show_id,
        });
      }
    }

    const eligibleReminders = remindersToInsert.length;
    console.log(`[DRY-RUN] Eligible reminders (not yet sent): ${eligibleReminders}`);

    if (eligibleReminders === 0) {
      console.log("[DRY-RUN] All reminders already sent. Nothing to insert.");
      console.log("═══════════════════════════════════════════════════════════════");
      return new Response(JSON.stringify({
        mode: "WRITE_ONLY_DRY_RUN",
        result: "ALL_ALREADY_SENT",
        window: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
        },
        shows_checked: showsChecked,
        bookmark_rows: bookmarkRows,
        eligible_reminders: 0,
        rows_inserted: 0,
        rows_skipped: alreadySent.size,
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: INSERT into sent_show_reminders (with ON CONFLICT DO NOTHING)
    // ═══════════════════════════════════════════════════════════════════════
    console.log("───────────────────────────────────────────────────────────────");
    console.log(`[DRY-RUN] Inserting ${eligibleReminders} reminder record(s)...`);
    console.log("[DRY-RUN] Using ON CONFLICT (user_id, show_id) DO NOTHING for idempotency");

    // Prepare insert payload with sent_at
    const insertPayload = remindersToInsert.map(r => ({
      user_id: r.user_id,
      show_id: r.show_id,
      sent_at: now.toISOString(),
    }));

    // Use upsert with ignoreDuplicates for ON CONFLICT DO NOTHING behavior
    const { data: insertedData, error: insertError } = await supabase
      .from("sent_show_reminders")
      .upsert(insertPayload, {
        onConflict: "user_id,show_id",
        ignoreDuplicates: true,
      })
      .select("id, user_id, show_id");

    if (insertError) {
      console.error("[DRY-RUN] Insert error:", insertError.message);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rowsInserted = insertedData?.length || 0;
    const rowsSkipped = eligibleReminders - rowsInserted;

    console.log(`[DRY-RUN] Rows successfully inserted: ${rowsInserted}`);
    console.log(`[DRY-RUN] Rows skipped (conflict): ${rowsSkipped}`);

    // Log inserted rows (truncated)
    if (insertedData && insertedData.length > 0) {
      console.log("[DRY-RUN] Sample inserted rows (first 3):");
      insertedData.slice(0, 3).forEach((row, idx) => {
        console.log(`  [${idx + 1}] user_id: ${row.user_id.substring(0, 8)}... | show_id: ${row.show_id.substring(0, 8)}...`);
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Return summary
    // ═══════════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[DRY-RUN] COMPLETE - WRITES PERFORMED - NO EMAILS SENT");
    console.log("═══════════════════════════════════════════════════════════════");

    const summary = {
      mode: "WRITE_ONLY_DRY_RUN",
      result: "SUCCESS",
      emails_sent: 0,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      },
      shows_checked: showsChecked,
      bookmark_rows: bookmarkRows,
      eligible_reminders: eligibleReminders,
      rows_inserted: rowsInserted,
      rows_skipped: rowsSkipped + alreadySent.size,
      shows: eligibleShows.map(s => ({
        id: s.id,
        title: s.title,
        scheduled_start_time: s.scheduled_start_time,
      })),
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[DRY-RUN] Unexpected error:", error);
    return new Response(JSON.stringify({
      error: "Dry-run failed",
      details: String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
