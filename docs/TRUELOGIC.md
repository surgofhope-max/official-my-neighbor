# TrueLogic — System Design Truths

> Authoritative reference for runtime behavior. Derived from codebase and production evidence.

---

## A — Order Lifecycle (DB Truth)

- **Status flow:** `paid` → `fulfilled` → `completed`
- **Seller pickup verification = immediate completion.** No intermediate wait.
- **`completed_at`** is set by `completeBatchPickup()` at the same time as status → `completed`.
- **Triggers enforce transitions:** Invalid status changes are rejected at DB level.
- **Evidence rule:** The database write is the source of truth. UI is a projection.

---

## B — Notifications (Event Log)

### Storage Rules
- Notifications are **immutable events** — append-only log.
- **INSERT allowed:** Seller can insert notification for buyer (ownership via seller context).
- **SELECT/UPDATE allowed:** User can only read/update their own notifications (`user_id = auth.uid()`).
- **DELETE forbidden by RLS:** No delete policy exists. By design.
- **Read = acknowledgment,** not deletion. `read = true` + `read_at = now()`.

### Projection Rules (Read-Time)
- **Collapse by:** `(type + order_id)` for `order_update`; `(type + batch_id)` for `review_request`, `pickup_completed`.
- **Terminal dominance:** For `order_update`, if any notification in group has `event = 'completed'` or `status = 'completed'`, only consider those.
- **Read-state dominance:** If ANY notification in a collapse group is read, select newest (suppress unread siblings).
- **Default feed:** Hides read notifications (projection only, no DB filter).

---

## C — Reviews (Identity Mapping)

- **`reviews.seller_id`** references `sellers.id` (seller profile), NOT `auth.users.id`.
- **Resolution required:** Before insert, resolve `seller_user_id` → `sellers.id` via lookup.
- **FK errors** (`reviews_seller_id_fkey` violation) indicate identity mismatch — caller passed wrong ID type.

---

## D — Self-Purchase Guard

- **Block at order creation:** `buyer_id === seller_user_id` → reject with validation error.
- **Exclude at read boundary:** Orders DAL filters out legacy self-purchase orders from all live queries.
- **Valid order predicate:** `buyer_id !== seller_id` AND `status IN ('paid', 'fulfilled', 'completed')`.

---

## E — Operating Doctrine

1. **Evidence before action.** Audit codebase and DB before proposing fixes.
2. **Supabase = runtime truth.** Never trust UI state over DB state.
3. **One change at a time.** Minimal, surgical edits. Verify before next step.
4. **No UI trust over DB.** UI is a projection; DB writes are authoritative.
5. **Stop and audit on failure.** Do not retry blindly. Trace root cause first.

---

*Last updated: 2024-12-31*

