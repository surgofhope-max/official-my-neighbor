-- EMERGENCY: Restore checkout by removing broken trigger that references shows.sales_count
-- The trigger was attempting to increment a column that may not exist or has incorrect permissions

DROP TRIGGER IF EXISTS trigger_increment_show_sales ON public.orders;
DROP FUNCTION IF EXISTS increment_show_sales_on_order_insert();














