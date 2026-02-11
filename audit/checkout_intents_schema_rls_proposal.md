# Checkout Intents — Schema & RLS Design Proposal (Option 1)

**Design only. No code changes. No migrations applied.**

---

## A) Summary (1 page max)

### Why `checkout_intents` exists

- **Option 1 (cleanest):** A separate Supabase table `checkout_intents` absorbs "Buy Now" race traffic without creating real `orders` or reserving inventory until the user clicks "Continue to Payment."
- It decouples **intent to buy** (high concurrency, short-lived) from **order creation** (paid-only batch attach, inventory reservation, Stripe payment).
- Integrity-first: reservation and Stripe gating prevent late/duplicate charges; paid-only batch creation is already verified.

### What it replaces

- **Pre-payment orders:** Today, a pending `orders` row is created at "Continue to Payment" and inventory is reserved immediately. With Option 1, that row is created only after successful payment; until then, only a `checkout_intents` row exists (and optionally a Stripe Checkout Session or PaymentIntent when locked).

### What it does NOT replace

- **orders** — Still the source of truth for paid purchases; created in the webhook when payment succeeds (or in existing demo path).
- **batches** — Still created/attached only for paid orders; no change to paid-only batch semantics.
- **Fulfillment** — Order lifecycle (ready, picked_up, completed, verification) and inventory triggers remain on `orders` and `products`.

---

## B) Schema (table definition)

### Postgres DDL

```sql
-- ============================================================================
-- CHECKOUT_INTENTS
-- ============================================================================
-- Purpose: Absorb Buy Now traffic without creating orders or reserving
--          inventory until "Continue to Payment" and payment success.
-- Option 1: intent → locked → converted (order created in webhook).
-- ============================================================================

CREATE TABLE checkout_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ownership and scope (align with orders/batches)
  buyer_id UUID NOT NULL,                    -- auth.uid() of the buyer
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,  -- seller entity id (sellers.id)
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- Lifecycle
  intent_status TEXT NOT NULL CHECK (intent_status IN (
    'intent',    -- created on Buy Now; not yet in payment flow
    'locked',    -- Continue to Payment; Stripe session/intent created
    'expired',   -- TTL passed or job marked expired
    'cancelled', -- user or system cancelled
    'converted'  -- payment succeeded; order created, converted_order_id set
  )),
  intent_expires_at TIMESTAMPTZ NOT NULL,    -- short TTL from creation
  lock_expires_at TIMESTAMPTZ NULL,          -- set when status = 'locked'; short window to pay

  -- Stripe (one of session or payment_intent used depending on integration)
  stripe_checkout_session_id TEXT NULL,
  stripe_payment_intent_id TEXT NULL,

  -- Diagnostics and audit
  client_context JSONB NULL,                -- optional device / user_agent
  last_error TEXT NULL,
  converted_order_id UUID NULL REFERENCES orders(id) ON DELETE SET NULL  -- set when status = 'converted'
);

-- updated_at trigger (same pattern as other tables)
CREATE OR REPLACE FUNCTION set_checkout_intents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checkout_intents_updated_at
  BEFORE UPDATE ON checkout_intents
  FOR EACH ROW
  EXECUTE FUNCTION set_checkout_intents_updated_at();

COMMENT ON TABLE checkout_intents IS
  'Short-lived intents from Buy Now; no order or inventory reserve until Continue to Payment and payment success.';
COMMENT ON COLUMN checkout_intents.seller_id IS
  'Seller entity id (sellers.id), not sellers.user_id. Matches orders.seller_id / batches.seller_id.';
COMMENT ON COLUMN checkout_intents.intent_expires_at IS
  'TTL for intent state; after this, intent is eligible for expiry (no reservation yet).';
COMMENT ON COLUMN checkout_intents.lock_expires_at IS
  'TTL for locked state; after this, intent should be expired and Stripe session/intent cancelled.';
```

### Seller identity invariant

- **`seller_id`** in `checkout_intents` means **`sellers.id`** (entity PK), not `sellers.user_id` (auth user).
- This matches **orders** and **batches**: `orders.seller_id` / `batches.seller_id` reference `sellers.id`. RLS for seller visibility uses `EXISTS (SELECT 1 FROM sellers WHERE sellers.id = <table>.seller_id AND sellers.user_id = auth.uid())`.
- Using `sellers.id` avoids drift: one seller entity can have one user; product and show ownership are keyed by `sellers.id`. Insert validation (application or trigger) must ensure `product_id` belongs to `seller_id` and `show_id` belongs to that seller.

---

## C) Indexes / Constraints

### Indexes

