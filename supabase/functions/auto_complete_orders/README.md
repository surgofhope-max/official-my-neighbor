# Auto-Complete Stale Orders

Edge Function that auto-completes orders stuck in `paid` or `fulfilled` status for more than 5 days.

## Purpose

Provides a safety net for orders where sellers don't complete pickup verification. After 5 days, orders are automatically marked as `completed` so buyers can leave reviews and the order lifecycle is finalized.

## Schedule

**Default:** Daily at 02:00 UTC

### Configuring Cron in Supabase

Run this SQL in the Supabase SQL Editor to schedule the function:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule auto_complete_orders to run daily at 02:00 UTC
SELECT cron.schedule(
  'auto-complete-stale-orders',           -- job name
  '0 2 * * *',                            -- cron expression (daily at 02:00 UTC)
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/auto_complete_orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace `<PROJECT_REF>` with your Supabase project reference.

### Alternative: Supabase Dashboard

1. Go to **Database** → **Extensions** → Enable `pg_cron`
2. Go to **Database** → **Cron Jobs**
3. Add a new job with the cron expression `0 2 * * *`

## Manual Trigger

For testing, you can invoke the function manually:

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/auto_complete_orders \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"
```

## Safety Features

- **Service role:** Bypasses RLS to update orders regardless of ownership
- **Idempotent:** Uses WHERE guards to prevent double-completion
- **Excludes terminal states:** Does not touch `cancelled` or `refunded` orders
- **No client dependency:** Runs server-side with no user authentication required

## Logging

The function logs:
- Count of orders evaluated
- Count of orders completed
- List of completed order IDs (info level)
- Any errors encountered












