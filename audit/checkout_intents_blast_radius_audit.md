# 360° BLAST-RADIUS AUDIT: CHECKOUT_INTENTS (OPTION 1)

**Audit only. No code changes.**

---

## A) Current Checkout Lifecycle

```
[Buy Now]  →  LiveShow.jsx handleBuyNow(product)
                  →  setExpandedProduct(product); open CheckoutOverlay

[CheckoutOverlay open]
  User clicks "Continue to Payment" / "Complete Order (Demo)"
  →  handleCheckout()  [CheckoutOverlay.jsx:478]
       →  processOrder()  [CheckoutOverlay.jsx:329]
            →  validateProductAvailability()  (product still active/quantity > 0)
            →  createOrderWithResult(orderPayload)  [CheckoutOverlay.jsx:404]
                 →  INSERT into orders (status: pending if live, paid if demo)
                 →  BEFORE INSERT trigger: enforce_inventory_on_order_insert (reserve qty)
                 →  emitAnalyticsEvent("order_created")
            ←  returns { order, completionCode, useLivePayment }

       [if useLivePayment]
         →  createPaymentIntent(result.order.id)  [CheckoutOverlay.jsx:527]
              →  Edge Function create-payment-intent (body: order_id)
              →  Fetch order by order_id, verify status === 'pending'
              →  stripe.paymentIntents.create(metadata: order_id, buyer_id, ...)
              ←  returns client_secret, payment_intent_id (not persisted to orders)
         →  setClientSecret(secret); setPaymentStep("stripe_elements")
         [User completes payment in Stripe Elements]
         →  Stripe → payment_intent.succeeded webhook
              →  stripe-webhook: order_id from metadata → UPDATE orders SET status='paid', payment_intent_id
              →  Paid-only batch: find/create batch, attach order, recompute totals, promote batch
              →  createPaymentNotificationSafely (order_update, payment_confirmed)
       [else demo]
         →  setOrderComplete(true); order already paid at insert

[Expiry]
  expire-pending-orders (cron): SELECT orders WHERE status='pending' AND created_at < now() - 8min
  →  UPDATE orders SET status='cancelled' WHERE id IN (...)
  →  AFTER UPDATE trigger: restore_inventory_on_order_cancel (restore product quantity)
  (No Stripe cancel; PaymentIntent can still be paid.)
```

**Summary:** One path creates a real **order** (and reserves inventory) at "Continue to Payment", then creates a PaymentIntent by **order_id**. Batches are created/attached only after payment in the webhook.

---

## B) Call Sites That Create Orders Before Payment

| # | File:Line | Sequence | Creates `orders` row before Stripe? |
|---|-----------|----------|-------------------------------------|
| 1 | **src/components/checkout/CheckoutOverlay.jsx** | handleCheckout (478) → processOrder (329) → createOrderWithResult (404) | **Yes.** Single path: order is inserted (status `pending` for live) then createPaymentIntent(order.id) is called. |
| 2 | **src/api/orders.ts:351** | createOrderWithResult (export); called only from CheckoutOverlay.jsx:404 | Implements the insert. |
| 3 | **src/api/orders.ts:327** | createOrder (deprecated) → createOrderWithResult | Same; no other callers of createOrder in src. |

**Conclusion:** The only "Buy Now → order created" path is **CheckoutOverlay processOrder → createOrderWithResult**. No other component creates orders before payment. GIVI free orders use Base44 in GIVIHostPanel (separate from this Stripe path).

---

## C) Places That Assume Pending Orders Exist

