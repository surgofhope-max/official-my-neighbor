/**
 * Stripe Standard OAuth start.
 * Generates the OAuth authorize URL for Stripe Connect Standard onboarding.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getUserIdFromJwt(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

async function createSignedState(sub: string, secret: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ sub, iat });
  const payloadB64 = base64UrlEncode(payload);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));

  return `${payloadB64}.${sigB64}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Authorization Bearer token required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const userId = getUserIdFromJwt(token);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const stripeClientIdRaw = Deno.env.get("STRIPE_CLIENT_ID") ?? "";
  const stripeClientId = stripeClientIdRaw.trim();
  console.log("STRIPE_CLIENT_ID raw:", JSON.stringify(stripeClientIdRaw));
  console.log("STRIPE_CLIENT_ID trimmed:", JSON.stringify(stripeClientId));
  if (!stripeClientId.startsWith("ca_")) {
    console.error("invalid_stripe_client_id", { raw: JSON.stringify(stripeClientIdRaw), trimmed: JSON.stringify(stripeClientId) });
    return new Response(
      JSON.stringify({ error: "invalid_stripe_client_id" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const redirectUri = `${supabaseUrl}/functions/v1/stripe-oauth-callback`;
  const state = await createSignedState(userId, stripeSecretKey);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: stripeClientId,
    scope: "read_write",
    redirect_uri: redirectUri,
    state,
  });

  const authorizeUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

  return new Response(
    JSON.stringify({ authorize_url: authorizeUrl }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
