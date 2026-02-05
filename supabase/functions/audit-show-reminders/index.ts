/**
 * AUDIT-ONLY: Show Reminder Selection Logic
 * 
 * PURPOSE: Verify the query logic for selecting users who should receive
 * "5-minute before show" email reminders based on their bookmarks.
 * 
 * THIS FUNCTION:
 * - ✅ READS data only
 * - ✅ Logs candidates to console
 * - ✅ Returns JSON summary
 * 
 * THIS FUNCTION DOES NOT:
 * - ❌ Send any emails
 * - ❌ Write to sent_show_reminders
 * - ❌ Write to notifications
 * - ❌ Modify any table
 * - ❌ Use any email provider (Resend, SendGrid, etc.)
 * 
 * SAFE TO RUN IN PRODUCTION (read-only audit)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for browser/testing access
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
  console.log("[AUDIT] Show Reminder Selection Logic - READ-ONLY AUDIT");
  console.log("═══════════════════════════════════════════════════════════════");

  try {
    // Initialize Supabase client with service role (bypasses RLS for audit)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Get current database server time
    // ═══════════════════════════════════════════════════════════════════════
    const { data: timeData, error: timeError } = await supabase
      .rpc("now"); // Supabase built-in to get server time
    
    // Fallback: use raw SQL if rpc('now') doesn't work
    let dbNow: string;
    if (timeError || !timeData) {
      const { data: sqlTime } = await supabase
        .from("shows")
        .select("scheduled_start_time")
        .limit(0); // Just to verify connection
      dbNow = new Date().toISOString();
      console.log("[AUDIT] Using client time (rpc failed):", dbNow);
    } else {
      dbNow = timeData;
      console.log("[AUDIT] Database server time:", dbNow);
    }

    // Calculate reminder window: 4-6 minutes from now
    const now = new Date(dbNow);
    const windowStart = new Date(now.getTime() + 4 * 60 * 1000); // +4 minutes
    const windowEnd = new Date(now.getTime() + 6 * 60 * 1000);   // +6 minutes

    console.log("[AUDIT] Current time (DB):", now.toISOString());
    console.log("[AUDIT] Reminder window START:", windowStart.toISOString());
    console.log("[AUDIT] Reminder window END:", windowEnd.toISOString());
    console.log("───────────────────────────────────────────────────────────────");

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Query shows in the reminder window
    // ═══════════════════════════════════════════════════════════════════════
    console.log("[AUDIT] Querying scheduled shows in reminder window...");

    const { data: eligibleShows, error: showsError } = await supabase
      .from("shows")
      .select("id, title, scheduled_start_time, status")
      .eq("status", "scheduled")
      .gte("scheduled_start_time", windowStart.toISOString())
      .lt("scheduled_start_time", windowEnd.toISOString());

    if (showsError) {
      console.error("[AUDIT] Shows query error:", showsError.message);
      return new Response(JSON.stringify({ error: showsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[AUDIT] Shows in window: ${eligibleShows?.length || 0}`);
    
    if (!eligibleShows || eligibleShows.length === 0) {
      console.log("[AUDIT] No shows scheduled in the 4-6 minute window.");
      console.log("═══════════════════════════════════════════════════════════════");
      return new Response(JSON.stringify({
        audit_result: "NO_SHOWS_IN_WINDOW",
        total_candidates: 0,
        shows_checked: 0,
        users_matched: 0,
        window: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
        },
        message: "No scheduled shows found in the 4-6 minute reminder window.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log eligible shows
    eligibleShows.forEach((show, idx) => {
      console.log(`[AUDIT] Show ${idx + 1}: ${show.id} | "${show.title}" | ${show.scheduled_start_time}`);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Get bookmarked users for these shows
    // ═══════════════════════════════════════════════════════════════════════
    const showIds = eligibleShows.map(s => s.id);
    
    console.log("───────────────────────────────────────────────────────────────");
    console.log(`[AUDIT] Querying bookmarks for ${showIds.length} show(s)...`);

    const { data: bookmarks, error: bookmarksError } = await supabase
      .from("bookmarked_shows")
      .select("id, user_id, show_id")
      .in("show_id", showIds);

    if (bookmarksError) {
      console.error("[AUDIT] Bookmarks query error:", bookmarksError.message);
      return new Response(JSON.stringify({ error: bookmarksError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[AUDIT] Bookmarks found: ${bookmarks?.length || 0}`);

    if (!bookmarks || bookmarks.length === 0) {
      console.log("[AUDIT] No bookmarks found for shows in window.");
      console.log("═══════════════════════════════════════════════════════════════");
      return new Response(JSON.stringify({
        audit_result: "NO_BOOKMARKS",
        total_candidates: 0,
        shows_checked: eligibleShows.length,
        users_matched: 0,
        shows: eligibleShows.map(s => ({ id: s.id, title: s.title })),
        message: "Shows found but no users have bookmarked them.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Get user emails from auth.users
    // ═══════════════════════════════════════════════════════════════════════
    const userIds = [...new Set(bookmarks.map(b => b.user_id))];
    
    console.log(`[AUDIT] Unique users with bookmarks: ${userIds.length}`);
    console.log("[AUDIT] Fetching user emails from auth.users...");

    // Note: auth.users requires service role access
    const { data: users, error: usersError } = await supabase
      .auth.admin.listUsers();

    if (usersError) {
      console.error("[AUDIT] Users query error:", usersError.message);
      return new Response(JSON.stringify({ error: usersError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build user map (id -> email)
    const userMap = new Map<string, string>();
    users.users.forEach(u => {
      if (userIds.includes(u.id)) {
        userMap.set(u.id, u.email || "[no email]");
      }
    });

    console.log(`[AUDIT] Users with emails found: ${userMap.size}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Check sent_show_reminders to exclude already-sent
    // ═══════════════════════════════════════════════════════════════════════
    console.log("───────────────────────────────────────────────────────────────");
    console.log("[AUDIT] Checking sent_show_reminders for duplicates...");

    // Build list of (user_id, show_id) pairs to check
    const pairsToCheck = bookmarks.map(b => ({
      user_id: b.user_id,
      show_id: b.show_id,
    }));

    // Query sent_show_reminders (if table exists)
    let alreadySent: Set<string> = new Set();
    try {
      const { data: sentReminders, error: sentError } = await supabase
        .from("sent_show_reminders")
        .select("user_id, show_id")
        .in("show_id", showIds);

      if (sentError) {
        if (sentError.message.includes("does not exist")) {
          console.log("[AUDIT] Table sent_show_reminders does not exist yet (OK for audit)");
        } else {
          console.warn("[AUDIT] sent_show_reminders query error:", sentError.message);
        }
      } else if (sentReminders) {
        sentReminders.forEach(r => {
          alreadySent.add(`${r.user_id}:${r.show_id}`);
        });
        console.log(`[AUDIT] Already sent reminders: ${alreadySent.size}`);
      }
    } catch (e) {
      console.log("[AUDIT] sent_show_reminders table may not exist yet (OK for audit)");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Build final candidate list
    // ═══════════════════════════════════════════════════════════════════════
    console.log("───────────────────────────────────────────────────────────────");
    console.log("[AUDIT] Building final reminder candidate list...");

    interface ReminderCandidate {
      show_id: string;
      show_title: string;
      scheduled_start_time: string;
      user_id: string;
      user_email: string;
      already_sent: boolean;
    }

    const candidates: ReminderCandidate[] = [];

    for (const bookmark of bookmarks) {
      const show = eligibleShows.find(s => s.id === bookmark.show_id);
      if (!show) continue;

      const email = userMap.get(bookmark.user_id) || "[unknown]";
      const pairKey = `${bookmark.user_id}:${bookmark.show_id}`;
      const wasSent = alreadySent.has(pairKey);

      candidates.push({
        show_id: show.id,
        show_title: show.title || "[untitled]",
        scheduled_start_time: show.scheduled_start_time,
        user_id: bookmark.user_id,
        user_email: email,
        already_sent: wasSent,
      });
    }

    // Filter to only unsent
    const eligibleCandidates = candidates.filter(c => !c.already_sent);

    console.log(`[AUDIT] Total candidates (including already sent): ${candidates.length}`);
    console.log(`[AUDIT] Eligible candidates (not yet sent): ${eligibleCandidates.length}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Log sample candidates (redact emails partially)
    // ═══════════════════════════════════════════════════════════════════════
    console.log("───────────────────────────────────────────────────────────────");
    console.log("[AUDIT] Sample candidates (first 3):");

    const sampleSize = Math.min(3, eligibleCandidates.length);
    for (let i = 0; i < sampleSize; i++) {
      const c = eligibleCandidates[i];
      // Redact email: show first 3 chars + domain
      const redactedEmail = c.user_email.replace(/^(.{3})(.*)(@.*)$/, "$1***$3");
      console.log(`  [${i + 1}] Show: "${c.show_title.substring(0, 30)}..." | User: ${redactedEmail} | Start: ${c.scheduled_start_time}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Return summary (NO WRITES)
    // ═══════════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[AUDIT] COMPLETE - NO EMAILS SENT - NO WRITES PERFORMED");
    console.log("═══════════════════════════════════════════════════════════════");

    const summary = {
      audit_result: "SUCCESS",
      audit_mode: "READ_ONLY",
      emails_sent: 0,
      rows_written: 0,
      total_candidates: candidates.length,
      eligible_candidates: eligibleCandidates.length,
      already_sent_count: candidates.length - eligibleCandidates.length,
      shows_checked: eligibleShows.length,
      users_matched: userMap.size,
      window: {
        db_time: now.toISOString(),
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      },
      shows: eligibleShows.map(s => ({
        id: s.id,
        title: s.title,
        scheduled_start_time: s.scheduled_start_time,
      })),
      // Include sample candidates with redacted emails
      sample_candidates: eligibleCandidates.slice(0, 3).map(c => ({
        show_id: c.show_id,
        show_title: c.show_title.substring(0, 50),
        user_id: c.user_id.substring(0, 8) + "...",
        scheduled_start_time: c.scheduled_start_time,
      })),
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[AUDIT] Unexpected error:", error);
    return new Response(JSON.stringify({ 
      error: "Audit failed", 
      details: String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
