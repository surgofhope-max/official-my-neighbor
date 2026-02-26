# STRIPE-REFRESH + STRIPE-CONNECT CONTRACT DEEP BLAST AUDIT

Date: 2025-02-07
Scope: LiveMarket production multi-user e-commerce platform
Goal: Blast-radius + dependency map for (1) missing stripe-refresh recovery path and (2) unifying Stripe "connected" contract.

---

## A) Stripe-refresh: Entrypoints and Expected Behavior

### A1: file:line snippets where refreshUrl is configured

supabase/functions/stripe-create-account/index.ts

Line 60 — stripeCreateAccountLink function signature:

```60:64:supabase/functions/stripe-create-account/index.ts
async function stripeCreateAccountLink(opts: { account: string; refreshUrl: string; returnUrl: string }) {
  const params: Record<string, string> = {
    "account": opts.account,
    "refresh_url": opts.refreshUrl,
    "return_url": opts.returnUrl,
```

Line 63 — params object passes refresh_url to Stripe API.

Line 279 — existing account path (sellerRow.stripe_account_id exists):

```277:281:supabase/functions/stripe-create-account/index.ts
      const linkRes = await stripeCreateAccountLink({
        account: sellerRow.stripe_account_id,
        refreshUrl: `${supabaseUrl}/functions/v1/stripe-refresh`,
        returnUrl: `${supabaseUrl}/functions/v1/stripe-return`,
      });
```

Line 366 — new account path (after Express account creation):

```364:368:supabase/functions/stripe-create-account/index.ts
    const linkRes = await stripeCreateAccountLink({
      account: accountId,
      refreshUrl: `${supabaseUrl}/functions/v1/stripe-refresh`,
      returnUrl: `${supabaseUrl}/functions/v1/stripe-return`,
    });
```

Frontend: No references to Stripe Connect refresh or onboarding retry. Grep for "refresh|onboarding.*retry|retry.*onboarding" in src returned only unrelated hits (IVS token refresh, data refresh, ModerationCenter "Check Database", etc.). No frontend code initiates or handles Stripe Account Link refresh flow.

### A2: Expected inbound query params for refresh_url

Unknown in code. No handler exists for stripe-refresh; no code parses query params for refresh_url redirects.

stripe-return (return_url handler) uses:

```26:27:supabase/functions/stripe-return/index.ts
    const url = new URL(req.url);
    const accountId = url.searchParams.get("account");
```

Stripe docs state return_url receives account id; refresh_url is used when the Account Link expires or is invalid. Stripe docs do not document query parameters for refresh_url in this codebase. Conclusion: unknown in code. Stripe Account Link API typically appends account context; exact params not verified in codebase.

### A3: Existing edge functions — stripe-refresh absent

