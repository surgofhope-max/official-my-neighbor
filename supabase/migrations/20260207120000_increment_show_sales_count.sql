-- Increment public.shows.sales_count atomically on paid purchase.
-- Used by Stripe webhook when order transitions to "paid".
-- Enables LiveShow viewer banner ("Someone just made a purchase") without exposing order data.

CREATE OR REPLACE FUNCTION public.increment_show_sales_count(p_show_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shows
  SET sales_count = COALESCE(sales_count, 0) + 1
  WHERE id = p_show_id;
$$;
