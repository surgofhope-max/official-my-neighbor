-- ============================================================================
-- RLS Checkout Write Enforcement Migration
-- ============================================================================
-- Purpose: Enforce Row Level Security for checkout-related tables
--          (buyer_profiles, batches, orders) to ensure data isolation
--          before enabling Stripe or inventory mutations.
--
-- Created: 2024-12-13
-- Context: Frontend checkout now creates buyer_profiles, batches, and orders
--          via Supabase anon key. This migration locks down write access.
--
-- Schema assumptions (derived from frontend API contracts):
--   - buyer_profiles.user_id = auth.uid() for the profile owner
--   - batches.buyer_id = auth.uid() for the batch buyer
--   - orders.buyer_id = auth.uid() for the order buyer
--   - orders.seller_id / batches.seller_id reference sellers.id
--   - sellers.user_id = auth.uid() for the seller owner
-- ============================================================================

-- ============================================================================
-- A) buyer_profiles RLS
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS buyer_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to replace with stricter versions)
DROP POLICY IF EXISTS "buyer_profiles_select_own" ON buyer_profiles;
DROP POLICY IF EXISTS "buyer_profiles_insert_own" ON buyer_profiles;
DROP POLICY IF EXISTS "buyer_profiles_update_own" ON buyer_profiles;
DROP POLICY IF EXISTS "Users can read own buyer profile" ON buyer_profiles;
DROP POLICY IF EXISTS "Users can create own buyer profile" ON buyer_profiles;
DROP POLICY IF EXISTS "Users can update own buyer profile" ON buyer_profiles;

-- SELECT: Authenticated users can read ONLY their own profile
CREATE POLICY "buyer_profiles_select_own"
ON buyer_profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- INSERT: Authenticated users can insert ONLY if user_id = auth.uid()
CREATE POLICY "buyer_profiles_insert_own"
ON buyer_profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- UPDATE: Authenticated users can update ONLY their own profile
CREATE POLICY "buyer_profiles_update_own"
ON buyer_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE: No delete policy (deny by default)
-- Buyers should not be able to delete their profiles via frontend

-- ============================================================================
-- B) batches RLS
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS batches ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to replace with stricter versions)
DROP POLICY IF EXISTS "batches_select_buyer" ON batches;
DROP POLICY IF EXISTS "batches_select_seller" ON batches;
DROP POLICY IF EXISTS "batches_insert_buyer" ON batches;
DROP POLICY IF EXISTS "batches_update_buyer" ON batches;
DROP POLICY IF EXISTS "Buyers can read own batches" ON batches;
DROP POLICY IF EXISTS "Sellers can read their batches" ON batches;
DROP POLICY IF EXISTS "Buyers can create batches" ON batches;
DROP POLICY IF EXISTS "Buyers can update own batches" ON batches;

-- SELECT: Buyer can read batches where they are the buyer
-- Note: Schema may use buyer_id or buyer_user_id - handle both via COALESCE
CREATE POLICY "batches_select_buyer"
ON batches
FOR SELECT
TO authenticated
USING (
  COALESCE(buyer_user_id, buyer_id) = auth.uid()
);

-- SELECT: Seller can read batches where seller_id matches their seller record
CREATE POLICY "batches_select_seller"
ON batches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM sellers
    WHERE sellers.id = batches.seller_id
      AND sellers.user_id = auth.uid()
  )
);

-- INSERT: Buyer can create batch ONLY if buyer_id = auth.uid()
-- Note: Schema may use buyer_id or buyer_user_id - check both
CREATE POLICY "batches_insert_buyer"
ON batches
FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE(buyer_user_id, buyer_id) = auth.uid()
);

-- UPDATE: Buyer can update ONLY their own batches
-- This allows updating totals after adding orders
CREATE POLICY "batches_update_buyer"
ON batches
FOR UPDATE
TO authenticated
USING (
  COALESCE(buyer_user_id, buyer_id) = auth.uid()
)
WITH CHECK (
  COALESCE(buyer_user_id, buyer_id) = auth.uid()
);

-- DELETE: No delete policy (deny by default)
-- Batches should not be deleted via frontend

-- ============================================================================
-- C) orders RLS
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to replace with stricter versions)
DROP POLICY IF EXISTS "orders_select_buyer" ON orders;
DROP POLICY IF EXISTS "orders_select_seller" ON orders;
DROP POLICY IF EXISTS "orders_insert_buyer" ON orders;
DROP POLICY IF EXISTS "Buyers can read own orders" ON orders;
DROP POLICY IF EXISTS "Sellers can read their orders" ON orders;
DROP POLICY IF EXISTS "Buyers can create orders" ON orders;

-- SELECT: Buyer can read orders where they are the buyer
CREATE POLICY "orders_select_buyer"
ON orders
FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

