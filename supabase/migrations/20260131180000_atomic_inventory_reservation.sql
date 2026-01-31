-- ============================================================================
-- ATOMIC INVENTORY RESERVATION
-- ============================================================================
-- Purpose: Prevent overselling by making inventory reservation atomic.
--          The old trigger decremented quantity unconditionally, allowing
--          concurrent buyers to both reserve the same last unit.
--
-- Fix: UPDATE ... WHERE quantity >= order_qty atomically checks AND decrements,
--      ensuring only ONE buyer can claim the last unit.
--
-- Created: 2026-01-31
-- Context: Oversell audit identified race condition in enforce_inventory_on_order_insert.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_inventory_on_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_qty integer := COALESCE(NEW.quantity, 1);
  v_new_quantity integer;
  v_status text;
  v_qty integer;
BEGIN
  -- If no product, do nothing
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ATOMIC RESERVE: Only decrement if product is active AND has enough quantity
  -- This single UPDATE is the atomic boundary - concurrent transactions will
  -- serialize on the row lock, and the WHERE clause ensures only ONE wins.
  -- ═══════════════════════════════════════════════════════════════════════════
  UPDATE public.products
     SET quantity = quantity - v_order_qty,
         status = CASE
                   WHEN (quantity - v_order_qty) = 0 THEN 'sold_out'
                   ELSE status
                 END
   WHERE id = NEW.product_id
     AND status = 'active'
     AND quantity >= v_order_qty
   RETURNING quantity INTO v_new_quantity;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ERROR HANDLING: If no rows updated, determine precise reason
  -- This allows frontend to show appropriate error messages.
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_new_quantity IS NULL THEN
    SELECT status, quantity
      INTO v_status, v_qty
      FROM public.products
     WHERE id = NEW.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_ERROR: Product not found for order insert: %', NEW.product_id;
    END IF;

    IF v_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'INVENTORY_ERROR: Product not available (status: %)', v_status;
    END IF;

    -- Product exists, is active, but quantity < v_order_qty
    RAISE EXCEPTION 'INVENTORY_ERROR: Insufficient stock for product: %', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- SAFETY GUARDRAIL: Prevent negative quantity
-- ============================================================================
-- NOT VALID means:
--   - New/updated rows ARE validated (enforced on writes)
--   - Existing rows are NOT scanned (no table lock, instant ALTER)
-- This prevents any future code path from creating negative inventory.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_quantity_nonnegative'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_quantity_nonnegative
      CHECK (quantity >= 0)
      NOT VALID;
  END IF;
END $$;