| File:Line | Assumption | If pending orders are removed at Buy Now |
|-----------|------------|------------------------------------------|
| **supabase/functions/create-payment-intent/index.ts:84, 97, 115–119** | Request body has `order_id`; order is fetched by id; order must exist and `order.status === 'pending'`. | Edge function would receive no `order_id` (or a checkout_intent_id). Must not assume `orders` row exists; would need to create order after payment or key off checkout_intent. |
| **supabase/functions/stripe-webhook/index.ts:302–317** | `orderId = paymentIntent.metadata?.order_id`; fetches order by id; uses order for batch key, notification. | Webhook would need metadata to identify intent (e.g. checkout_intent_id) and either create order on payment success or have order created by another path. |
| **src/components/checkout/CheckoutOverlay.jsx:507, 523–527** | result.order.id used for setPendingOrderId, createPaymentIntent(result.order.id). | Would need an identifier from checkout_intent (or similar) instead of order.id. |
| **src/api/orders.ts:400–414** | Duplicate check: existing pending order for same buyer_id + product_id + show_id returns that order for "payment retry". | No pending order → no retry-by-existing-order; would need idempotency keyed by checkout_intent or session. |
| **supabase/functions/expire-pending-orders/index.ts:16–20, 34–41** | Selects orders with status `pending` and created_at &lt; 8min; updates to `cancelled`. | If no pending orders at Buy Now, nothing to expire here. Would need a separate mechanism to expire/cancel checkout_intents and any Stripe sessions/intents. |
| **src/api/showProducts.ts:58–62** | Fire-and-forget `supabase.rpc("expire_pending_orders_for_show", { p_show_id })`. | RPC not in repo migrations; if it targets pending orders, same as above. |
| **src/components/checkout/CheckoutOverlay.jsx:555–558** | Rollback on failure: deleteOrderById(createdOrderId). | If no order is created before payment, no order to delete; rollback would apply to checkout_intent or similar. |

---

## D) Stripe Metadata Contract and Dependence on order_id

**Object:** PaymentIntent only (no Checkout Session in repo).

| Location | Object | Metadata set | order_id required? |
|----------|--------|--------------|--------------------|
| **supabase/functions/create-payment-intent/index.ts:192–201** | PaymentIntent | `order_id`, `buyer_id`, `seller_user_id`, `seller_entity_id`, `product_id`, `show_id`, `platform` | **Yes.** Request body is `{ order_id }`; order is loaded and metadata includes `order_id: order.id`. |
| **supabase/functions/stripe-webhook/index.ts:302** | — | Reads `paymentIntent.metadata?.order_id` | **Yes.** All handling (mark paid, batch attach, notification) keys off this order_id. |

So today the whole flow assumes **order exists before PaymentIntent creation** and **metadata.order_id** is the single link from Stripe to the DB. Introducing checkout_intents would require either:

- metadata to carry **checkout_intent_id** (and optionally product/show/seller/buyer), and webhook creating the order (or attaching to an order created elsewhere), or  
- keeping a "light" order at Continue to Payment but moving "heavy" reservation semantics to checkout_intents (out of scope of this audit).

---

## E) Inventory Reservation: Claim and Release

**Claim (reserve):**

| File:Line | Mechanism | What it keys off |
|-----------|-----------|-------------------|
| **supabase/migrations/20260131180000_atomic_inventory_reservation.sql:15–46** | Trigger `enforce_inventory_on_order_insert` on **BEFORE INSERT** on `orders`. | `NEW.product_id`, `NEW.quantity`. Atomic UPDATE products SET quantity = quantity - v_order_qty WHERE id = product_id AND status = 'active' AND quantity >= v_order_qty. |
| **supabase/migrations/20260116160000_fix_inventory_trigger_pending_orders.sql:5–44** | Same trigger (earlier version); reservation on any insert. | Same: order insert. |

So **reservation is tied to `orders` INSERT**. No order row ⇒ no reservation. If "Buy Now" only creates a checkout_intent, you need another way to reserve (e.g. reserve on checkout_intent or at "Continue to Payment" when creating the order).

**Release:**

| File:Line | Mechanism | What it keys off |
|-----------|-----------|-------------------|
| **supabase/migrations/20241213212000_inventory_enforcement.sql:129–164** | Trigger `restore_inventory_on_order_cancel` on **AFTER UPDATE** on `orders`. | When `NEW.status IN ('cancelled','refunded')` and OLD.status not. Restores product quantity from `OLD.product_id`, `OLD.quantity`. |
| **supabase/functions/expire-pending-orders/index.ts:11–41** | Cron: selects pending orders with created_at &lt; 8min, updates to `cancelled`. | `orders.status = 'pending'`, `orders.created_at`. No Stripe cancel. |

So **release is tied to order status change to cancelled/refunded** (including when expire-pending-orders sets cancelled). If there is no order until after payment, expiry must act on checkout_intents (and any Stripe objects) and only create/update orders when appropriate.

---

## F) Webhook Dependencies and Required Changes for checkout_intents

**stripe-webhook (handlePaymentSucceeded and related):**

