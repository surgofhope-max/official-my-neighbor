import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Pure fetch-based Stripe REST helpers (no SDK, no Node shims)
async function stripeFormPost(path: string, params: Record<string, string>) {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET") || "";
  if (!key) {
    return { ok: false, status: 500, json: { error: "Missing STRIPE_SECRET_KEY env" } };
  }

  const body = new URLSearchParams(params);

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  let data: any = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      json: { error: data?.error?.message || "Stripe API error", stripe: data?.error || data },
    };
  }

  return { ok: true, status: res.status, json: data };
}

async function stripeCreateExpressAccount(opts: { country: string; email?: string; businessName?: string; sellerId?: string; userId?: string }) {
  const params: Record<string, string> = {
    "type": "express",
    "country": opts.country || "US",
  };

  if (opts.email) params["email"] = opts.email;
  if (opts.businessName) params["metadata[business_name]"] = opts.businessName;
  if (opts.sellerId) params["metadata[seller_id]"] = opts.sellerId;
  if (opts.userId) params["metadata[user_id]"] = opts.userId;

  // Request capabilities for typical marketplace payouts
  params["capabilities[card_payments][requested]"] = "true";
  params["capabilities[transfers][requested]"] = "true";

  return stripeFormPost("accounts", params);
}

async function stripeCreateAccountLink(opts: { account: string; refreshUrl: string; returnUrl: string }) {
  const params: Record<string, string> = {
    "account": opts.account,
    "refresh_url": opts.refreshUrl,
    "return_url": opts.returnUrl,
    "type": "account_onboarding",
  };

  return stripeFormPost("account_links", params);
}

