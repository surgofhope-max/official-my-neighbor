/**
 * Stripe Standard OAuth callback handler.
 * Handles the redirect from Stripe after a seller authorizes OAuth connection.
 * Exchanges code for account, updates sellers table, redirects to SellerDashboard.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getUserIdFromJwt(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

async function verifySignedState(state: string, secret: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const expectedB64url = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  if (expectedB64url !== sigB64) return null;

  try {
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    const iat = payload.iat;
    if (typeof iat !== "number") return null;
    const maxAge = 3600;
    if (Date.now() / 1000 - iat > maxAge) return null;
    return payload.sub || null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET") || "";
  const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://myneighbor.live";
  const redirectTarget = `${frontendUrl}/sellerdashboard`;

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.redirect(`${redirectTarget}?error=server_misconfiguration`, 302);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  let userId: string | null = null;

  if (token) {
    userId = getUserIdFromJwt(token);
    if (!userId) {
      return Response.redirect(`${redirectTarget}?error=invalid_token`, 302);
    }
  } else if (state && stripeSecretKey) {
    userId = await verifySignedState(state, stripeSecretKey);
    if (!userId) {
      return Response.redirect(`${redirectTarget}?error=invalid_state`, 302);
    }
  } else {
    return Response.redirect(`${redirectTarget}?error=unauthorized`, 302);
  }

  if (!code) {
    return Response.redirect(`${redirectTarget}?error=missing_code`, 302);
  }

  if (!stripeSecretKey) {
    return Response.redirect(`${redirectTarget}?error=stripe_not_configured`, 302);
  }

  const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_secret: stripeSecretKey,
      code,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok) {
    console.error("[stripe-oauth-callback] Token exchange failed:", tokenData);
    const errCode = tokenData?.error || "token_exchange_failed";
    return Response.redirect(`${redirectTarget}?error=${encodeURIComponent(errCode)}`, 302);
  }

  const stripeUserId = tokenData?.stripe_user_id;
  if (!stripeUserId || typeof stripeUserId !== "string") {
    console.error("[stripe-oauth-callback] No stripe_user_id in response:", tokenData);
    return Response.redirect(`${redirectTarget}?error=no_account_id`, 302);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: seller, error } = await supabase
    .from("sellers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[stripe-oauth-callback] Seller lookup error:", error.message);
    return Response.redirect(`${redirectTarget}?error=seller_lookup_failed`, 302);
  }

  if (!seller?.id) {
    return Response.redirect(`${redirectTarget}?error=no_seller`, 302);
  }

  const { error: updateErr } = await supabase
    .from("sellers")
    .update({
      stripe_account_id: stripeUserId,
      stripe_connected: true,
      stripe_connected_at: new Date().toISOString(),
      connect_type: "standard",
    })
    .eq("id", seller.id);

  if (updateErr) {
    console.error("[stripe-oauth-callback] Update error:", updateErr.message);
    return Response.redirect(`${redirectTarget}?error=update_failed`, 302);
  }

  console.log("[stripe-oauth-callback] Standard account linked:", { seller_id: seller.id, stripe_user_id: stripeUserId });

  return Response.redirect(redirectTarget, 302);
});
