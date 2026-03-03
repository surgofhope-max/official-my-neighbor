# Finalize Expired Giveys

Edge Function that finalizes givey events whose countdown has expired.

## Purpose

Selects `givey_events` rows with `status = 'active'` and `ends_at <= now()`, then calls the `finalize_givey_event` RPC for each. This ensures giveys are finalized server-side even when no seller is viewing the HostConsole or LiveShow page.

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL (auto-set by Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for bypassing RLS (auto-set by Supabase) |

## Intended Schedule

**pg_cron:** Every 5 seconds

Example SQL to schedule:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'finalize-expired-giveys',
  '*/5 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/finalize-expired-giveys',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Replace `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>` with your project reference and service role key.

## Response Format

```json
{
  "processed": 2,
  "attempted": 2,
  "errors": []
}
```

- `processed`: Number of giveys successfully finalized
- `attempted`: Total number of expired giveys found
- `errors`: Array of error messages for any failed RPC calls