// Extract user ID directly from JWT payload (avoids Supabase Auth latency/issues)
function getUserIdFromJwt(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

type ReqBody = {
  // Optional: if not provided, we infer seller by auth user_id
  seller_id?: string;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPORARY AUDIT: Verify Stripe platform identity
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const _auditKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    console.log("[STRIPE PLATFORM AUDIT] ═══════════════════════════════════════");
    console.log("[STRIPE PLATFORM AUDIT] STRIPE_SECRET_KEY exists:", !!_auditKey);
    console.log("[STRIPE PLATFORM AUDIT] Key prefix:", _auditKey ? _auditKey.substring(0, 8) : "NONE");
    
    if (_auditKey) {
      try {
        const _auditRes = await fetch("https://api.stripe.com/v1/account", {
          method: "GET",
          headers: { "Authorization": `Bearer ${_auditKey}` },
        });
        const _auditData = await _auditRes.json();
        
        console.log("[STRIPE PLATFORM AUDIT] HTTP status:", _auditRes.status);
        
        if (_auditData.error) {
          console.log("[STRIPE PLATFORM AUDIT] error.type:", _auditData.error.type);
          console.log("[STRIPE PLATFORM AUDIT] error.message:", _auditData.error.message);
        } else {
          console.log("[STRIPE PLATFORM AUDIT] account.id:", _auditData.id);
          console.log("[STRIPE PLATFORM AUDIT] account.country:", _auditData.country);
          console.log("[STRIPE PLATFORM AUDIT] account.type:", _auditData.type);
          console.log("[STRIPE PLATFORM AUDIT] account.charges_enabled:", _auditData.charges_enabled);
          console.log("[STRIPE PLATFORM AUDIT] account.details_submitted:", _auditData.details_submitted);
          console.log("[STRIPE PLATFORM AUDIT] account.capabilities:", JSON.stringify(_auditData.capabilities));
        }
      } catch (_auditErr) {
        console.log("[STRIPE PLATFORM AUDIT] FETCH EXCEPTION:", _auditErr);
      }
    }
    console.log("[STRIPE PLATFORM AUDIT] ═══════════════════════════════════════");
  }
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    // Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Public client (for auth flows that need user context)
    const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);
    
    // Admin client (bypasses RLS - use for all DB reads/writes)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: require JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const jwtUserId = getUserIdFromJwt(token);
    console.log("STRIPE FN JWT USER ID", jwtUserId);
    
    if (!jwtUserId) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 Compliance gates: verified email + approved seller + safety agreement
    // Use Admin Auth API (service role) to get canonical email + verification status
    const { data: adminUser, error: adminUserErr } = await supabaseAdmin.auth.admin.getUserById(jwtUserId);

    if (adminUserErr || !adminUser?.user) {
      console.error("[stripe-create-account] Failed to fetch auth user via admin API:", adminUserErr);
      return new Response(
        JSON.stringify({ error: "Failed to verify auth user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const canonicalEmail = adminUser.user.email ?? null;
    const emailVerified = !!adminUser.user.email_confirmed_at;
    console.log("STRIPE FN CANONICAL EMAIL", canonicalEmail, "VERIFIED", emailVerified);

    if (!emailVerified) {
      return new Response(
        JSON.stringify({ error: "Email must be verified before creating Stripe account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔒 Seller approval gate (Admin truth)
    const { data: sellerRowForGate, error: sellerGateErr } = await supabaseAdmin
      .from("sellers")
      .select("status, user_id")
      .eq("user_id", jwtUserId)
      .maybeSingle();

    if (sellerGateErr || !sellerRowForGate || sellerRowForGate.status !== "approved") {
      return new Response(
        JSON.stringify({ error: "Seller must be approved before Stripe setup" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔒 Seller safety agreement gate (Compliance truth lives on users table)
    const { data: userCompliance, error: userComplianceErr } = await supabaseAdmin
      .from("users")
      .select("seller_safety_agreed")
      .eq("id", jwtUserId)
      .maybeSingle();

    if (userComplianceErr || !userCompliance || userCompliance.seller_safety_agreed !== true) {
      return new Response(
        JSON.stringify({ error: "Seller must accept the safety agreement before Stripe setup" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    let body: ReqBody = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Resolve seller row
    // If seller_id is provided, only allow if seller.user_id == auth user OR user is admin/super_admin
    let sellerRow: any = null;

    if (body.seller_id) {
      const { data: seller, error } = await supabaseAdmin
        .from("sellers")
        .select("id, user_id, stripe_account_id, business_name")
        .eq("id", body.seller_id)
        .maybeSingle();

      if (error || !seller) {
        return new Response(JSON.stringify({ error: "Seller not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (seller.user_id !== jwtUserId) {
        // allow admin/super_admin
        const { data: u } = await supabaseAdmin
          .from("users")
          .select("role")
          .eq("id", jwtUserId)
          .maybeSingle();

        const role = u?.role ?? null;
        const isAdmin = role === "admin" || role === "super_admin";
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      sellerRow = seller;
    } else {
      const { data: seller, error } = await supabaseAdmin
        .from("sellers")
        .select("id, user_id, stripe_account_id, business_name")
        .eq("user_id", jwtUserId)
        .maybeSingle();

      if (error || !seller) {
        return new Response(JSON.stringify({ error: "Seller profile not found for user" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      sellerRow = seller;
    }

    // If already has a Stripe account id, create an onboarding link for the existing account
    if (sellerRow.stripe_account_id) {
      // Create account link for existing account (allows seller to complete/update onboarding)
      const linkRes = await stripeCreateAccountLink({
        account: sellerRow.stripe_account_id,
        refreshUrl: `${supabaseUrl}/functions/v1/stripe-refresh`,
        returnUrl: `${supabaseUrl}/functions/v1/stripe-return`,
      });

      if (!linkRes.ok) {
        return new Response(JSON.stringify(linkRes.json), {
          status: linkRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          stripe_account_id: sellerRow.stripe_account_id,
          onboarding_url: linkRes.json.url,
          already_exists: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Stripe Express connected account via pure fetch
    // CRITICAL: Use canonical auth email (not editable profile/contact emails)
    
    // [STRIPE CONNECT AUDIT] Log request parameters (no secrets)
    console.log("[STRIPE CONNECT AUDIT] ═══════════════════════════════════════");
    console.log("[STRIPE CONNECT AUDIT] Creating Express account with:");
    console.log("[STRIPE CONNECT AUDIT]   country: US");
    console.log("[STRIPE CONNECT AUDIT]   email:", canonicalEmail || "(undefined)");
    console.log("[STRIPE CONNECT AUDIT]   businessName:", sellerRow.business_name || "(undefined)");
    console.log("[STRIPE CONNECT AUDIT]   sellerId:", sellerRow.id);
    console.log("[STRIPE CONNECT AUDIT]   userId:", jwtUserId);
    
    const acctRes = await stripeCreateExpressAccount({
      country: "US",
      email: canonicalEmail || undefined,
      businessName: sellerRow.business_name || undefined,
      sellerId: sellerRow.id,
      userId: jwtUserId,
    });

    // [STRIPE CONNECT AUDIT] Log full response
    console.log("[STRIPE CONNECT AUDIT] Response status:", acctRes.status);
    console.log("[STRIPE CONNECT AUDIT] Response ok:", acctRes.ok);

    if (!acctRes.ok) {
      // [STRIPE CONNECT AUDIT] Log full error payload
      const stripeError = acctRes.json?.stripe || acctRes.json?.error || acctRes.json;
      console.log("[STRIPE CONNECT AUDIT] ─── ERROR DETAILS ───");
      console.log("[STRIPE CONNECT AUDIT] HTTP status:", acctRes.status);
      console.log("[STRIPE CONNECT AUDIT] error.type:", stripeError?.type);
      console.log("[STRIPE CONNECT AUDIT] error.code:", stripeError?.code);
      console.log("[STRIPE CONNECT AUDIT] error.message:", stripeError?.message || acctRes.json?.error);
      console.log("[STRIPE CONNECT AUDIT] error.param:", stripeError?.param);
      console.log("[STRIPE CONNECT AUDIT] error.doc_url:", stripeError?.doc_url);
      console.log("[STRIPE CONNECT AUDIT] FULL ERROR JSON:", JSON.stringify(acctRes.json, null, 2));
      console.log("[STRIPE CONNECT AUDIT] ═══════════════════════════════════════");
      
      return new Response(JSON.stringify(acctRes.json), {
        status: acctRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    console.log("[STRIPE CONNECT AUDIT] SUCCESS - account.id:", acctRes.json?.id);
    console.log("[STRIPE CONNECT AUDIT] ═══════════════════════════════════════");

    const accountId = acctRes.json.id as string;

    // Persist to sellers table (service role bypasses RLS)
    const { error: updErr } = await supabaseAdmin
      .from("sellers")
      .update({
        stripe_account_id: accountId,
        stripe_connected: false,
        stripe_connected_at: null,
      })
      .eq("id", sellerRow.id);

    if (updErr) {
      // If we can't store it, this is dangerous. Surface error.
      throw new Error(`Failed to store stripe_account_id on seller: ${updErr.message}`);
    }

    // Create account link for onboarding the new account
    const linkRes = await stripeCreateAccountLink({
      account: accountId,
      refreshUrl: `${supabaseUrl}/functions/v1/stripe-refresh`,
      returnUrl: `${supabaseUrl}/functions/v1/stripe-return`,
    });

    if (!linkRes.ok) {
      // Account was created but link failed - still return account ID so it's not lost
      console.error("[stripe-create-account] Account created but link failed:", linkRes.json);
      return new Response(
        JSON.stringify({
          stripe_account_id: accountId,
          onboarding_url: null,
          already_exists: false,
          warning: "Account created but onboarding link failed. Try again.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        stripe_account_id: accountId,
        onboarding_url: linkRes.json.url,
        already_exists: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[stripe-create-account] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
