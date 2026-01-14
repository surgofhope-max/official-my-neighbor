/**
 * Supabase Edge Function: get-ivs-playback-token
 *
 * Generates AWS IVS playback authorization tokens for authenticated users.
 *
 * Security:
 * - Requires valid Supabase session (authenticated users only)
 * - Private key stored in Supabase Vault, never exposed to frontend
 * - Tokens are short-lived (5 minutes)
 *
 * Input:
 * {
 *   channelArn: string,  // AWS IVS channel ARN
 *   playbackUrl: string  // The playback URL (used for claims)
 * }
 *
 * Output:
 * {
 *   token: string  // Signed JWT for IVS playback authorization
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Token expiration in seconds (5 minutes)
const TOKEN_TTL_SECONDS = 300;

/**
 * Base64URL encode a string or Uint8Array
 */
function base64UrlEncode(data: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data;
  }
  
  // Convert to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  
  // Convert to base64url
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Parse a PEM-formatted private key to extract the raw key bytes.
 * AWS IVS uses ECDSA P-384 keys.
 */
function parsePemPrivateKey(pem: string): string {
  // Remove PEM headers/footers and whitespace
  const base64Key = pem
    .replace(/-----BEGIN.*?-----/g, "")
    .replace(/-----END.*?-----/g, "")
    .replace(/\s/g, "");
  return base64Key;
}

/**
 * Import the private key for signing (ECDSA P-384)
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const base64Key = parsePemPrivateKey(pem);
  
  // Decode base64 to binary
  const binaryString = atob(base64Key);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Import as ECDSA P-384 private key (PKCS#8 format)
  return await crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    false, // not extractable
    ["sign"]
  );
}

/**
 * Generate an AWS IVS playback authorization token.
 *
 * IVS playback tokens are JWTs signed with ES384 (ECDSA using P-384 and SHA-384).
 *
 * Required claims:
 * - aws:channel-arn: The channel ARN
 * - exp: Expiration timestamp
 *
 * @param privateKey - The ECDSA private key (PEM format)
 * @param channelArn - The AWS IVS channel ARN
 * @param ttlSeconds - Token time-to-live in seconds
 * @returns Signed JWT token
 */
async function generateIvsPlaybackToken(
  privateKeyPem: string,
  channelArn: string,
  ttlSeconds: number
): Promise<string> {
  // Import the private key
  const privateKey = await importPrivateKey(privateKeyPem);

  // Current time and expiration
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  // JWT Header (ES384 = ECDSA with P-384 and SHA-384)
  const header = {
    alg: "ES384",
    typ: "JWT",
  };

  // JWT Payload with IVS-specific claims
  const payload = {
    "aws:channel-arn": channelArn,
    "aws:access-control-allow-origin": "*", // Allow all origins for playback
    exp: exp,
    iat: now,
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with ECDSA P-384
  const signatureBytes = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-384" },
    },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  // Encode signature
  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBytes));

  // Assemble the complete JWT
  return `${signingInput}.${encodedSignature}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ─────────────────────────────────────────────────────────────────────
    // AUTHENTICATION: Verify Supabase session
    // ─────────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client with the user's JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify the user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[IVS-TOKEN] Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[IVS-TOKEN] Authenticated user: ${user.id}`);

    // ─────────────────────────────────────────────────────────────────────
    // INPUT VALIDATION
    // ─────────────────────────────────────────────────────────────────────
    const body = await req.json();
    const { channelArn, playbackUrl } = body;

    if (!channelArn || typeof channelArn !== "string") {
      return new Response(
        JSON.stringify({ error: "channelArn is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate channel ARN format (basic check)
    if (!channelArn.startsWith("arn:aws:ivs:")) {
      return new Response(
        JSON.stringify({ error: "Invalid channel ARN format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // AUTHORIZATION: Show lookup + live check + viewer ban check
    // ─────────────────────────────────────────────────────────────────────
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) {
      console.error("[IVS-TOKEN] SUPABASE_SERVICE_ROLE_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 1) Look up show by channelArn
    const { data: show, error: showError } = await supabaseAdmin
      .from("shows")
      .select("id, seller_id, status, stream_status")
      .eq("ivs_channel_arn", channelArn)
      .maybeSingle();

    if (showError) {
      console.error("[IVS-TOKEN] Show lookup failed:", showError.message);
      return new Response(
        JSON.stringify({ error: "Failed to verify show" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!show) {
      console.warn("[IVS-TOKEN] Show not found for channel:", channelArn);
      return new Response(
        JSON.stringify({ error: "Show not found for channel" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2) Enforce live-only playback
    if (show.stream_status !== "live") {
      console.warn("[IVS-TOKEN] Show not live:", show.id, "stream_status:", show.stream_status);
      return new Response(
        JSON.stringify({ error: "Show is not live" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3) Enforce viewer bans
    const { data: viewerBan, error: banError } = await supabaseAdmin
      .from("viewer_bans")
      .select("id, ban_type")
      .eq("seller_id", show.seller_id)
      .eq("viewer_id", user.id)
      .in("ban_type", ["view", "full"])
      .maybeSingle();

    if (banError) {
      console.error("[IVS-TOKEN] Ban check failed:", banError.message);
      // Fail closed - deny if we can't verify ban status
      return new Response(
        JSON.stringify({ error: "Failed to verify viewer access" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (viewerBan) {
      console.warn("[IVS-TOKEN] Viewer banned:", user.id, "seller:", show.seller_id, "ban_type:", viewerBan.ban_type);
      return new Response(
        JSON.stringify({ error: "Viewer banned" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[IVS-TOKEN] Authorization passed for show:", show.id);

    // ─────────────────────────────────────────────────────────────────────
    // RETRIEVE PRIVATE KEY FROM VAULT
    // ─────────────────────────────────────────────────────────────────────
    // The private key is stored in Supabase Vault as a secret.
    // It can be accessed via environment variable or Vault API.
    const privateKeyPem = Deno.env.get("IVS_PLAYBACK_PRIVATE_KEY");

    if (!privateKeyPem) {
      console.error("[IVS-TOKEN] IVS_PLAYBACK_PRIVATE_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Playback authorization not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // SECURITY: Never log the private key
    console.log("[IVS-TOKEN] Private key loaded from Vault");

    // ─────────────────────────────────────────────────────────────────────
    // GENERATE PLAYBACK TOKEN
    // ─────────────────────────────────────────────────────────────────────
    const token = await generateIvsPlaybackToken(
      privateKeyPem,
      channelArn,
      TOKEN_TTL_SECONDS
    );

    console.log(
      `[IVS-TOKEN] Token generated for channel: ${channelArn.split("/").pop()}`
    );

    return new Response(
      JSON.stringify({
        token,
        expiresIn: TOKEN_TTL_SECONDS,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[IVS-TOKEN] Error:", error);

    // Don't expose internal error details
    return new Response(
      JSON.stringify({ error: "Failed to generate playback token" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





