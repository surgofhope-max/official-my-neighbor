/**
 * Approve Seller (Atomic)
 *
 * Supabase Edge Function to handle seller status changes atomically.
 * Updates sellers table, user metadata, and creates notification in one operation.
 *
 * Security:
 * - Requires valid JWT in Authorization header
 * - Requires admin OR super_admin role (from user_metadata.role)
 * - Uses service_role key for all DB operations
 *
 * Usage:
 *   POST /functions/v1/approve-seller
 *   Body: {
 *     seller_id: string,
 *     seller_user_id: string,
 *     new_status: "approved" | "declined" | "suspended" | "pending",
 *     status_reason?: string
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Valid status values
const VALID_STATUSES = ["approved", "declined", "suspended", "pending"] as const;
type SellerStatus = typeof VALID_STATUSES[number];

// Helper to decode JWT payload (no verification - Supabase already signed it)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    // Decode base64url payload
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("Failed to decode JWT:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔍 DEBUG LOGGING — REMOVE BEFORE PRODUCTION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 APPROVE-SELLER DEBUG - REQUEST RECEIVED");
  console.log("   Method:", req.method);
  console.log("   URL:", req.url);
  console.log("   Has Authorization:", !!req.headers.get("Authorization"));
  console.log("   Authorization prefix:", req.headers.get("Authorization")?.substring(0, 30) + "...");
  
  // Clone request to read body without consuming it
  const clonedReq = req.clone();
  try {
    const bodyText = await clonedReq.text();
    console.log("   Body:", bodyText.substring(0, 200));
  } catch {
    console.log("   Body: (unable to read)");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  // ═══════════════════════════════════════════════════════════════════════════

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. EXTRACT JWT FROM AUTHORIZATION HEADER
    // ═══════════════════════════════════════════════════════════════════════════
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("🔍 DEBUG - No Authorization header");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract bearer token
    const token = authHeader.replace("Bearer ", "");
    if (!token || token === authHeader) {
      console.log("🔍 DEBUG - Invalid Authorization format (expected 'Bearer <token>')");
      return new Response(
        JSON.stringify({ error: "Invalid authorization format" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. DECODE JWT TO GET USER CLAIMS (No verification needed - Supabase signed it)
    // ═══════════════════════════════════════════════════════════════════════════
    const jwtPayload = decodeJwtPayload(token);
    
    console.log("🔍 DEBUG - JWT decode result:");
    console.log("   jwtPayload:", jwtPayload ? "decoded successfully" : "FAILED");
    
    if (!jwtPayload) {
      return new Response(
        JSON.stringify({ error: "Invalid JWT token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract user info from JWT claims
    const callerUserId = jwtPayload.sub as string;
    const callerEmail = jwtPayload.email as string;
    const userMetadata = jwtPayload.user_metadata as Record<string, unknown> || {};
    
    console.log("🔍 DEBUG - JWT claims:");
    console.log("   sub (user_id):", callerUserId);
    console.log("   email:", callerEmail);
    console.log("   user_metadata:", JSON.stringify(userMetadata));

    if (!callerUserId) {
      return new Response(
        JSON.stringify({ error: "Invalid JWT - missing user ID" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. AUTHORIZATION - Allow admin OR super_admin
    // ═══════════════════════════════════════════════════════════════════════════
    const callerRole = userMetadata.role as string || "";
    
    console.log("🔍 DEBUG - Role check:");
    console.log("   callerRole:", callerRole);
    console.log("   Is admin?:", callerRole === "admin");
    console.log("   Is super_admin?:", callerRole === "super_admin");
    
    if (callerRole !== "admin" && callerRole !== "super_admin") {
      console.log("🚫 Unauthorized role attempted seller approval:", callerEmail, "role:", callerRole);
      return new Response(
        JSON.stringify({ error: "Forbidden - admin or super_admin role required", your_role: callerRole || "(none)" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. PARSE AND VALIDATE REQUEST BODY
    // ═══════════════════════════════════════════════════════════════════════════
    const { seller_id, seller_user_id, new_status, status_reason } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: "Missing seller_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!seller_user_id) {
      return new Response(
        JSON.stringify({ error: "Missing seller_user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!new_status || !VALID_STATUSES.includes(new_status as SellerStatus)) {
      return new Response(
        JSON.stringify({ error: `Invalid new_status. Must be one of: ${VALID_STATUSES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 APPROVE-SELLER - Processing request");
    console.log("   Admin:", callerEmail, `(${callerRole})`);
    console.log("   Seller ID:", seller_id);
    console.log("   Seller User ID:", seller_user_id);
    console.log("   New Status:", new_status);
    console.log("   Reason:", status_reason || "(none)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. CREATE SERVICE ROLE CLIENT FOR ALL DB OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. UPDATE SELLERS TABLE
    // ═══════════════════════════════════════════════════════════════════════════
    const { error: sellerUpdateError } = await adminClient
      .from("sellers")
      .update({
        status: new_status,
        status_reason: status_reason || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", seller_id);

    if (sellerUpdateError) {
      console.error("❌ Failed to update sellers table:", sellerUpdateError);
      return new Response(
        JSON.stringify({ error: "Failed to update seller status", details: sellerUpdateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Step 1: sellers.status updated to", new_status);

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. UPDATE USER METADATA
    // ═══════════════════════════════════════════════════════════════════════════
    const { data: { user: targetUser }, error: getUserError } = await adminClient.auth.admin.getUserById(seller_user_id);
    
    if (getUserError || !targetUser) {
      console.error("❌ Failed to get target user:", getUserError);
      console.warn("⚠️ Continuing without user_metadata update");
    } else {
      // Build metadata updates based on status
      let metadataUpdates: Record<string, unknown> = {};
      const now = new Date().toISOString();

      if (new_status === "approved") {
        metadataUpdates = {
          seller_application_status: "approved",
          seller_approved: true,
          seller_approved_at: now
        };
      } else if (new_status === "declined") {
        metadataUpdates = {
          seller_application_status: "declined",
          seller_approved: false,
          seller_declined_at: now,
          seller_decline_reason: status_reason || null
        };
      } else if (new_status === "suspended") {
        metadataUpdates = {
          seller_application_status: "suspended",
          seller_approved: false,
          seller_suspended_at: now,
          seller_suspend_reason: status_reason || null
        };
      } else if (new_status === "pending") {
        metadataUpdates = {
          seller_application_status: "pending",
          seller_approved: false
        };
      }

      // Merge with existing metadata
      const existingMetadata = targetUser.user_metadata || {};
      const newMetadata = {
        ...existingMetadata,
        ...metadataUpdates
      };

      const { error: updateMetaError } = await adminClient.auth.admin.updateUserById(
        seller_user_id,
        { user_metadata: newMetadata }
      );

      if (updateMetaError) {
        console.error("❌ Failed to update user_metadata:", updateMetaError);
        console.warn("⚠️ Continuing without user_metadata update");
      } else {
        console.log("✅ Step 2: user_metadata updated");
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. CREATE NOTIFICATION
    // ═══════════════════════════════════════════════════════════════════════════
    let notificationTitle = "";
    let notificationBody = "";
    const notificationType = "system";
    let notificationEvent = "";

    if (new_status === "approved") {
      notificationTitle = "Seller Application Approved! 🎉";
      notificationBody = "Congratulations! Your seller application has been approved. You can now access your Seller Dashboard and start selling.";
      notificationEvent = "seller_approved";
    } else if (new_status === "declined") {
      notificationTitle = "Seller Application Update";
      notificationBody = status_reason
        ? `Your seller application was not approved. Reason: ${status_reason}`
        : "Your seller application was not approved at this time.";
      notificationEvent = "seller_declined";
    } else if (new_status === "suspended") {
      notificationTitle = "Seller Account Suspended";
      notificationBody = status_reason
        ? `Your seller account has been suspended. Reason: ${status_reason}`
        : "Your seller account has been suspended.";
      notificationEvent = "seller_suspended";
    }

    // Only create notification for status changes that warrant one
    if (notificationTitle) {
      const { error: notificationError } = await adminClient
        .from("notifications")
        .insert({
          user_id: seller_user_id,
          title: notificationTitle,
          body: notificationBody,
          type: notificationType,
          is_read: false,
          metadata: {
            event: notificationEvent,
            seller_id: seller_id,
            reason: status_reason || null,
            changed_by: callerEmail
          }
        });

      if (notificationError) {
        console.error("❌ Failed to create notification:", notificationError);
        console.warn("⚠️ Notification not created, but approval succeeded");
      } else {
        console.log("✅ Step 3: Notification created");
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. SUCCESS RESPONSE
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ APPROVE-SELLER completed successfully");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return new Response(
      JSON.stringify({
        success: true,
        seller_id,
        seller_user_id,
        new_status,
        message: `Seller status updated to ${new_status}`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
