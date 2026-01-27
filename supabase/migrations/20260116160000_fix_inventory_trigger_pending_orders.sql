-- Patch inventory enforcement so pending orders do not count as sold.
-- We still decrement inventory on insert (reservation behavior),
-- but we ONLY increment quantity_sold and mark sold_out when the order is paid.

create or replace function public.enforce_inventory_on_order_insert()
returns trigger
language plpgsql
as $$
declare
  v_new_quantity integer;
begin
  -- decrement inventory (reservation) for any created order
  update public.products
  set quantity = quantity - coalesce(new.quantity, 1)
  where id = new.product_id
  returning quantity into v_new_quantity;

  if v_new_quantity is null then
    raise exception 'Product not found for order insert: %', new.product_id;
  end if;

  -- Only treat as SOLD when the order is actually PAID
  if new.status = 'paid' then
    update public.products
    set
      quantity_sold = coalesce(quantity_sold, 0) + coalesce(new.quantity, 1),
      status = case
        when v_new_quantity = 0 then 'sold_out'
        else status
      end
    where id = new.product_id;
  end if;

  return new;
end;
$$;

-- Recreate the trigger to ensure it points at the updated function.
drop trigger if exists enforce_inventory_on_order_insert on public.orders;

create trigger enforce_inventory_on_order_insert
before insert on public.orders
for each row
execute function public.enforce_inventory_on_order_insert();

