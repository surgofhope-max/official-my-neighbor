/**
 * Supabase Edge Function: get-ivs-ingest
 *
 * Securely provides AWS IVS ingest details to authorized sellers.
 *
 * Security:
 * - Requires valid Supabase session
 * - Verifies seller owns the show
 * - Supports admin impersonation
 * - AWS credentials never exposed to frontend
 * - Stream keys only returned in response body (never logged)
 *
 * Input:
 * {
 *   showId: string
 * }
 *
 * Output (success):
 * {
 *   ingestEndpoint: string,  // RTMPS ingest URL
 *   streamKey: string        // Stream key value
 * }
 *
 * TODO:
 * - Implement stream key rotation policy
 * - Add rate limiting for stream key creation
 * - Add audit logging for stream key access
 */

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * STRATEGY A — IMPLEMENTED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * stream_status lifecycle: starting | live | ended
 * 
 * This function provisions IVS channels and stream keys only.
 * It does NOT write to stream_status or any lifecycle fields.
 * 
 * Human actions (Start Broadcast, End Show) are the ONLY authority
 * for lifecycle transitions.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// AWS Signature Version 4 signing
// Using manual signing to avoid full AWS SDK dependency

/**
 * Create AWS Signature Version 4 signed headers
 */
async function signAwsRequest(
  method: string,
  url: string,
  region: string,
  service: string,
  accessKeyId: string,
  secretAccessKey: string,
  body: string = "",
  additionalHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const urlObj = new URL(url);
  const host = urlObj.host;
  const path = urlObj.pathname + urlObj.search;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  // Create canonical request
  const payloadHash = await sha256Hex(body);
  
  const headers: Record<string, string> = {
    host: host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...additionalHeaders,
  };

  if (body) {
    headers["content-type"] = "application/x-amz-json-1.1";
  }

  const sortedHeaders = Object.keys(headers).sort();
  const signedHeaders = sortedHeaders.join(";");
  const canonicalHeaders = sortedHeaders
    .map((key) => `${key}:${headers[key]}\n`)
    .join("");

  const canonicalRequest = [
    method,
    path || "/",
    "", // canonical query string (empty for POST)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // Create string to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  // Calculate signature
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = await hmacSha256Hex(kSigning, stringToSign);

  // Create authorization header
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    Authorization: authorization,
  };
}

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(
  key: string | Uint8Array,
  message: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyData = typeof key === "string" ? encoder.encode(key) : key;
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return new Uint8Array(signature);
}

