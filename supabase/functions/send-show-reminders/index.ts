/**
 * LIVE SHOW REMINDER EMAIL SENDER
 * 
 * PURPOSE: Send reminder emails to users who bookmarked shows
 * starting in 4-6 minutes.
 * 
 * THIS FUNCTION:
 * - ✅ Queries scheduled shows in 4-6 minute window
 * - ✅ Joins bookmarked_shows to find interested users
 * - ✅ Excludes users who already received reminders
 * - ✅ Sends ONE email per eligible user/show pair
 * - ✅ Records sent reminders in sent_show_reminders
 * 
 * THIS FUNCTION DOES NOT:
 * - ❌ Retry failed emails
 * - ❌ Use cron (manual invocation only)
 * - ❌ Send SMS
 * - ❌ Touch orders, notifications, Stripe, etc.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReminderCandidate {
  user_id: string;
  user_email: string;
  show_id: string;
  show_title: string;
  scheduled_start_time: string;
  seller_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("[REMINDER] LIVE SHOW REMINDER EMAIL SENDER");
  console.log("[REMINDER] Mode: LIVE_SEND");
  console.log("═══════════════════════════════════════════════════════════════");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Validate environment
  // ═══════════════════════════════════════════════════════════════════════
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!resendApiKey) {
    console.log("[REMINDER] ❌ RESEND_API_KEY not found");
    return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.log("[REMINDER] ❌ Supabase credentials not found");
    return new Response(JSON.stringify({ error: "Supabase credentials missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[REMINDER] ✅ Environment validated");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Initialize clients
  // ═══════════════════════════════════════════════════════════════════════
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const resend = new Resend(resendApiKey);

  console.log("[REMINDER] ✅ Clients initialized");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: Calculate reminder window (4-8 minutes from now)
  // ═══════════════════════════════════════════════════════════════════════
  const now = new Date();
  const windowStart = new Date(now.getTime() + 4 * 60 * 1000); // +4 minutes
  const windowEnd = new Date(now.getTime() + 8 * 60 * 1000);   // +8 minutes

  console.log(`[REMINDER] Now: ${now.toISOString()}`);
  console.log(`[REMINDER] Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: Query eligible shows in the window
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[REMINDER] Querying eligible shows...");

  const { data: eligibleShows, error: showsError } = await supabase
    .from("shows")
    .select("id, title, scheduled_start_time, seller_id")
    .eq("status", "scheduled")
    .gte("scheduled_start_time", windowStart.toISOString())
    .lt("scheduled_start_time", windowEnd.toISOString());

  if (showsError) {
    console.log(`[REMINDER] ❌ Shows query error: ${showsError.message}`);
    return new Response(JSON.stringify({ error: showsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!eligibleShows || eligibleShows.length === 0) {
    console.log("[REMINDER] No shows in reminder window");
    return new Response(JSON.stringify({
      mode: "LIVE_SEND",
      emails_sent: 0,
      emails_failed: 0,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      message: "No shows in reminder window",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const showIds = eligibleShows.map((s) => s.id);
  console.log(`[REMINDER] Found ${eligibleShows.length} shows in window: ${showIds.join(", ")}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: Get bookmarks for these shows
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[REMINDER] Querying bookmarks...");

  const { data: bookmarks, error: bookmarksError } = await supabase
    .from("bookmarked_shows")
    .select("user_id, show_id")
    .in("show_id", showIds);

  if (bookmarksError) {
    console.log(`[REMINDER] ❌ Bookmarks query error: ${bookmarksError.message}`);
    return new Response(JSON.stringify({ error: bookmarksError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!bookmarks || bookmarks.length === 0) {
    console.log("[REMINDER] No bookmarks for eligible shows");
    return new Response(JSON.stringify({
      mode: "LIVE_SEND",
      emails_sent: 0,
      emails_failed: 0,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      message: "No bookmarks for shows in window",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[REMINDER] Found ${bookmarks.length} bookmarks`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6: Get already-sent reminders to exclude
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[REMINDER] Checking already-sent reminders...");

  const { data: sentReminders, error: sentError } = await supabase
    .from("sent_show_reminders")
    .select("user_id, show_id")
    .in("show_id", showIds);

  if (sentError) {
    // Table might not exist yet - continue with empty set
    console.log(`[REMINDER] ⚠️ sent_show_reminders query: ${sentError.message}`);
  }

  const sentSet = new Set(
    (sentReminders || []).map((r) => `${r.user_id}:${r.show_id}`)
  );
  console.log(`[REMINDER] Already sent: ${sentSet.size} reminders`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 7: Get user emails from auth.users
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[REMINDER] Fetching user emails...");

  const userIds = [...new Set(bookmarks.map((b) => b.user_id))];
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.log(`[REMINDER] ❌ Users query error: ${usersError.message}`);
    return new Response(JSON.stringify({ error: usersError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userEmailMap = new Map<string, string>();
  for (const user of usersData.users) {
    if (user.email && userIds.includes(user.id)) {
      userEmailMap.set(user.id, user.email);
    }
  }
  console.log(`[REMINDER] Found emails for ${userEmailMap.size} users`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 8: Build list of reminder candidates
  // ═══════════════════════════════════════════════════════════════════════
  const showMap = new Map(eligibleShows.map((s) => [s.id, s]));
  const candidates: ReminderCandidate[] = [];

  for (const bookmark of bookmarks) {
    const key = `${bookmark.user_id}:${bookmark.show_id}`;
    
    // Skip if already sent
    if (sentSet.has(key)) {
      continue;
    }

    // Skip if no email for user
    const userEmail = userEmailMap.get(bookmark.user_id);
    if (!userEmail) {
      continue;
    }

    // Get show details
    const show = showMap.get(bookmark.show_id);
    if (!show) {
      continue;
    }

    candidates.push({
      user_id: bookmark.user_id,
      user_email: userEmail,
      show_id: bookmark.show_id,
      show_title: show.title,
      scheduled_start_time: show.scheduled_start_time,
      seller_id: show.seller_id,
    });
  }

  console.log(`[REMINDER] Candidates to send: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("[REMINDER] No new reminders to send");
    return new Response(JSON.stringify({
      mode: "LIVE_SEND",
      emails_sent: 0,
      emails_failed: 0,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      message: "All eligible users already received reminders",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 9: Send emails and record results
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[REMINDER] ═══════════════════════════════════════════════════");
  console.log("[REMINDER] SENDING EMAILS (LIVE MODE)");
  console.log("[REMINDER] ═══════════════════════════════════════════════════");

  let emailsSent = 0;
  let emailsFailed = 0;

  for (const candidate of candidates) {
    console.log(`[REMINDER] Sending to ${candidate.user_email} for show "${candidate.show_title}"...`);

    try {
      // Format start time for display
      const startTime = new Date(candidate.scheduled_start_time);
      const formattedTime = startTime.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      // Send email via Resend
      const emailResult = await resend.emails.send({
        from: "MyNeighbor.Live <no-reply@myneighbor.live>",
        to: [candidate.user_email],
        subject: `⏰ Going live in 5 minutes — ${candidate.show_title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">Your bookmarked show is starting soon!</h2>
            <p style="font-size: 18px; color: #333;">
              <strong>${candidate.show_title}</strong> is going live in about 5 minutes.
            </p>
            <p style="color: #666;">
              Scheduled start: ${formattedTime}
            </p>
            <p style="margin-top: 24px;">
              <a href="https://myneighbor.live" 
                 style="background-color: #7c3aed; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                Watch Now
              </a>
            </p>
            <p style="margin-top: 32px; font-size: 12px; color: #999;">
              You're receiving this because you bookmarked this show on MyNeighbor.Live.
            </p>
          </div>
        `,
      });

      console.log(`[REMINDER] ✅ Email sent to ${candidate.user_email}`);

      // Record the sent reminder (idempotent)
      const { error: insertError } = await supabase
        .from("sent_show_reminders")
        .upsert(
          {
            user_id: candidate.user_id,
            show_id: candidate.show_id,
          },
          {
            onConflict: "user_id,show_id",
            ignoreDuplicates: true,
          }
        );

      if (insertError) {
        console.log(`[REMINDER] ⚠️ Failed to record reminder: ${insertError.message}`);
        // Still count as sent since email went out
      } else {
        console.log(`[REMINDER] ✅ Reminder recorded for ${candidate.user_id}`);
      }

      emailsSent++;

    } catch (emailError) {
      console.log(`[REMINDER] ❌ Failed to send to ${candidate.user_email}: ${String(emailError)}`);
      emailsFailed++;
      // Continue to next candidate - no retry, no rollback
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 10: Return summary
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[REMINDER] ═══════════════════════════════════════════════════");
  console.log(`[REMINDER] COMPLETE: ${emailsSent} sent, ${emailsFailed} failed`);
  console.log("[REMINDER] ═══════════════════════════════════════════════════");

  return new Response(JSON.stringify({
    mode: "LIVE_SEND",
    emails_sent: emailsSent,
    emails_failed: emailsFailed,
    candidates_total: candidates.length,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
  }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
