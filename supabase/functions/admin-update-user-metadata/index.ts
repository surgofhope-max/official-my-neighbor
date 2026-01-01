/**
 * Admin Update User Metadata
 *
 * Supabase Edge Function to allow admin users to update another user's
 * auth metadata. This is needed because supabase.auth.admin.updateUserById()
 * is not available from the browser client.
 *
 * Security:
 * - Requires authentication
 * - Requires admin role check
 * - Uses service_role key server-side
 *
 * Usage:
 *   POST /functions/v1/admin-update-user-metadata
 *   Body: { target_user_id: string, metadata_updates: Record<string, unknown> }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's token to verify identity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client for verifying the caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify caller is authenticated
    const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is admin
    const callerRole = callerUser.user_metadata?.role || callerUser.role;
    if (callerRole !== "admin") {
      console.log("🚫 Non-admin user attempted to update user metadata:", callerUser.email);
      return new Response(
        JSON.stringify({ error: "Forbidden - admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { target_user_id, metadata_updates } = await req.json();

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "Missing target_user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!metadata_updates || typeof metadata_updates !== "object") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid metadata_updates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get target user's current metadata
    const { data: { user: targetUser }, error: getUserError } = await adminClient.auth.admin.getUserById(target_user_id);
    
    if (getUserError || !targetUser) {
      console.error("Failed to get target user:", getUserError);
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge existing metadata with updates
    const existingMetadata = targetUser.user_metadata || {};
    const newMetadata = {
      ...existingMetadata,
      ...metadata_updates
    };

    // Update user metadata
    const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { user_metadata: newMetadata }
    );

    if (updateError) {
      console.error("Failed to update user metadata:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update user metadata", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Admin updated user metadata");
    console.log("   Admin:", callerUser.email);
    console.log("   Target User ID:", target_user_id);
    console.log("   Updates:", JSON.stringify(metadata_updates));
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return new Response(
      JSON.stringify({
        success: true,
        user_id: target_user_id,
        updated_metadata: metadata_updates
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});










