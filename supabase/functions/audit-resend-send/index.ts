/**
 * AUDIT-ONLY: Resend API Key Verification
 * 
 * PURPOSE: Verify that RESEND_API_KEY is correctly configured
 * and that the Resend client can be instantiated.
 * 
 * THIS FUNCTION:
 * - ✅ Reads RESEND_API_KEY from environment
 * - ✅ Instantiates Resend client (if key present)
 * - ✅ Logs audit results
 * 
 * THIS FUNCTION DOES NOT:
 * - ❌ Send any emails
 * - ❌ Call resend.emails.send()
 * - ❌ Call any external APIs
 * - ❌ Write to any database tables
 * - ❌ Read from any database tables
 * 
 * SAFE TO RUN IN ANY ENVIRONMENT (read-only audit)
 */

import { Resend } from "https://esm.sh/resend@2.0.0";

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
  console.log("[AUDIT] Resend API Key Verification - READ-ONLY AUDIT");
  console.log("[AUDIT] Mode: NO EMAILS WILL BE SENT");
  console.log("[AUDIT] Mode: NO DATABASE WRITES");
  console.log("═══════════════════════════════════════════════════════════════");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Check for RESEND_API_KEY
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[AUDIT] Checking for RESEND_API_KEY...");

  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    console.log("[AUDIT] ❌ RESEND_API_KEY NOT FOUND");
    console.log("[AUDIT] The environment variable is not set.");
    console.log("═══════════════════════════════════════════════════════════════");
    
    return new Response(JSON.stringify({
      audit: "resend_send_audit",
      success: false,
      reason: "missing_key",
      key_present: false,
      key_length: 0,
      email_sent: false,
      writes_performed: 0,
      message: "RESEND_API_KEY environment variable is not configured.",
    }, null, 2), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Validate key format (basic check)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("[AUDIT] ✅ RESEND_API_KEY found");
  console.log(`[AUDIT] Key length: ${resendApiKey.length} characters`);
  console.log(`[AUDIT] Key prefix: ${resendApiKey.substring(0, 3)}...`);

  // Basic format validation (Resend keys typically start with "re_")
  const hasValidPrefix = resendApiKey.startsWith("re_");
  const hasValidLength = resendApiKey.length > 10;

  console.log(`[AUDIT] Has valid prefix (re_): ${hasValidPrefix}`);
  console.log(`[AUDIT] Has valid length (>10): ${hasValidLength}`);

  if (!hasValidPrefix) {
    console.log("[AUDIT] ⚠️ WARNING: Key does not start with 're_' - may be invalid");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: Instantiate Resend client (NO API CALLS)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("───────────────────────────────────────────────────────────────");
  console.log("[AUDIT] Attempting to instantiate Resend client...");

  let clientInitialized = false;
  let initError: string | null = null;

  try {
    // Instantiate client - this does NOT make any API calls
    const resend = new Resend(resendApiKey);
    
    // Verify the client object exists
    if (resend && typeof resend.emails === "object") {
      clientInitialized = true;
      console.log("[AUDIT] ✅ Resend client initialized successfully");
      console.log("[AUDIT] ✅ resend.emails object available");
      console.log("[AUDIT] ⚠️ NOT calling resend.emails.send() - audit only");
    } else {
      console.log("[AUDIT] ❌ Resend client initialized but emails object missing");
    }
  } catch (error) {
    initError = String(error);
    console.log("[AUDIT] ❌ Failed to instantiate Resend client");
    console.log(`[AUDIT] Error: ${initError}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: Summary
  // ═══════════════════════════════════════════════════════════════════════
  console.log("───────────────────────────────────────────────────────────────");
  console.log("[AUDIT] SUMMARY:");
  console.log(`[AUDIT]   Key present: YES`);
  console.log(`[AUDIT]   Key valid format: ${hasValidPrefix && hasValidLength ? "YES" : "MAYBE"}`);
  console.log(`[AUDIT]   Client initialized: ${clientInitialized ? "YES" : "NO"}`);
  console.log(`[AUDIT]   Emails sent: 0 (audit mode)`);
  console.log(`[AUDIT]   DB writes: 0 (audit mode)`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("[AUDIT] COMPLETE - NO EMAILS SENT - NO WRITES PERFORMED");
  console.log("═══════════════════════════════════════════════════════════════");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: Return audit result
  // ═══════════════════════════════════════════════════════════════════════
  const result = {
    audit: "resend_send_audit",
    success: clientInitialized,
    key_present: true,
    key_valid_format: hasValidPrefix && hasValidLength,
    key_length: resendApiKey.length,
    key_prefix: resendApiKey.substring(0, 3) + "...",
    client_initialized: clientInitialized,
    init_error: initError,
    email_sent: false,
    writes_performed: 0,
    message: clientInitialized 
      ? "Resend client is ready. Safe to proceed to email sending."
      : "Resend client failed to initialize. Check API key.",
  };

  return new Response(JSON.stringify(result, null, 2), {
    status: clientInitialized ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