async function hmacSha256Hex(
  key: Uint8Array,
  message: string
): Promise<string> {
  const result = await hmacSha256(key, message);
  return Array.from(result)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Call AWS IVS API
 */
async function callIvsApi(
  action: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  body: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  const url = `https://ivs.${region}.amazonaws.com/`;
  const bodyStr = JSON.stringify(body);

  try {
    const headers = await signAwsRequest(
      "POST",
      url,
      region,
      "ivs",
      accessKeyId,
      secretAccessKey,
      bodyStr,
      {
        "x-amz-target": `AmazonInteractiveVideoService.${action}`,
      }
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/x-amz-json-1.1",
      },
      body: bodyStr,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[IVS-INGEST] AWS API error (${action}):`, response.status, errorText);
      return { error: `AWS API error: ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    console.error(`[IVS-INGEST] AWS API call failed (${action}):`, err);
    return { error: "Failed to call AWS API" };
  }
}

/**
 * Get channel details from AWS IVS
 */
async function getChannel(
  channelArn: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{ channel?: unknown; error?: string }> {
  const result = await callIvsApi(
    "GetChannel",
    region,
    accessKeyId,
    secretAccessKey,
    { arn: channelArn }
  );

  if (result.error) {
    return { error: result.error };
  }

  return { channel: (result.data as { channel: unknown }).channel };
}

/**
 * List stream keys for a channel
 */
async function listStreamKeys(
  channelArn: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{ streamKeys?: unknown[]; error?: string }> {
  const result = await callIvsApi(
    "ListStreamKeys",
    region,
    accessKeyId,
    secretAccessKey,
    { channelArn }
  );

  if (result.error) {
    return { error: result.error };
  }

  return { streamKeys: (result.data as { streamKeys: unknown[] }).streamKeys };
}

/**
 * Get stream key details (including the actual key value)
 */
async function getStreamKey(
  streamKeyArn: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{ streamKey?: { arn: string; value: string }; error?: string }> {
  const result = await callIvsApi(
    "GetStreamKey",
    region,
    accessKeyId,
    secretAccessKey,
    { arn: streamKeyArn }
  );

  if (result.error) {
    return { error: result.error };
  }

  const streamKey = (result.data as { streamKey: { arn: string; value: string } }).streamKey;
  return { streamKey };
}

/**
 * Create a new stream key for a channel
 */
async function createStreamKey(
  channelArn: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<{ streamKey?: { arn: string; value: string }; error?: string }> {
  const result = await callIvsApi(
    "CreateStreamKey",
    region,
    accessKeyId,
    secretAccessKey,
    { channelArn }
  );

  if (result.error) {
    return { error: result.error };
  }

  const streamKey = (result.data as { streamKey: { arn: string; value: string } }).streamKey;
  return { streamKey };
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

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's auth for RLS
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for updates (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      console.error("[IVS-INGEST] Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[IVS-INGEST] Authenticated user: ${user.id}`);

    // ─────────────────────────────────────────────────────────────────────
    // INPUT VALIDATION
    // ─────────────────────────────────────────────────────────────────────
    const body = await req.json();
    const { showId } = body;

    if (!showId || typeof showId !== "string") {
      return new Response(
        JSON.stringify({ error: "showId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // RESOLVE EFFECTIVE SELLER CONTEXT (supports admin impersonation)
    // ─────────────────────────────────────────────────────────────────────
    
    // Check if user is admin
    const isAdmin = user.user_metadata?.role === "admin" || user.role === "admin";

    // Check for impersonation headers
    const impersonatedSellerId = req.headers.get("x-impersonate-seller-id");
    
    let effectiveSellerId: string | null = null;
    let effectiveSellerUserId: string | null = null;

    if (isAdmin && impersonatedSellerId) {
      // Admin impersonating a seller
      console.log(`[IVS-INGEST] Admin impersonating seller: ${impersonatedSellerId}`);
      effectiveSellerId = impersonatedSellerId;

      // Get the seller's user_id
      const { data: seller } = await supabaseAdmin
        .from("sellers")
        .select("id, user_id")
        .eq("id", impersonatedSellerId)
        .single();

      if (seller) {
        effectiveSellerUserId = seller.user_id;
      }
    } else {
      // Normal seller flow - find seller by user_id
      const { data: seller } = await supabaseAdmin
        .from("sellers")
        .select("id, user_id, status")
        .eq("user_id", user.id)
        .single();

      if (!seller) {
        return new Response(
          JSON.stringify({ error: "Seller profile not found" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (seller.status !== "approved" && !isAdmin) {
        return new Response(
          JSON.stringify({ error: "Seller not approved" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      effectiveSellerId = seller.id;
      effectiveSellerUserId = seller.user_id;
    }

    if (!effectiveSellerId) {
      return new Response(
        JSON.stringify({ error: "Could not determine seller context" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // AUTHORIZATION: Verify seller owns the show
    // ─────────────────────────────────────────────────────────────────────
    const { data: show, error: showError } = await supabaseAdmin
      .from("shows")
      .select("id, seller_id, title, ivs_channel_arn, ivs_ingest_endpoint, ivs_stream_key_arn")
      .eq("id", showId)
      .single();

    if (showError || !show) {
      console.error("[IVS-INGEST] Show not found:", showId);
      return new Response(
        JSON.stringify({ error: "Show not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify ownership
    if (show.seller_id !== effectiveSellerId && !isAdmin) {
      console.error("[IVS-INGEST] Unauthorized: seller mismatch");
      return new Response(
        JSON.stringify({ error: "You do not have access to this show" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // VALIDATE IVS CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────
    if (!show.ivs_channel_arn) {
      return new Response(
        JSON.stringify({ error: "Show does not have IVS channel configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // AWS CREDENTIALS
    // ─────────────────────────────────────────────────────────────────────
    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "us-east-1";

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      console.error("[IVS-INGEST] AWS credentials not configured");
      return new Response(
        JSON.stringify({ error: "Streaming service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET CHANNEL DETAILS FROM AWS IVS
    // ─────────────────────────────────────────────────────────────────────
    const channelResult = await getChannel(
      show.ivs_channel_arn,
      awsRegion,
      awsAccessKeyId,
      awsSecretAccessKey
    );

    if (channelResult.error) {
      console.error("[IVS-INGEST] Failed to get channel:", channelResult.error);
      return new Response(
        JSON.stringify({ error: "Failed to retrieve channel details" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const channel = channelResult.channel as {
      arn: string;
      ingestEndpoint: string;
      name: string;
    };

    const ingestEndpoint = `rtmps://${channel.ingestEndpoint}:443/app/`;

    // ─────────────────────────────────────────────────────────────────────
    // GET OR CREATE STREAM KEY
    // ─────────────────────────────────────────────────────────────────────
    let streamKeyValue: string;
    let streamKeyArn: string;

    // Check if we have a stored stream key ARN
    if (show.ivs_stream_key_arn) {
      // Try to get the existing stream key
      const streamKeyResult = await getStreamKey(
        show.ivs_stream_key_arn,
        awsRegion,
        awsAccessKeyId,
        awsSecretAccessKey
      );

      if (streamKeyResult.streamKey) {
        streamKeyValue = streamKeyResult.streamKey.value;
        streamKeyArn = streamKeyResult.streamKey.arn;
        console.log("[IVS-INGEST] Using existing stream key");
      } else {
        // Stream key may have been deleted, create a new one
        console.log("[IVS-INGEST] Stored stream key not found, creating new one");
        const createResult = await createStreamKey(
          show.ivs_channel_arn,
          awsRegion,
          awsAccessKeyId,
          awsSecretAccessKey
        );

        if (createResult.error || !createResult.streamKey) {
          return new Response(
            JSON.stringify({ error: "Failed to create stream key" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        streamKeyValue = createResult.streamKey.value;
        streamKeyArn = createResult.streamKey.arn;
      }
    } else {
      // No stored stream key, check if one exists or create new
      const listResult = await listStreamKeys(
        show.ivs_channel_arn,
        awsRegion,
        awsAccessKeyId,
        awsSecretAccessKey
      );

      if (listResult.streamKeys && listResult.streamKeys.length > 0) {
        // Use existing stream key
        const existingKey = listResult.streamKeys[0] as { arn: string };
        const streamKeyResult = await getStreamKey(
          existingKey.arn,
          awsRegion,
          awsAccessKeyId,
          awsSecretAccessKey
        );

        if (streamKeyResult.streamKey) {
          streamKeyValue = streamKeyResult.streamKey.value;
          streamKeyArn = streamKeyResult.streamKey.arn;
          console.log("[IVS-INGEST] Using existing stream key from channel");
        } else {
          // Create new if can't retrieve
          const createResult = await createStreamKey(
            show.ivs_channel_arn,
            awsRegion,
            awsAccessKeyId,
            awsSecretAccessKey
          );

          if (createResult.error || !createResult.streamKey) {
            return new Response(
              JSON.stringify({ error: "Failed to create stream key" }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          streamKeyValue = createResult.streamKey.value;
          streamKeyArn = createResult.streamKey.arn;
        }
      } else {
        // No stream keys exist, create one
        console.log("[IVS-INGEST] No stream keys exist, creating new one");
        const createResult = await createStreamKey(
          show.ivs_channel_arn,
          awsRegion,
          awsAccessKeyId,
          awsSecretAccessKey
        );

        if (createResult.error || !createResult.streamKey) {
          return new Response(
            JSON.stringify({ error: "Failed to create stream key" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        streamKeyValue = createResult.streamKey.value;
        streamKeyArn = createResult.streamKey.arn;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // UPDATE SHOW RECORD (IVS provisioning fields only)
    // ─────────────────────────────────────────────────────────────────────
    // STRATEGY A: Only write IVS provisioning fields.
    // stream_status is NOT written here — it is controlled by human actions only.
    const { error: updateError } = await supabaseAdmin
      .from("shows")
      .update({
        ivs_stream_key_arn: streamKeyArn,
        ivs_ingest_endpoint: ingestEndpoint,
      })
      .eq("id", showId);

    if (updateError) {
      console.warn("[IVS-INGEST] Failed to update show record:", updateError.message);
      // Continue anyway - we have the ingest details
    }

    // ─────────────────────────────────────────────────────────────────────
    // SUCCESS RESPONSE
    // ─────────────────────────────────────────────────────────────────────
    console.log(`[IVS-INGEST] Ingest details retrieved for show: ${showId}`);
    // SECURITY: Do NOT log streamKeyValue

    return new Response(
      JSON.stringify({
        ingestEndpoint,
        streamKey: streamKeyValue,
        // Additional helpful info for OBS/streaming software
        serverUrl: ingestEndpoint,
        streamKeyHint: "Use this as your Stream Key in OBS or your streaming software",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[IVS-INGEST] Error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





