/**
 * Supabase Edge Function: stripe-return
 *
 * Handles the return redirect from Stripe Connect onboarding.
 * When a seller completes (or exits) the Stripe onboarding flow,
 * Stripe redirects them here.
 *
 * This function:
 * 1. Fetches the Stripe account status
 * 2. If charges_enabled AND payouts_enabled are both true,
 *    marks the seller as stripe_connected in the database
 * 3. Redirects the user back to SellerDashboard
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  // Only accept GET requests (Stripe redirects via GET)
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Parse query params from Stripe redirect
    const url = new URL(req.url);
    const accountId = url.searchParams.get("account");

    // Get environment variables
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Determine frontend URL for redirect
    // In production, this should be your actual frontend domain
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://myneighbor.live";
    const redirectUrl = `${frontendUrl}/sellerdashboard`;

    console.log("[stripe-return] Received return redirect", { accountId });

    if (!accountId) {
      console.error("[stripe-return] Missing account parameter");
      // Still redirect to dashboard, but user will see connection status there
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl },
      });
    }

    if (!stripeSecretKey) {
      console.error("[stripe-return] STRIPE_SECRET_KEY not configured");
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl },
      });
    }

    // Fetch account status from Stripe
    const stripeRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
      },
    });

    if (!stripeRes.ok) {
      const errorData = await stripeRes.json().catch(() => ({}));
      console.error("[stripe-return] Failed to fetch Stripe account:", errorData);
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl },
      });
    }

    const account = await stripeRes.json();
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;

    console.log("[stripe-return] Account status", {
      accountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted: account.details_submitted,
    });

    // If both capabilities are enabled, mark seller as connected
    if (chargesEnabled && payoutsEnabled) {
      console.log("[stripe-return] Account fully enabled, updating seller...");

      // Initialize Supabase admin client
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data, error } = await supabase
        .from("sellers")
        .update({
          stripe_connected: true,
          stripe_connected_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", accountId)
        .select("id, business_name");

      if (error) {
        console.error("[stripe-return] Failed to update seller:", error.message);
      } else if (data && data.length > 0) {
        console.log("[stripe-return] Seller marked as connected:", data[0]);
      } else {
        console.warn("[stripe-return] No seller found with stripe_account_id:", accountId);
      }
    } else {
      console.log("[stripe-return] Account not fully enabled yet, no DB update");
    }

    // Redirect back to seller dashboard
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });

  } catch (error) {
    console.error("[stripe-return] Error:", error);

    // Even on error, redirect to dashboard
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://myneighbor.live";
    
    return new Response(null, {
      status: 302,
      headers: { Location: `${frontendUrl}/sellerdashboard` },
    });
  }
});


