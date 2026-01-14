import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type ApproveSellerBody = {
  seller_id: string;
  seller_user_id?: string | null;
  new_status: "approved" | "declined" | "suspended" | "pending";
  status_reason?: string | null;
};

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey,authorization,content-type,x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const ENABLE_IVS_PROVISIONING = false; // HOLD: Daily-first MVP. Re-enable later for Advanced streaming.

// ═══════════════════════════════════════════════════════════════════════════════
// AWS IVS API HELPERS (copied from get-ivs-ingest for isolation)
// ═══════════════════════════════════════════════════════════════════════════════

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
    headers["content-type"] = "application/json";
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

  // FORENSIC LOGGING - SigV4 context
  console.log("[IVS-AUDIT] region:", region);
  console.log("[IVS-AUDIT] service:", service);
  console.log("[IVS-AUDIT] canonicalRequest:\n" + canonicalRequest);
  console.log("[IVS-AUDIT] signedHeaders:", signedHeaders);
  console.log("[IVS-AUDIT] credentialScope:", credentialScope);
  console.log("[IVS-AUDIT] payloadHash:", payloadHash);

  return {
    ...headers,
    Authorization: authorization,
  };
}

async function callIvsApi(
  action: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  body: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  const url = `https://ivs.${region}.amazonaws.com/${action}`;
  const bodyStr = JSON.stringify(body);

  try {
    const headers = await signAwsRequest(
      "POST",
      url,
      region,
      "ivs",
      accessKeyId,
      secretAccessKey,
      bodyStr
    );

    // FORENSIC LOGGING - Request context
    console.log("[IVS-AUDIT] requestUrl:", url);
    console.log("[IVS-AUDIT] requestBody:", bodyStr);
    const safeHeaders = { ...headers };
    if (safeHeaders.Authorization) {
      safeHeaders.Authorization = safeHeaders.Authorization.slice(0, 60) + "...REDACTED";
    }
    console.log("[IVS-AUDIT] requestHeaders:", safeHeaders);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
      },
      body: bodyStr,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[APPROVE-SELLER][IVS] AWS API error (${action}):`, response.status, errorText);
      return { error: `AWS API error: ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    console.error(`[APPROVE-SELLER][IVS] AWS API call failed (${action}):`, err);
    return { error: "Failed to call AWS API" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  console.log("[APPROVE-SELLER] handler entered", { method: req.method });

  const headers = corsHeaders(req);

  // Fast CORS preflight
  if (req.method === "OPTIONS") {
    console.log("[APPROVE-SELLER] CORS preflight, returning 204");
    return new Response(null, { status: 204, headers });
  }

  console.log("[APPROVE-SELLER] POST request reached", {
    method: req.method,
    contentType: req.headers.get("content-type")
  });

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method Not Allowed" }, headers);
  }

  try {
    // Required env
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    // Prefer service role key for admin updates + table writes
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE") ||
      Deno.env.get("SERVICE_ROLE_KEY");

    if (!SERVICE_ROLE_KEY) {
      return json(
        500,
        {
          success: false,
          error:
            "Missing service role key env var. Set SUPABASE_SERVICE_ROLE_KEY in Supabase Function Secrets.",
        },
        headers
      );
    }

    // Auth: require caller JWT
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { success: false, error: "Missing Authorization Bearer token" }, headers);
    }

    const callerJwt = authHeader.slice("bearer ".length).trim();

    // Clients
    // - callerClient: validate caller + read role from JWT user
    // - adminClient: service role for DB writes + auth admin updates
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${callerJwt}` } },
      auth: { persistSession: false },
    });

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Validate caller
    const { data: callerUserData, error: callerUserErr } = await callerClient.auth.getUser();
    if (callerUserErr || !callerUserData?.user) {
      return json(401, { success: false, error: "Invalid session" }, headers);
    }

    const callerUser = callerUserData.user;
    const role =
      (callerUser.user_metadata as any)?.role ||
      (callerUser.app_metadata as any)?.role ||
      null;

    // Enforce admin
    // Accept: super_admin or admin (you can tighten later)
    if (role !== "super_admin" && role !== "admin") {
      return json(403, { success: false, error: "Forbidden: admin only" }, headers);
    }

    // Parse body
    let body: ApproveSellerBody | null = null;
    try {
      body = (await req.json()) as ApproveSellerBody;
    } catch {
      return json(400, { success: false, error: "Invalid JSON body" }, headers);
    }

    const seller_id = body?.seller_id;
    const seller_user_id = body?.seller_user_id ?? null;
    const new_status = body?.new_status;
    const status_reason = body?.status_reason ?? null;

    console.log("[APPROVE-SELLER] payload received", { seller_id, seller_user_id, new_status, status_reason });

    if (!seller_id || typeof seller_id !== "string") {
      return json(400, { success: false, error: "seller_id is required" }, headers);
    }

    const allowedStatuses = new Set(["approved", "declined", "suspended", "pending"]);
    if (!new_status || !allowedStatuses.has(new_status)) {
      return json(
        400,
        { success: false, error: "new_status must be one of: approved, declined, suspended, pending" },
        headers
      );
    }

    // 1) Update sellers.status (and reason if column exists)
    // We update safely: try including status_reason; if column missing, retry without it.
    let sellerUpdateError: any = null;

    const updatePayloadWithReason: Record<string, any> = {
      status: new_status,
      status_updated_at: new Date().toISOString(),
    };
    if (status_reason !== null) updatePayloadWithReason.status_reason = status_reason;

    console.log("[APPROVE-SELLER] updating sellers.status", { seller_id, new_status });

    const attempt1 = await adminClient
      .from("sellers")
      .update(updatePayloadWithReason)
      .eq("id", seller_id)
      .select("id,user_id,status");

    if (attempt1.error) {
      // Retry without status_reason/status_updated_at if schema differs
      const updatePayloadFallback: Record<string, any> = { status: new_status };
      const attempt2 = await adminClient
        .from("sellers")
        .update(updatePayloadFallback)
        .eq("id", seller_id)
        .select("id,user_id,status");

      if (attempt2.error) sellerUpdateError = attempt2.error;
    }

    if (sellerUpdateError) {
      console.log("[APPROVE-SELLER] sellers.status update FAILED", { error: sellerUpdateError.message });
      return json(
        500,
        { success: false, error: `Failed to update sellers.status: ${sellerUpdateError.message ?? String(sellerUpdateError)}` },
        headers
      );
    }

    console.log("[APPROVE-SELLER] sellers.status updated");

    // 2) Sync user_metadata (best-effort)
    // Determine seller user id: prefer payload, else fetch from sellers row
    let resolvedSellerUserId = seller_user_id;

    if (!resolvedSellerUserId) {
      const { data: sellerRow, error: sellerFetchErr } = await adminClient
        .from("sellers")
        .select("user_id")
        .eq("id", seller_id)
        .maybeSingle();

      if (!sellerFetchErr && sellerRow?.user_id) {
        resolvedSellerUserId = sellerRow.user_id as string;
      }
    }

    if (resolvedSellerUserId) {
      console.log("[APPROVE-SELLER] syncing user_metadata", { seller_user_id: resolvedSellerUserId, new_status });

      // Update user_metadata.seller_application_status (and/or seller_status) to keep consistent
      // NOTE: You previously identified inconsistencies; we write both keys for compatibility.
      const { error: updUserErr } = await adminClient.auth.admin.updateUserById(resolvedSellerUserId, {
        user_metadata: {
          seller_application_status: new_status,
          seller_status: new_status,
          seller_status_reason: status_reason,
          seller_status_updated_at: new Date().toISOString(),
        },
      });

      // Do not hard-fail on metadata sync
      if (updUserErr) {
        console.log("[APPROVE-SELLER] metadata sync failed (non-blocking):", updUserErr.message);
      } else {
        console.log("[APPROVE-SELLER] user_metadata synced");
      }
    } else {
      console.log("[APPROVE-SELLER] seller_user_id unresolved; skipping metadata sync");
    }

    // 3) Create notification (best-effort; do not block)
    // Attempt insert if table exists
    // Schema: user_id, title, body, type, metadata, read, read_at
    try {
      if (resolvedSellerUserId) {
        console.log("[APPROVE-SELLER] inserting notification");

        const notifPayload = {
          user_id: resolvedSellerUserId,
          type: "seller_status_update",
          title: "Seller status updated",
          body: `Your seller status is now: ${new_status}`,
          metadata: { seller_id, new_status, status_reason },
          read: false,
          read_at: null,
        };

        const notifRes = await adminClient.from("notifications").insert(notifPayload);
        if (notifRes.error) {
          console.log("[APPROVE-SELLER] notification insert failed (non-blocking):", notifRes.error.message);
        } else {
          console.log("[APPROVE-SELLER] notification inserted");
        }
      }
    } catch (e) {
      console.log("[APPROVE-SELLER] notification insert exception (non-blocking):", String(e));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NON-BLOCKING: Seller-scoped IVS provisioning (only on approval)
    // ═══════════════════════════════════════════════════════════════════════════
    if (ENABLE_IVS_PROVISIONING && new_status === "approved") {
      try {
        console.log("[APPROVE-SELLER][IVS] checking seller_streaming_profiles");

        // a) Fetch existing seller streaming profile
        const { data: existingProfile, error: fetchErr } = await adminClient
          .from("seller_streaming_profiles")
          .select("seller_id, ivs_channel_arn")
          .eq("seller_id", seller_id)
          .maybeSingle();

        if (fetchErr) {
          console.log("[APPROVE-SELLER][IVS] fetch failed (non-blocking):", fetchErr.message);
        } else {
          // b) Insert stub row if missing
          if (!existingProfile) {
            console.log("[APPROVE-SELLER][IVS] inserting stub profile");
            const { error: insertErr } = await adminClient
              .from("seller_streaming_profiles")
              .insert({
                seller_id,
                aws_region: "us-east-1",
              });

            if (insertErr) {
              console.log("[APPROVE-SELLER][IVS] stub insert failed (non-blocking):", insertErr.message);
            }
          }

          // c) Re-fetch to confirm current state
          const { data: profileAfter, error: refetchErr } = await adminClient
            .from("seller_streaming_profiles")
            .select("ivs_channel_arn")
            .eq("seller_id", seller_id)
            .maybeSingle();

          if (refetchErr) {
            console.log("[APPROVE-SELLER][IVS] refetch failed (non-blocking):", refetchErr.message);
          } else if (profileAfter?.ivs_channel_arn) {
            console.log("[APPROVE-SELLER][IVS] channel already exists, skipping CreateChannel");
          } else {
            console.log("[APPROVE-SELLER][IVS] creating IVS channel");

            const region = Deno.env.get("AWS_IVS_REGION") || "us-east-1";
            const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
            const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");

            if (!accessKeyId || !secretAccessKey) {
              console.log("[APPROVE-SELLER][IVS] AWS credentials not configured, skipping");
            } else {
              const createRes = await callIvsApi(
                "CreateChannel",
                region,
                accessKeyId,
                secretAccessKey,
                {
                  name: `seller-${seller_id}`,
                  type: "STANDARD",
                  latencyMode: "LOW",
                }
              );

              if (createRes?.error) {
                console.log("[APPROVE-SELLER][IVS] CreateChannel failed (non-blocking):", createRes.error);
              } else {
                const channel = (createRes as { data?: { channel?: { arn?: string; playbackUrl?: string; ingestEndpoint?: string } } })?.data?.channel;
                if (channel?.arn) {
                  console.log("[APPROVE-SELLER][IVS] channel created:", channel.arn);

                  const { error: updateErr } = await adminClient
                    .from("seller_streaming_profiles")
                    .update({
                      ivs_channel_arn: channel.arn,
                      ivs_playback_url: channel.playbackUrl || null,
                      ivs_ingest_endpoint: channel.ingestEndpoint || null,
                    })
                    .eq("seller_id", seller_id);

                  if (updateErr) {
                    console.log("[APPROVE-SELLER][IVS] profile update failed (non-blocking):", updateErr.message);
                  } else {
                    console.log("[APPROVE-SELLER][IVS] profile updated with channel details");
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("[APPROVE-SELLER][IVS] unexpected exception (non-blocking):", String(e));
      }
    }

    console.log("[APPROVE-SELLER] completed successfully", { seller_id, new_status });

    return json(
      200,
      {
        success: true,
        seller_id,
        seller_user_id: resolvedSellerUserId,
        new_status,
        status_reason,
      },
      headers
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[APPROVE-SELLER] unexpected error", { error: msg });
    return json(500, { success: false, error: msg }, corsHeaders(req));
  }
});