Enumerated supabase/functions/*:

- admin-update-user-metadata
- approve-seller
- audit-resend-send
- audit-show-reminders
- auto_complete_orders
- create-payment-intent
- daily-create-room
- daily-join-room
- daily-webhook
- dryrun-write-show-reminders
- expire-pending-orders
- get-ivs-ingest
- get-ivs-playback-token
- send-show-reminders
- send-test-email
- seller_refund_stripe_only
- stripe-create-account
- stripe-return
- stripe-webhook
- sync-ivs-stream-status

No stripe-refresh directory. Proof: Glob of supabase/functions returns 24 items (including READMEs); no stripe-refresh in the list.

### A4: Current live failure path

1. Seller clicks Connect Stripe in SellerDashboard.
2. stripe-create-account returns onboarding_url (Account Link).
3. Seller is redirected to Stripe onboarding.
4. If the link expires or user needs to re-enter, Stripe redirects to refresh_url: `{SUPABASE_URL}/functions/v1/stripe-refresh`.
5. No stripe-refresh function exists. Supabase serves 404 for that path.
6. User hits 404 with no recovery; cannot automatically get a new Account Link.
7. User must return manually to SellerDashboard and click Connect again to obtain a new link.

---

## B) Stripe-connected contract: Writers and Readers

### B1: Writers table (DB updates to sellers.stripe_connected / stripe_connected_at)

| File | Lines | Condition | Sets stripe_connected | Sets stripe_connected_at | Touches stripe_account_id |
|------|-------|-----------|------------------------|--------------------------|----------------------------|
| stripe-create-account | 348-356 | New Express account created; sellerRow did not have stripe_account_id | false | null | Yes (writes accountId) |
| stripe-return | 93-100 | charges_enabled && payouts_enabled | true | now (ISO) | No |
| stripe-webhook (account.updated, capability.updated) | 836-842 (via upsertSellerStripeConnectionFromAccount) | stripeAccountId exists; MODEL A (relationship-based) | true | now if true, null if false | No |
| stripe-webhook (deauthorized) | 836-842 (via upsertSellerStripeConnectionFromAccount) | Seller revoked | false | null | No |

Exact snippets:

stripe-create-account/index.ts:348-356

```
      .update({
        stripe_account_id: accountId,
        stripe_connected: false,
        stripe_connected_at: null,
      })
      .eq("id", sellerRow.id);
```

stripe-return/index.ts:93-100

```
      const { data, error } = await supabase
        .from("sellers")
        .update({
          stripe_connected: true,
          stripe_connected_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", accountId)
```

stripe-webhook/index.ts:836-842 (upsertSellerStripeConnectionFromAccount)

```
  const { error: updErr } = await supabase
    .from("sellers")
    .update({
      stripe_connected: nextConnected,
      stripe_connected_at: nextConnectedAt,
    })
    .eq("id", existing.id);
```

nextConnected = enabled (true for account.updated/capability.updated, false for deauthorized). nextConnectedAt = nextConnected ? ISO now : null.

### B2: Readers table by category

**Auth/Guards**

- src/lib/auth/onboardingState.ts:49-50 — SellerProfile type: stripe_account_id, stripe_connected
- src/lib/auth/onboardingState.ts:303-311 — isSellerPaymentReady: !!(seller?.stripe_account_id || seller?.stripe_connected)
- src/lib/auth/onboardingState.ts:372 — getOnboardingReadiness stripeConnected: !!(seller?.stripe_account_id || seller?.stripe_connected)
- src/lib/auth/routeGuards.ts:16, 36, 47, 54-55, 299, 445 — uses isSellerPaymentReady for seller payment routes; SellerProfile type includes stripe_account_id, stripe_connected

**Seller UI**

- src/pages/SellerDashboard.jsx:1131, 1133, 1140, 1143, 1153 — stripe_connected for Alert styling, header, description, Connect button visibility (!seller.stripe_connected)

**Checkout**

- src/components/checkout/CheckoutOverlay.jsx:222-223, 227 — stripe_account_id only; loadStripe(stripeAccount: seller.stripe_account_id)

**Refunds**

- supabase/functions/seller_refund_stripe_only/index.ts:94, 99, 108, 114, 125 — stripe_account_id only; select, validation, stripeAccount in refunds.create

**Admin UI**

- src/pages/ManageUsers.jsx:872, 876 — (seller.stripe_account_id || seller.stripe_connected) for badge
- src/pages/AdminDashboard.jsx:1456 — seller.stripe_connected for badge
- src/pages/AdminSellers.jsx:406 — seller.stripe_connected for badge
- src/pages/AdminSellerData.jsx:333 — seller.stripe_connected for badge
- src/components/admin/ImpersonationBanner.jsx:99 — Hardcoded "Stripe blocked"; no DB field read
- src/components/admin/SellerOnboardingSection.jsx:506 — sellerProfile.stripe_connected ? "Yes" : "No"

**Analytics UI**

- src/components/analytics/SellerDetailView.jsx:124, 128, 133, 137, 142, 295, 301 — stripe_account_id (display, link), stripe_connected (Connected/Pending)
- src/components/analytics/SellerAnalyticsTab.jsx:104, 111, 234, 251, 256, 268, 274 — stripe_account_id (search, CSV, link), stripe_connected (Connected/Pending)

**Indirect reads (seller_cards view / card mapping)**

- supabase/migrations/20251225_create_seller_cards_view.sql:109 — COALESCE(s.stripe_connected, false) AS is_accepting_orders
- supabase/migrations/20251227_seller_cards_buyer_avatar.sql:53 — same
- src/pages/SellerStorefront.jsx:90 — stripe_connected: card.is_accepting_orders (from view)
- src/pages/NearMe.jsx:93 — same
- src/pages/Sellers.jsx:62 — same
- src/pages/Marketplace.jsx:76 — same

**Edge Functions**

- supabase/functions/create-payment-intent/index.ts:172, 176, 186, 207, 317, 351 — stripe_account_id only (select, validation, stripeAccount)
- supabase/functions/stripe-webhook/index.ts:811-812, 828-829, 839-840 — reads stripe_connected/stripe_connected_at for idempotency; writes via upsertSellerStripeConnectionFromAccount

**Other (types/schema)**

- src/lib/analytics/analyticsContracts.ts:40 — stripe_account_id in type
- src/api/sellers.ts:20-22, 48-50 — stripe_account_id, stripe_connected, stripe_connected_at in types
- src/api/following.ts:25-26 — stripe_account_id, stripe_connected
- src/entities/Seller.json:38, 42, 47 — schema

**stripe_connected_at readers:** Only written; no UI or business logic reads it. Used in webhook for idempotency (existing.stripe_connected_at) and in types/schema. Not used for display or gating.

### B3: Mismatch between gating fields

- create-payment-intent and seller_refund_stripe_only: require stripe_account_id. Reject if absent.
- CheckoutOverlay: uses stripe_account_id only for loadStripe; if absent, stripeOptions is undefined.
- isSellerPaymentReady: requires (stripe_account_id || stripe_connected). A seller with stripe_connected=true but no stripe_account_id would pass route guards but fail at create-payment-intent. In practice stripe_account_id is set when creating an account (stripe-create-account); stripe-return only sets stripe_connected and does not set stripe_account_id, so both are present for fully onboarded sellers. Theoretical edge case: stripe_connected=true from webhook before stripe_account_id exists — cannot occur today because stripe_account_id is written first by stripe-create-account.

---

## C) "Unify contract" blast radius — behavior-sensitive modules

If stripe_connected becomes capability-based (charges_enabled && payouts_enabled):

| Module | Evidence | Current Logic | Change under capability-based |
|--------|----------|---------------|-------------------------------|
| stripe-return | 86-110 | Already capability-based | No change |
| stripe-webhook account.updated | 863-888 | MODEL A (relationship-based) | Would need to check charges_enabled && payouts_enabled before setting true |
| stripe-webhook capability.updated | 895-921 | Delegates to account.updated | Same as above |
| SellerDashboard connect button | 1131-1153 | !seller.stripe_connected shows button | More sellers may see "not connected" until capabilities enabled |
| ManageUsers badge | 872, 876 | stripe_account_id \|\| stripe_connected | Badge could show "Not Connected" longer if using stripe_connected only |
| AdminDashboard/AdminSellers/AdminSellerData | 1456, 406, 333 | stripe_connected | Same as SellerDashboard |
| Analytics (SellerDetailView, SellerAnalyticsTab) | 124-133, 234-256 | stripe_connected for Connected/Pending | Same |
| isSellerPaymentReady | 303-311 | stripe_account_id \|\| stripe_connected | Could restrict payment routes until capabilities enabled |
| seller_cards view | migrations | is_accepting_orders = stripe_connected | Fewer cards would show is_accepting_orders=true |

If stripe_connected becomes relationship-based (account exists and not deauthorized):

| Module | Evidence | Current Logic | Change under relationship-based |
|--------|----------|---------------|-----------------------------------|
| stripe-return | 86-110 | capability-based | Would need to set true when account exists (ignore capabilities) to align |
| stripe-webhook | already MODEL A | Already relationship-based | No change |
| All readers | as above | Mixed today | stripe-return would align with webhook; fewer "not connected" states during onboarding |

Field usage by module:

- Uses stripe_connected only: SellerDashboard (1131-1153), AdminDashboard (1456), AdminSellers (406), AdminSellerData (333), SellerOnboardingSection (506)
- Uses stripe_account_id only: CheckoutOverlay (222-227), create-payment-intent, seller_refund_stripe_only
- Uses (stripe_account_id \|\| stripe_connected): ManageUsers (872, 876), isSellerPaymentReady (310), getOnboardingReadiness (372), SellerDetailView (124-137), SellerAnalyticsTab (234-256)

Payment gating and checkout: create-payment-intent rejects on !seller?.stripe_account_id (176). CheckoutOverlay does not gate; it passes stripe_account_id to loadStripe. Route guards use isSellerPaymentReady, which includes stripe_connected. So a seller could pass route guards with stripe_connected only, reach checkout, then create-payment-intent would fail if stripe_account_id is missing. Again, current flows set both together, so this is theoretical.

---

## D) Safety invariants (must be preserved)

1. create-payment-intent and refund MUST continue to rely on stripe_account_id and still function for Express sellers.
   - Evidence: create-payment-intent/index.ts:172-176 (select stripe_account_id), 176 (reject if absent), 317 (stripeAccount); seller_refund_stripe_only/index.ts:99, 108, 114, 125.

2. Webhook delivery for connected accounts MUST remain configured and unchanged.
   - Evidence: stripe-webhook/index.ts handles account.updated, capability.updated, account.application.deauthorized; Connect webhook must stay configured in Stripe Dashboard.

3. Existing Express sellers MUST not have stripe_account_id overwritten.
   - Evidence: stripe-create-account/index.ts:275-297 — when sellerRow.stripe_account_id exists, only returns new onboarding_url; no DB update.

4. Deauthorized MUST still set stripe_connected=false.
   - Evidence: stripe-webhook/index.ts:927-944 handleConnectDeauthorized → upsertSellerStripeConnectionFromAccount(supabase, stripeAccountId, false).

5. Admin impersonation MUST still block initiating Stripe connect.
   - Evidence: SellerDashboard.jsx:516-521 — handleConnectStripe checks sessionStorage.getItem("admin_impersonate_seller_id") and returns early with alert; ImpersonationBanner.jsx:99 shows "Stripe blocked" (display only; gate is in handleConnectStripe).
