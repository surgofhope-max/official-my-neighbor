import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_API = "https://api.daily.co/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const dailyApiKey = Deno.env.get("DAILY_API_KEY")!;
    const dailyDomain = Deno.env.get("DAILY_DOMAIN")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    const show_id = payload.show_id ?? payload.body?.show_id;
    if (!show_id) {
      return new Response(
        JSON.stringify({ error: "Missing show_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch show
    const { data: show, error: showErr } = await supabase
      .from("shows")
      .select("id, seller_id, streaming_provider, daily_room_name, daily_room_url")
      .eq("id", show_id)
      .single();

    if (showErr || !show) {
      return new Response(
        JSON.stringify({ error: "Show not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (show.streaming_provider && show.streaming_provider !== "daily") {
      return new Response(
        JSON.stringify({ error: "Invalid provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: seller or admin
    // Note: show.seller_id references sellers.id, not users.id
    // We need to check if user owns the seller record
    const { data: sellerRecord } = await supabase
      .from("sellers")
      .select("id, user_id")
      .eq("id", show.seller_id)
      .single();

    const isSeller = sellerRecord?.user_id === user.id;
    const isAdmin = user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin";
    
    if (!isSeller && !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let roomName = show.daily_room_name;
    let roomUrl = show.daily_room_url;

    // Create room if missing
    if (!roomName || !roomUrl) {
      roomName = `show_${show.id}`;

      console.log("[DAILY-CREATE-ROOM] Creating room:", roomName);

      const createRoomRes = await fetch(`${DAILY_API}/rooms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dailyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName,
          properties: {
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4, // 4h TTL
            // BROADCAST MODE: Strict one-way streaming
            enable_chat: false,
            enable_people_ui: false,
            enable_network_ui: false,
            enable_pip_ui: false,
            enable_prejoin_ui: false,
            enable_recording: false,
            start_video_off: true,
            start_audio_off: true,
          },
        }),
      });

      if (!createRoomRes.ok) {
        const t = await createRoomRes.text();
        console.error("[DAILY-CREATE-ROOM] Room creation failed:", t);
        throw new Error(`Daily room create failed: ${t}`);
      }

      const room = await createRoomRes.json();
      roomUrl = room.url || `https://${dailyDomain}/${roomName}`;

      console.log("[DAILY-CREATE-ROOM] Room created:", roomUrl);

      const { error: updErr } = await supabase
        .from("shows")
        .update({
          daily_room_name: roomName,
          daily_room_url: roomUrl,
          streaming_provider: "daily",
          stream_status: "live",
          status: "live",
          started_at: new Date().toISOString()
        })
        .eq("id", show.id);

      if (updErr) {
        console.error("[DAILY-CREATE-ROOM] DB update failed:", updErr.message);
        throw updErr;
      }

      console.log("[DAILY-CREATE-ROOM] Show updated with room details");
    } else {
      console.log("[DAILY-CREATE-ROOM] Room already exists, reusing:", roomName);
    }

    // Create short-lived token for seller (owner) - BROADCAST PERMISSIONS
    const tokenRes = await fetch(`${DAILY_API}/meeting-tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dailyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 30, // 30 min
          // SELLER BROADCAST PERMISSIONS: Can publish audio/video only
          enable_screenshare: false,
        },
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[DAILY-CREATE-ROOM] Token creation failed:", t);
      throw new Error(`Daily token failed: ${t}`);
    }

    const token = await tokenRes.json();

    console.log("[DAILY-CREATE-ROOM] Token issued for room:", roomName);

    return new Response(
      JSON.stringify({
        room_name: roomName,
        room_url: roomUrl,
        token: token.token,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[DAILY-CREATE-ROOM] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