-- SELECT: Seller can read orders where seller_id matches their seller record
CREATE POLICY "orders_select_seller"
ON orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM sellers
    WHERE sellers.id = orders.seller_id
      AND sellers.user_id = auth.uid()
  )
);

-- INSERT: Buyer can create order ONLY if buyer_id = auth.uid()
CREATE POLICY "orders_insert_buyer"
ON orders
FOR INSERT
TO authenticated
WITH CHECK (buyer_id = auth.uid());

-- UPDATE: No update policy for buyers (deny by default)
-- Order updates should be handled by backend/service role only
-- (e.g., marking as ready, picked up, etc.)

-- DELETE: No delete policy (deny by default)
-- Orders should not be deleted via frontend

-- ============================================================================
-- D) Seller update policies (for order fulfillment)
-- ============================================================================

-- Sellers need to update batches (mark ready, picked up)
DROP POLICY IF EXISTS "batches_update_seller" ON batches;

CREATE POLICY "batches_update_seller"
ON batches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM sellers
    WHERE sellers.id = batches.seller_id
      AND sellers.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM sellers
    WHERE sellers.id = batches.seller_id
      AND sellers.user_id = auth.uid()
  )
);

-- Sellers need to update orders (mark ready, picked up)
DROP POLICY IF EXISTS "orders_update_seller" ON orders;

CREATE POLICY "orders_update_seller"
ON orders
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM sellers
    WHERE sellers.id = orders.seller_id
      AND sellers.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM sellers
    WHERE sellers.id = orders.seller_id
      AND sellers.user_id = auth.uid()
  )
);

-- ============================================================================
-- E) Admin policies (if role-based admin exists)
-- ============================================================================
-- Note: Supabase service role bypasses RLS automatically.
-- If admin role is stored in JWT claims (e.g., user_metadata.role = 'admin'),
-- additional policies could be added here. For now, admin operations should
-- use the service role key.

-- ============================================================================
-- VERIFICATION CHECKLIST
-- ============================================================================
-- Run these tests manually against the database after applying this migration:
--
-- 1. Anonymous user (no auth):
--    [ ] SELECT from buyer_profiles → 0 rows
--    [ ] SELECT from batches → 0 rows
--    [ ] SELECT from orders → 0 rows
--    [ ] INSERT into any table → denied
--
-- 2. Authenticated user (buyer):
--    [ ] Can SELECT own buyer_profile (user_id = auth.uid())
--    [ ] Cannot SELECT other user's buyer_profile
--    [ ] Can INSERT buyer_profile with user_id = auth.uid()
--    [ ] Cannot INSERT buyer_profile with different user_id
--    [ ] Can UPDATE own buyer_profile
--    [ ] Cannot UPDATE other user's buyer_profile
--
-- 3. Authenticated user (buyer) - batches:
--    [ ] Can SELECT batches where buyer_id/buyer_user_id = auth.uid()
--    [ ] Cannot SELECT other user's batches
--    [ ] Can INSERT batch with buyer_id = auth.uid()
--    [ ] Cannot INSERT batch for different user
--    [ ] Can UPDATE own batches (totals)
--    [ ] Cannot UPDATE other user's batches
--
-- 4. Authenticated user (buyer) - orders:
--    [ ] Can SELECT orders where buyer_id = auth.uid()
--    [ ] Cannot SELECT other user's orders
--    [ ] Can INSERT order with buyer_id = auth.uid()
--    [ ] Cannot INSERT order for different user
--    [ ] Cannot UPDATE orders (buyer side)
--    [ ] Cannot DELETE orders
--
-- 5. Authenticated user (seller):
--    [ ] Can SELECT batches where seller_id matches their seller.id
--    [ ] Can SELECT orders where seller_id matches their seller.id
--    [ ] Cannot SELECT other seller's batches/orders
--    [ ] Can UPDATE batches for their seller_id (status changes)
--    [ ] Can UPDATE orders for their seller_id (status changes)
--
-- 6. Service role:
--    [ ] Bypasses all RLS (full access)
--
-- ============================================================================

-- ============================================================================
-- SELLER POLICY SECURITY MODEL
-- ============================================================================
-- Seller SELECT and UPDATE policies use an EXISTS subquery to ensure:
--
--   1. The batch/order's seller_id must match a sellers.id record
--   2. That seller record's user_id must equal auth.uid()
--
-- This two-step check prevents cross-seller access:
--   - Seller A cannot read/update Seller B's batches or orders
--   - Even if a malicious user knows another seller_id, they cannot access it
--     because their auth.uid() won't match that seller's user_id
--
-- The pattern used:
--   EXISTS (
--     SELECT 1 FROM sellers
--     WHERE sellers.id = <table>.seller_id
--       AND sellers.user_id = auth.uid()
--   )
--
-- This is more secure than direct seller_id = auth.uid() because seller_id
-- is a foreign key to sellers.id (not to auth.users.id), requiring the
-- join to verify ownership.
-- ============================================================================