| File:Line | Dependency | If order is created only after payment |
|-----------|------------|-----------------------------------------|
| **stripe-webhook/index.ts:302–303** | orderId from metadata; exit if missing. | Metadata must provide a way to create or identify the order (e.g. checkout_intent_id → create order from intent and then proceed). |
| **315–317** | Fetch order by id (id, status, batch_id, buyer_id, seller_id, seller_entity_id, show_id). | Order may not exist yet; webhook would create it from checkout_intent (and metadata) then continue. |
| **357–366** | Update order status to paid, set payment_intent_id. | Becomes "create order (paid) + set payment_intent_id" or "update existing order". |
| **386–461** | Batch key from existingOrder (buyer_id, seller_entity_id, show_id); attach order to batch; recompute totals; promote batch. | Same logic can run after order is created; order must have buyer_id, seller_entity_id, show_id (and batch_id set as today). |
| **461–462** | createPaymentNotificationSafely(orderForNotification, orderId). | Needs a valid order (with id) after payment; can stay once order exists. |

**create-payment-intent:**

| File:Line | Dependency | If order is created only after payment |
|-----------|------------|-----------------------------------------|
| **create-payment-intent/index.ts:84, 97** | Body has order_id; fetch order by id. | Would need to accept checkout_intent_id (or equivalent) and load intent + product/show/seller/buyer from `checkout_intents` (and related tables). |
| **108, 115–119** | order.buyer_id === user.id; order.status === 'pending'. | Validation would be on checkout_intent (e.g. intent belongs to user, intent not expired). |
| **124–129, 139–176** | Order fields for amount, seller, Connect account. | Same data would come from checkout_intent + product/show/seller. |
| **193–201** | metadata.order_id = order.id. | metadata would carry checkout_intent_id (and optionally order_id only after order is created in webhook). |

So: **both create-payment-intent and stripe-webhook currently assume an existing order and order_id in metadata.** Moving to "order only after payment" implies: create-payment-intent keyed by checkout_intent (and not creating an order), and webhook creating the order from the intent when payment succeeds, then reusing current batch/notification logic.

---

## G) Notifications / Analytics / Reviews That Assume Orders Exist Pre-Payment

| File:Line | Assumption | Pre-payment order? |
|-----------|------------|---------------------|
| **src/api/orders.ts:475–492** | emitAnalyticsEvent("order_created", …) after order insert. | **Yes.** Fires when pending order is created (before payment). If orders move to after payment, "order_created" would fire later or from webhook. |
| **supabase/functions/stripe-webhook/index.ts:462, 470–554** | createPaymentNotificationSafely after order marked paid; notification metadata has order_id, event: "payment_confirmed". | **No.** Assumes order exists at payment time (already the case). |
| **supabase/migrations/20241231010000_order_verifications.sql:51–74, 79–82** | create_order_verification_on_complete: on order UPDATE when status → 'completed'. | **No.** Runs when order becomes completed; order exists by then. |
| **src/api/notifications.ts:113–128, 537** | Notifications filtered/checked by metadata.order_id; idempotency by order_id + event. | Assumes order_id exists when notification is created (post-payment). Safe if order is created at payment. |
| **src/pages/Notifications.jsx:126** | notification.metadata?.order_id for linking. | Same. |

Only **order_created** analytics currently assumes an order exists before payment (at insert time). Everything else is post-payment or status-driven.

---

## H) DB Constraints and RLS Relevant to checkout_intents

**orders:**

- **supabase/migrations/20241213211600_rls_checkout_write_enforcement.sql:131–219**
  - RLS enabled.
  - **orders_select_buyer:** SELECT where buyer_id = auth.uid().
  - **orders_select_seller:** SELECT where sellers.id = orders.seller_id AND sellers.user_id = auth.uid().
  - **orders_insert_buyer:** INSERT with CHECK (buyer_id = auth.uid()).
  - **orders_update_seller:** UPDATE where seller matches as above.

**batches:**

- Same file: **batches_select_buyer**, **batches_select_seller**, **batches_insert_buyer**, **batches_update_buyer**, **batches_update_seller** (COALESCE(buyer_user_id, buyer_id) for buyer, sellers.id = batches.seller_id for seller).

**order_verifications:**

- **supabase/migrations/20241231010000_order_verifications.sql:10–12, 89–112**  
  - order_id REFERENCES orders(id) ON DELETE CASCADE; buyer_id REFERENCES buyer_profiles(id); seller_id REFERENCES sellers(id).  
  - RLS: buyers read own, sellers read/update their orders.

For **checkout_intents**, you'd want analogous RLS: e.g. buyer can insert/select their own (e.g. user_id = auth.uid() or buyer_id = auth.uid() if you store buyer_id), and possibly seller read for their show/product. No FK from Stripe to DB today; PaymentIntent metadata is the only link.

