-- ============================================================================
-- Inventory Enforcement Migration
-- ============================================================================
-- Purpose: Prevent overselling by atomically enforcing inventory limits
--          at the database layer.
--
-- Created: 2024-12-13
-- Context: Demo checkout now creates orders. Before enabling Stripe,
--          we must ensure inventory cannot go negative.
--
-- Strategy:
--   1. CHECK constraint prevents quantity from going below 0
--   2. Trigger on orders INSERT atomically decrements product.quantity
--   3. If decrement would violate CHECK, the INSERT is rejected
--   4. Auto-mark products as sold_out when quantity reaches 0
-- ============================================================================

-- ============================================================================
-- A) CHECK Constraint on products.quantity
-- ============================================================================
-- Ensure quantity can never go negative.
-- This is the last line of defense against overselling.

DO $$
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_quantity_non_negative'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_quantity_non_negative
    CHECK (quantity >= 0);
  END IF;
END $$;

-- ============================================================================
-- B) Inventory Decrement Trigger Function
-- ============================================================================
-- This function runs BEFORE each order INSERT.
-- It atomically decrements product quantity and validates availability.
-- If the product is unavailable, the INSERT is rejected.

CREATE OR REPLACE FUNCTION enforce_inventory_on_order_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
  v_current_quantity INTEGER;
  v_order_quantity INTEGER;
  v_new_quantity INTEGER;
  v_product_status TEXT;
BEGIN
  -- Get the product_id from the new order
  v_product_id := NEW.product_id;
  
  -- Default order quantity to 1 if not specified
  v_order_quantity := COALESCE(NEW.quantity, 1);
  
  -- Skip inventory check if no product_id (shouldn't happen, but be safe)
  IF v_product_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Lock the product row and get current values
  -- FOR UPDATE ensures no race conditions
  SELECT quantity, status INTO v_current_quantity, v_product_status
  FROM products
  WHERE id = v_product_id
  FOR UPDATE;
  
  -- Check if product exists
  IF v_current_quantity IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_ERROR: Product not found'
      USING ERRCODE = 'P0001';
  END IF;
  
  -- Check if product is already sold out or unavailable
  IF v_product_status IN ('sold_out', 'deleted', 'hidden') THEN
    RAISE EXCEPTION 'INVENTORY_ERROR: Product is not available (status: %)', v_product_status
      USING ERRCODE = 'P0001';
  END IF;
  
  -- Calculate new quantity
  v_new_quantity := v_current_quantity - v_order_quantity;
  
  -- Check if we have enough inventory
  IF v_new_quantity < 0 THEN
    RAISE EXCEPTION 'INVENTORY_ERROR: Insufficient stock. Requested: %, Available: %', 
      v_order_quantity, v_current_quantity
      USING ERRCODE = 'P0001';
  END IF;
  
  -- Decrement the product quantity atomically
  UPDATE products
  SET 
    quantity = v_new_quantity,
    quantity_sold = COALESCE(quantity_sold, 0) + v_order_quantity,
    -- Auto-mark as sold_out when quantity reaches 0
    status = CASE 
      WHEN v_new_quantity = 0 THEN 'sold_out'
      ELSE status
    END,
    updated_date = NOW()
  WHERE id = v_product_id;
  
  -- Allow the order INSERT to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- C) Attach Trigger to orders Table
-- ============================================================================
-- Run BEFORE INSERT to validate and decrement inventory atomically.

DROP TRIGGER IF EXISTS trigger_enforce_inventory_on_order ON orders;

CREATE TRIGGER trigger_enforce_inventory_on_order
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION enforce_inventory_on_order_insert();

-- ============================================================================
-- D) Inventory Restore on Order Cancellation (Optional)
-- ============================================================================
-- When an order is cancelled or refunded, restore the inventory.
-- This runs when order status changes to 'cancelled' or 'refunded'.

CREATE OR REPLACE FUNCTION restore_inventory_on_order_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_order_quantity INTEGER;
BEGIN
  -- Only restore if status changed TO cancelled or refunded
  IF NEW.status IN ('cancelled', 'refunded') 
     AND OLD.status NOT IN ('cancelled', 'refunded') THEN
    
    v_order_quantity := COALESCE(OLD.quantity, 1);
    
    -- Restore inventory
    UPDATE products
    SET 
      quantity = quantity + v_order_quantity,
      quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - v_order_quantity),
      -- If product was sold_out and now has stock, mark as active
      status = CASE 
        WHEN status = 'sold_out' AND quantity + v_order_quantity > 0 THEN 'active'
        ELSE status
      END,
      updated_date = NOW()
    WHERE id = OLD.product_id
      AND OLD.product_id IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_restore_inventory_on_cancel ON orders;

CREATE TRIGGER trigger_restore_inventory_on_cancel
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION restore_inventory_on_order_cancel();

-- ============================================================================
-- VERIFICATION CHECKLIST
-- ============================================================================
-- Test these scenarios after applying the migration:
--
-- 1. Normal purchase:
--    [ ] Order INSERT succeeds when quantity > 0
--    [ ] Product quantity decrements by order quantity
--    [ ] quantity_sold increments
--
-- 2. Sold out handling:
--    [ ] When quantity reaches 0, status changes to 'sold_out'
--    [ ] Subsequent order INSERT fails with INVENTORY_ERROR
--
-- 3. Race condition prevention:
--    [ ] Two simultaneous orders for last item: one succeeds, one fails
--    [ ] No negative quantities possible
--
-- 4. Order cancellation:
--    [ ] Cancelling order restores quantity
--    [ ] Product status changes from sold_out to active if applicable
--
-- 5. Edge cases:
--    [ ] Order with NULL product_id is allowed (bypass)
--    [ ] Order for hidden/deleted product fails
--    [ ] Quantity CHECK constraint prevents manual negative values
--
-- ============================================================================





