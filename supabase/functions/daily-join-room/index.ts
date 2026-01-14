import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const dailyApiKey = Deno.env.get("DAILY_API_KEY")!;
    const dailyDomain = Deno.env.get("DAILY_DOMAIN")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") || "",
        },
      },
    });

    const payload = await req.json();
    const show_id = payload?.show_id ?? payload?.body?.show_id;

    if (!show_id) {
      return new Response(
        JSON.stringify({ error: "missing-show-id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id, streaming_provider, stream_status, daily_room_name, daily_room_url")
      .eq("id", show_id)
      .single();

    if (showError || !show) {
      return new Response(
        JSON.stringify({ error: "show-not-found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (show.streaming_provider !== "daily" || show.stream_status !== "live") {
      return new Response(
        JSON.stringify({ error: "show-not-live" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // INVARIANT: Room must have been created and stored before viewers can join
    if (!show.daily_room_name || !show.daily_room_url) {
      return new Response(
        JSON.stringify({ error: "daily-room-not-created" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roomName = show.daily_room_name;

    // Get user for token identity
    const { data: { user } } = await supabase.auth.getUser();

    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: false,
          user_id: user?.id,
          user_name: user?.email ?? "viewer",
          canSend: false,
          enable_screenshare: false,
          exp: Math.floor(Date.now() / 1000) + 60 * 60,
        }
      }),
    });

    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("[DAILY-JOIN-ROOM] Token error:", tokenJson);
      return new Response(
        JSON.stringify({ error: "daily-token-failed", details: tokenJson }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        room_url: show.daily_room_url,
        token: tokenJson.token,
        room_name: roomName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[DAILY-JOIN-ROOM] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "internal-error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
