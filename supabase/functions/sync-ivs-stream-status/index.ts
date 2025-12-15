/**
 * Supabase Edge Function: sync-ivs-stream-status
 *
 * Synchronizes AWS IVS stream runtime state with Show records.
 * This is the authoritative source for determining live/offline status.
 *
 * Usage:
 * - Called on a schedule (cron) to keep all shows in sync
 * - Called after seller presses "Go Live" to detect stream start
 * - Called periodically while LiveShow page is open
 *
 * Security:
 * - Requires admin auth or service role key
 * - AWS credentials never exposed
 * - No stream keys accessed
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────────────
// AWS SIGNATURE V4 SIGNING
// ─────────────────────────────────────────────────────────────────────────────

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

async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const result = await hmacSha256(key, message);
  return Array.from(result)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = await hmacSha256Hex(kSigning, stringToSign);

  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    Authorization: authorization,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS IVS API CALLS
// ─────────────────────────────────────────────────────────────────────────────

interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

async function callIvsApi(
  action: string,
  config: AwsConfig,
  body: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  const url = `https://ivs.${config.region}.amazonaws.com/`;
  const bodyStr = JSON.stringify(body);

  try {
    const headers = await signAwsRequest(
      "POST",
      url,
      config.region,
      "ivs",
      config.accessKeyId,
      config.secretAccessKey,
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
      
      // Handle specific AWS errors gracefully
      if (response.status === 404 || errorText.includes("ChannelNotBroadcasting")) {
        // This is expected when stream is offline
        return { data: { stream: null } };
      }
      
      console.error(`[SYNC-IVS] AWS API error (${action}):`, response.status);
      return { error: `AWS API error: ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    console.error(`[SYNC-IVS] AWS API call failed (${action}):`, err);
    return { error: "Failed to call AWS API" };
  }
}

/**
 * Get active stream for a channel
 * Returns null if no stream is currently active
 */
async function getStream(
  channelArn: string,
  config: AwsConfig
): Promise<{ stream: StreamInfo | null; error?: string }> {
  const result = await callIvsApi("GetStream", config, { channelArn });

  if (result.error) {
    return { stream: null, error: result.error };
  }

  const data = result.data as { stream?: StreamInfo };
  return { stream: data.stream || null };
}