---

## I) Impacted Files (Ranked by Risk)

**Critical (flow and data model):**

1. **src/components/checkout/CheckoutOverlay.jsx** (329, 378–404, 478, 507, 523–527, 555–558) – only "Buy Now → order then Stripe" path; processOrder, handleCheckout, rollback.
2. **supabase/functions/create-payment-intent/index.ts** (84–119, 183–219) – assumes order_id, loads order, sets metadata.order_id.
3. **supabase/functions/stripe-webhook/index.ts** (302–317, 357–366, 383–462) – assumes order exists, keys on order_id; batch attach and notification.
4. **src/api/orders.ts** (351, 398–419, 427–448, 475–492) – createOrderWithResult, pending duplicate check, insert, order_created analytics.

**High (reservation and expiry):**

5. **supabase/migrations/20260131180000_atomic_inventory_reservation.sql** (15–46) – reserve on order INSERT.
6. **supabase/migrations/20241213212000_inventory_enforcement.sql** (129–164) – release on order cancel/refund.
7. **supabase/functions/expire-pending-orders/index.ts** (16–41) – expires pending orders by status + created_at; no Stripe cancel.
8. **src/api/showProducts.ts** (58–62) – calls expire_pending_orders_for_show RPC (definition not in repo).

**Medium (UI and APIs that assume order exists before payment):**

9. **src/api/payments.ts** (26–74) – createPaymentIntent(orderId); caller passes order.id.
10. **src/pages/LiveShow.jsx** (500, 1194, 1317, 1490) – handleBuyNow opens CheckoutOverlay; no direct order dependency, but flow leads to order creation.

**Lower (post-payment or display only):**

11. **src/api/notifications.ts** (order_id in metadata) – fine if order exists when notification is created.
12. **src/pages/BuyerOrders.jsx**, **SellerOrders.jsx** – display orders; no assumption that order existed before payment.
13. **order_verifications** trigger – runs on order update to completed; no change if order is created at payment.

---

## J) Invariants That Must Not Break

1. **Paid-only batches**  
   Batch is created/attached and totals updated only after payment (in webhook). Moving order creation to after payment keeps this; ensure webhook still has buyer_id, seller_id, show_id (from order or checkout_intent) and that batch key and attach logic are unchanged.

2. **Reservation safety**  
   Only one winner per unit; no oversell. Today: atomic reserve on order INSERT. If reservation moves to checkout_intent or to "order at Continue to Payment", ensure:
   - Reserve is still atomic (single source of truth, e.g. one row/table updated under a condition).
   - Expiry releases the same reservation (e.g. cancel intent → release; or cancel order → existing trigger).

3. **Single-winner**  
   Duplicate check today: same buyer + product + show + pending returns one order. With checkout_intents, idempotency (e.g. one order per checkout_intent, or one payment per intent) must be enforced so one payment does not create multiple orders or double reserve.

4. **Stripe ↔ DB link**  
   Today: metadata.order_id. With checkout_intents, either metadata.checkout_intent_id and webhook creating order from intent, or another stable identifier that survives from "Continue to Payment" to webhook.

5. **Inventory release on abandon/expiry**  
   Today: expire-pending-orders sets order to cancelled → trigger restores quantity. With no pending order at Buy Now, you need an equivalent path: expire checkout_intents and release reserved quantity (and cancel Stripe session/intent if applicable).

---

## K) Explicit Dependency Chains (If We Change X, Y Breaks)

- **If we stop creating orders in processOrder:**  
  createPaymentIntent has no order_id; create-payment-intent and stripe-webhook both break until they use checkout_intent_id (or similar) and webhook creates the order.

- **If create-payment-intent only receives checkout_intent_id:**  
  It must not read from `orders` by order_id; it must read from `checkout_intents` (and product/show/seller) and put checkout_intent_id (and needed context) in metadata. Webhook must create order from intent when payment succeeds.

- **If expire-pending-orders is not updated:**  
  It will find no pending orders if they're no longer created at Buy Now; reservation release and Stripe cancel must be handled by a different job (e.g. expire checkout_intents and cancel PaymentIntents).

- **If we add checkout_intents but keep creating orders at "Continue to Payment":**  
  Then "Option 1" as stated (no real pending orders until payment) is not fully in play; only the "absorb race traffic" part might be (e.g. checkout_intents for UI/capacity, but order still created at same step). Full Option 1 implies no order row before payment and the changes above.

---

*End of audit. No code changes. No suggestions. Audit only.*
