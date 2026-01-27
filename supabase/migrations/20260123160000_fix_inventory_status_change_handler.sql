-- ============================================================================
-- FIX 1: Remove duplicate PAID handling from handle_inventory_on_order_status_change
-- ============================================================================
-- Purpose: Keep cancel/refund restoration logic intact
--          Remove PAID handling (now handled by decrement_inventory_on_order_paid)
--
-- Created: 2026-01-23
-- Context: Audit identified duplicate/conflicting inventory mutation paths.
--          This fix ensures PAID transitions are handled in ONE place only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_inventory_on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_order_qty int := greatest(coalesce(new.quantity, 1), 1);
  v_qty int;
  v_new_qty int;
begin
  -- Only react when status actually changes
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Only enforce if order is tied to a product
  if new.product_id is null then
    return new;
  end if;

  ------------------------------------------------------------------
  -- NOTE:
  -- PAID transition logic has been intentionally REMOVED.
  -- Paid inventory mutation is handled exclusively by:
  --   decrement_inventory_on_order_paid()
  ------------------------------------------------------------------

  -- B) Transition INTO cancelled/refunded: restore inventory
  if new.status in ('cancelled', 'refunded') and old.status is distinct from new.status then
    -- Lock product row
    select p.quantity into v_qty
      from public.products p
     where p.id = new.product_id
     for update;

    if v_qty is null then
      raise exception 'Inventory restore handler: product % not found', new.product_id;
    end if;

    v_new_qty := v_qty + v_order_qty;

    update public.products
       set quantity = v_new_qty,
           quantity_sold = case
             when old.status = 'paid'
               then greatest(coalesce(quantity_sold, 0) - v_order_qty, 0)
             else coalesce(quantity_sold, 0)
           end,
           status = case
             when status = 'sold_out' and v_new_qty > 0 then 'active'
             else status
           end
     where id = new.product_id
       and status not in ('deleted');

    return new;
  end if;

  return new;
end;
$function$;