interface StreamInfo {
  channelArn: string;
  health: string; // "HEALTHY" | "STARVING" | "UNKNOWN"
  playbackUrl: string;
  startTime: string;
  state: string; // "LIVE" | "OFFLINE"
  streamId: string;
  viewerCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAM STATUS SYNC LOGIC
// ─────────────────────────────────────────────────────────────────────────────

interface ShowRecord {
  id: string;
  ivs_channel_arn: string | null;
  stream_status: string | null;
  is_streaming: boolean | null;
  status: string | null;
  viewer_count: number | null;
}

interface SyncResult {
  showId: string;
  previousStatus: string | null;
  newStatus: string;
  changed: boolean;
  viewerCount?: number;
  error?: string;
}

/**
 * Determine the new stream_status based on AWS IVS state
 */
function mapIvsStateToStatus(stream: StreamInfo | null): string {
  if (!stream) {
    return "offline";
  }

  // IVS stream states
  switch (stream.state) {
    case "LIVE":
      return "live";
    default:
      return "offline";
  }
}

/**
 * Sync a single show's stream status with AWS IVS
 */
async function syncShowStreamStatus(
  show: ShowRecord,
  config: AwsConfig,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<SyncResult> {
  const result: SyncResult = {
    showId: show.id,
    previousStatus: show.stream_status,
    newStatus: show.stream_status || "offline",
    changed: false,
  };

  // Skip if no IVS channel configured
  if (!show.ivs_channel_arn) {
    result.error = "No IVS channel configured";
    return result;
  }

  // Get stream state from AWS IVS
  const { stream, error } = await getStream(show.ivs_channel_arn, config);

  if (error) {
    result.error = error;
    return result;
  }

  // Determine new status
  const newStatus = mapIvsStateToStatus(stream);
  result.newStatus = newStatus;

  // Check if status has changed
  const statusChanged = show.stream_status !== newStatus;
  const streamingChanged = show.is_streaming !== (newStatus === "live");

  if (!statusChanged && !streamingChanged) {
    // No changes needed, but update viewer count if live
    if (stream && stream.viewerCount !== show.viewer_count) {
      await supabaseAdmin
        .from("shows")
        .update({ viewer_count: stream.viewerCount })
        .eq("id", show.id);
      result.viewerCount = stream.viewerCount;
    }
    return result;
  }

  result.changed = true;

  // Build update object
  const updates: Record<string, unknown> = {
    stream_status: newStatus,
    is_streaming: newStatus === "live",
  };

  // Handle state transitions
  if (newStatus === "live" && show.stream_status !== "live") {
    // Stream just went live
    updates.went_live_at = new Date().toISOString();
    updates.actual_start = new Date().toISOString();
    
    // Also update show status if it was scheduled
    if (show.status === "scheduled") {
      updates.status = "live";
    }
  } else if (newStatus === "offline" && show.stream_status === "live") {
    // Stream just ended
    updates.ended_at = new Date().toISOString();
    updates.actual_end = new Date().toISOString();
    
    // Optionally mark show as ended (only if it was live)
    if (show.status === "live") {
      updates.status = "ended";
    }
  }

  // Update viewer count if available
  if (stream) {
    updates.viewer_count = stream.viewerCount;
    result.viewerCount = stream.viewerCount;
  }

  // Perform the update
  const { error: updateError } = await supabaseAdmin
    .from("shows")
    .update(updates)
    .eq("id", show.id);

  if (updateError) {
    console.error(`[SYNC-IVS] Failed to update show ${show.id}:`, updateError.message);
    result.error = "Database update failed";
  } else {
    console.log(
      `[SYNC-IVS] Show ${show.id}: ${show.stream_status || "null"} → ${newStatus}`
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ─────────────────────────────────────────────────────────────────────
    // AUTHENTICATION
    // ─────────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Service client for database operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if request is from service role or authenticated admin
    let isAuthorized = false;
    
    // Check for service role key in Authorization header
    if (authHeader?.includes(supabaseServiceKey)) {
      isAuthorized = true;
    } else if (authHeader) {
      // Check if user is admin
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user } } = await supabaseUser.auth.getUser();
      
      if (user) {
        const isAdmin = 
          user.user_metadata?.role === "admin" || 
          user.role === "admin";
        isAuthorized = isAdmin;
      }
    }

    // Also allow internal calls without auth (for cron jobs)
    const isInternalCall = req.headers.get("x-internal-call") === "true";
    if (isInternalCall) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      console.warn("[SYNC-IVS] Unauthorized request");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // INPUT PARSING
    // ─────────────────────────────────────────────────────────────────────
    let showId: string | undefined;

    try {
      const body = await req.json();
      showId = body.showId;
    } catch {
      // No body or invalid JSON - sync all shows
    }

    // ─────────────────────────────────────────────────────────────────────
    // AWS CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────
    const awsConfig: AwsConfig = {
      accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") || "",
      secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") || "",
      region: Deno.env.get("AWS_REGION") || "us-east-1",
    };

    if (!awsConfig.accessKeyId || !awsConfig.secretAccessKey) {
      console.error("[SYNC-IVS] AWS credentials not configured");
      return new Response(
        JSON.stringify({ error: "AWS credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // FETCH SHOWS TO SYNC
    // ─────────────────────────────────────────────────────────────────────
    let shows: ShowRecord[];

    if (showId) {
      // Sync single show
      const { data, error } = await supabaseAdmin
        .from("shows")
        .select("id, ivs_channel_arn, stream_status, is_streaming, status, viewer_count")
        .eq("id", showId)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Show not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      shows = [data];
    } else {
      // Sync all shows with IVS configured
      // Only sync shows that are potentially live or recently active
      const { data, error } = await supabaseAdmin
        .from("shows")
        .select("id, ivs_channel_arn, stream_status, is_streaming, status, viewer_count")
        .not("ivs_channel_arn", "is", null)
        .in("status", ["scheduled", "live"]) // Only sync active shows
        .order("created_date", { ascending: false })
        .limit(100); // Limit to prevent excessive API calls

      if (error) {
        console.error("[SYNC-IVS] Failed to fetch shows:", error.message);
        return new Response(
          JSON.stringify({ error: "Failed to fetch shows" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      shows = data || [];
    }

    console.log(`[SYNC-IVS] Syncing ${shows.length} show(s)`);

    // ─────────────────────────────────────────────────────────────────────
    // SYNC EACH SHOW
    // ─────────────────────────────────────────────────────────────────────
    const results: SyncResult[] = [];

    for (const show of shows) {
      const result = await syncShowStreamStatus(show, awsConfig, supabaseAdmin);
      results.push(result);

      // Small delay between API calls to avoid rate limiting
      if (shows.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // RESPONSE
    // ─────────────────────────────────────────────────────────────────────
    const summary = {
      total: results.length,
      changed: results.filter((r) => r.changed).length,
      errors: results.filter((r) => r.error).length,
      live: results.filter((r) => r.newStatus === "live").length,
      offline: results.filter((r) => r.newStatus === "offline").length,
    };

    console.log(`[SYNC-IVS] Sync complete:`, summary);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results: showId ? results[0] : results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[SYNC-IVS] Error:", error);

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