| Index | Columns | Purpose |
|-------|---------|--------|
| **Required** | `(buyer_id, created_at DESC)` | Buyer’s intents for "My intents" and cleanup by buyer. |
| **Required** | `(product_id, intent_status, lock_expires_at)` | Expiry job: find non-converted intents for a product; lock expiry for Stripe cancel. |
| **Required** | `(show_id, seller_id, intent_status)` | Seller dashboard and per-show intent lists. |
| **Required** | `stripe_checkout_session_id` UNIQUE WHERE NOT NULL (partial) | Lookup by session id; prevent duplicate session attachment. |
| **Required** | `stripe_payment_intent_id` UNIQUE WHERE NOT NULL (partial) | Lookup by PaymentIntent id; webhook idempotency. |
| **Optional** | `(product_id, show_id)` partial UNIQUE WHERE intent_status = 'locked' | At most one locked intent per product+show (strict single-winner per product per show). |

### Constraint discussion

- **Required:** All indexes above except the partial unique are required for concurrency (buyer lists, expiry job, seller views, Stripe lookups).
- **Optional:** The partial unique on `(product_id, show_id)` WHERE `intent_status = 'locked'` enforces "only one locked intent per product per show at a time." It can be added later if the product is the natural contention boundary; if the contention boundary is per buyer+product+show, a different unique (e.g. one locked per buyer+product+show) could be considered. Omitted from initial DDL so the team can decide.

---

## D) RLS Policies (DDL)

RLS follows existing patterns in `20241213211600_rls_checkout_write_enforcement.sql`: buyer by `auth.uid()`, seller by `sellers.id` + `sellers.user_id = auth.uid()`, and admin via `public.users.role`. **Service role bypasses RLS**; no policy needed for Edge Functions using service role.

```sql
ALTER TABLE checkout_intents ENABLE ROW LEVEL SECURITY;

-- 1) SELECT: Buyer sees own intents (authenticated)
CREATE POLICY "checkout_intents_select_buyer"
ON checkout_intents
FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

-- 2) INSERT: Buyer creates own intents (authenticated), must set buyer_id = auth.uid()
--    Show/product/seller validation can be enforced in app or via trigger (see Open questions).
CREATE POLICY "checkout_intents_insert_buyer"
ON checkout_intents
FOR INSERT
TO authenticated
WITH CHECK (buyer_id = auth.uid());

-- 3) UPDATE: Buyer can update own intents (e.g. cancel, refresh); restrict to own rows
CREATE POLICY "checkout_intents_update_buyer"
ON checkout_intents
FOR UPDATE
TO authenticated
USING (buyer_id = auth.uid())
WITH CHECK (buyer_id = auth.uid());

-- 4) DELETE: Buyer can delete own intents (e.g. abandon before lock)
CREATE POLICY "checkout_intents_delete_buyer"
ON checkout_intents
FOR DELETE
TO authenticated
USING (buyer_id = auth.uid());

-- 5) SELECT: Seller sees intents for their shows/products (authenticated)
--    Same pattern as orders_select_seller: sellers.id = checkout_intents.seller_id AND sellers.user_id = auth.uid()
CREATE POLICY "checkout_intents_select_seller"
ON checkout_intents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM sellers
    WHERE sellers.id = checkout_intents.seller_id
      AND sellers.user_id = auth.uid()
  )
);

-- 6) SELECT: Admin override (authenticated) — match users.role pattern from users_update_admin_only
CREATE POLICY "checkout_intents_select_admin"
ON checkout_intents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'super_admin')
  )
);

-- No INSERT/UPDATE/DELETE for sellers or admins on checkout_intents.
-- Lock/expire/convert are done by Edge Functions with service_role (bypass RLS).
```

**Note on public/anon:** Current project uses `TO authenticated` for orders and batches. This design mirrors that: only **authenticated** users can create/read/update/delete their own intents. If guest checkout is required later, a separate policy for `anon` (e.g. INSERT with application-bound identity) can be added; not included here.

---

## E) Lifecycle + TTL contract

| State | When | intent_expires_at | lock_expires_at | Stripe |
|-------|------|-------------------|-----------------|--------|
| **intent** | Created on Buy Now | `now() + X min` (e.g. 5–10 min) | NULL | None |
| **locked** | User clicks "Continue to Payment" | unchanged | `now() + Y min` (e.g. 5 min) | Session or PaymentIntent created |
| **expired** | Job or TTL pass | — | — | Session/PI cancelled if present |
| **cancelled** | User or system cancels | — | — | Session/PI cancelled if present |
| **converted** | Webhook payment success | — | — | Order created; `converted_order_id` set |

- **Intent TTL (`intent_expires_at`):** Short window (e.g. 5–10 min) so "Buy Now" clicks don’t pile up as long-lived rows. No inventory reserved in this state. Expiry job can mark `intent_status = 'expired'` when `intent_expires_at < now()` and status in (`intent`, `locked`).
- **Lock TTL (`lock_expires_at`):** Only set when status becomes `locked`. Short (e.g. 5 min) so the user must complete payment or the intent is expired and the Stripe session/PaymentIntent is cancelled. Prevents **late payment after reservation expiry** (no order exists yet; reservation happens at order creation in webhook).
- **Prevents pending order pileups:** No `orders` row until payment success; only intents accumulate, and they expire or convert.
- **Prevents double payment after expiry:** Lock expiry must cancel Stripe session/PI; webhook must ignore or reject payment for an intent that is already `expired`/`cancelled`.

---

## F) Cleanup strategy

- **Safe to hard-delete (after a retention window):** Rows in `expired`, `cancelled`, or `converted` with `updated_at` (or `created_at`) older than e.g. 7–30 days. Optional: keep `converted` longer for audit (e.g. 90 days) then delete or archive.
- **Do not delete while:** Status is `intent` or `locked` and TTL has not yet passed (or job has not run).
- **Converted intents:** Keeping them with `converted_order_id` set supports audit and "intent → order" tracing. Policy: optional retention (e.g. 90 days) then delete or move to cold storage.

---

## G) Blast-radius notes (design-only)

These system parts will need integration later (no code changes in this proposal):

| Module | Touchpoint |
|--------|------------|
| **CheckoutOverlay** | Split flow: Buy Now → create/update `checkout_intents` (no order); Continue to Payment → lock intent, call create-payment-intent or Checkout Session creator with `checkout_intent_id`. |
| **create-payment-intent** (or Checkout Session creator) | Accept `checkout_intent_id` instead of `order_id`; load intent + product/show/seller; create Stripe Session or PaymentIntent; set `stripe_*` and `lock_expires_at` on intent; store `checkout_intent_id` in Stripe metadata. |
| **stripe-webhook** | On payment success: read `checkout_intent_id` from metadata; load intent; create `orders` row (paid); set intent `converted_order_id` and `intent_status = 'converted'`; attach order to batch; send notification. |
| **Expire job** | New or extended job: select intents with `intent_status IN ('intent','locked')` and (intent_expires_at &lt; now() OR lock_expires_at &lt; now()); mark `expired`; cancel Stripe session/PI where present. |
| **UI** | Banner/message when intent is expired: e.g. "Session expired, item restocking" and option to start over. |

---

## H) Open questions / assumptions

1. **Seller identity:** We assume `seller_id` = `sellers.id` (entity). Confirm that all callers (frontend and Edge Functions) will pass `sellers.id` for the product’s seller (e.g. from `products.seller_id` or show → seller).
2. **Show/product relationship:** Should INSERT into `checkout_intents` be constrained (trigger or app) so that `product_id` belongs to `seller_id` and `show_id` belongs to that seller? Current RLS does not enforce this; application or a trigger could.
3. **Stripe Checkout Session vs PaymentIntent:** Repo currently uses PaymentIntent only. Design allows both `stripe_checkout_session_id` and `stripe_payment_intent_id`. Confirm which will be used so metadata and webhook handling can be specified later.
4. **TTL values:** Exact values for intent TTL (X min) and lock TTL (Y min) to be agreed (e.g. 8 min intent, 5 min lock to align with current pending-order expiry).

---

## READY FOR USER APPROVAL — Checklist

- [ ] **Schema approved** — Table definition, column types, defaults, and FKs.
- [ ] **RLS approved** — Buyer/seller/admin policies and service_role bypass.
- [ ] **TTL values approved** — Intent and lock durations (X min, Y min).
- [ ] **Status enum approved** — `intent` | `locked` | `expired` | `cancelled` | `converted`.
- [ ] **Index strategy approved** — Required indexes and optional partial unique.

---

## What must change later (not now)

List of integration points only; no code or migration work in this document.

1. **Frontend**
   - **CheckoutOverlay:** Buy Now creates/updates `checkout_intents`; Continue to Payment passes `checkout_intent_id` to payment flow; no order creation before payment; handle "session expired" UI.
2. **Edge Functions**
   - **create-payment-intent** (or new Checkout Session creator): Accept `checkout_intent_id`; read from `checkout_intents` (+ product/show/seller); create Stripe object; write back `stripe_*` and `lock_expires_at`; put `checkout_intent_id` in metadata.
   - **stripe-webhook:** On success, resolve `checkout_intent_id` from metadata; create `orders` row (paid); set intent to `converted` and `converted_order_id`; existing batch/notification logic keyed by new order.
   - **Expire job:** New or extended function to expire intents (intent/lock TTL) and cancel Stripe session/PaymentIntent when applicable.
3. **APIs**
   - **orders.ts:** Duplicate/retry logic keyed by checkout_intent or session where appropriate; no pending order lookup for "payment retry" before payment.
   - **payments.ts:** Create payment path takes `checkout_intent_id` (or session) instead of `order_id`.
4. **Database**
   - Migration that creates `checkout_intents` table, indexes, trigger, and RLS policies as in this proposal.
   - Optional: trigger to validate `product_id`/`show_id`/`seller_id` consistency on INSERT.

*End of proposal. Design only — no code changes, no migrations applied.*
