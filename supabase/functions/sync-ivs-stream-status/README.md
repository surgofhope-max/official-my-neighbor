# sync-ivs-stream-status Edge Function

Synchronizes AWS IVS stream runtime state with application Show records. This is the authoritative source for determining whether streams are live or offline.

## Overview

This function queries AWS IVS to determine the real-time state of each channel and updates the corresponding Show record in the database. It ensures the application always reflects the actual streaming state.

## Features

- **Single Show Sync**: Sync a specific show by ID
- **Batch Sync**: Sync all shows with IVS configured
- **State Transitions**: Automatically handles live → offline and offline → live
- **Viewer Count**: Updates viewer count from IVS
- **Timestamp Tracking**: Records went_live_at, ended_at timestamps
- **Idempotent**: Only updates database when state changes

## Security

- Requires admin authentication or service role key
- AWS credentials never exposed to frontend
- No stream keys accessed or returned

## Prerequisites

### AWS IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ivs:GetStream"
      ],
      "Resource": [
        "arn:aws:ivs:*:*:channel/*"
      ]
    }
  ]
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key ID | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret access key | Yes |
| `AWS_REGION` | AWS region (default: us-east-1) | No |
| `SUPABASE_URL` | Supabase project URL | Auto-set |
| `SUPABASE_ANON_KEY` | Supabase anon key | Auto-set |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Auto-set |

### Database Schema

The `shows` table should have these columns:

```sql
-- IVS configuration
ivs_channel_arn TEXT,

-- Stream status (updated by this function)
stream_status TEXT,  -- 'offline', 'live', 'ready', etc.
is_streaming BOOLEAN DEFAULT false,

-- Timestamps (optional, updated on state transitions)
went_live_at TIMESTAMP WITH TIME ZONE,
ended_at TIMESTAMP WITH TIME ZONE,
actual_start TIMESTAMP WITH TIME ZONE,
actual_end TIMESTAMP WITH TIME ZONE,

-- Viewer metrics
viewer_count INTEGER DEFAULT 0
```

## API Usage

### Sync Single Show

```http
POST /functions/v1/sync-ivs-stream-status
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "showId": "uuid-of-show"
}
```

### Sync All Shows

```http
POST /functions/v1/sync-ivs-stream-status
Authorization: Bearer <admin-jwt>
```

### Response

```json
{
  "success": true,
  "summary": {
    "total": 5,
    "changed": 2,
    "errors": 0,
    "live": 1,
    "offline": 4
  },
  "results": [
    {
      "showId": "uuid-1",
      "previousStatus": "offline",
      "newStatus": "live",
      "changed": true,
      "viewerCount": 42
    },
    {
      "showId": "uuid-2",
      "previousStatus": "live",
      "newStatus": "live",
      "changed": false,
      "viewerCount": 15
    }
  ]
}
```

### Single Show Response

When syncing a single show, `results` is a single object instead of an array.

## State Mapping

| AWS IVS State | Application State |
|---------------|-------------------|
| LIVE | `stream_status = "live"`, `is_streaming = true` |
| No stream | `stream_status = "offline"`, `is_streaming = false` |

## State Transitions

### Offline → Live
When a stream goes live:
- `stream_status` = "live"
- `is_streaming` = true
- `went_live_at` = current timestamp
- `actual_start` = current timestamp
- `status` = "live" (if was "scheduled")

### Live → Offline
When a stream ends:
- `stream_status` = "offline"
- `is_streaming` = false
- `ended_at` = current timestamp
- `actual_end` = current timestamp
- `status` = "ended" (if was "live")

## Frontend Integration

### TypeScript API Helper

```typescript
import { supabase } from "@/lib/supabase/supabaseClient";

export interface SyncResult {
  showId: string;
  previousStatus: string | null;
  newStatus: string;
  changed: boolean;
  viewerCount?: number;
  error?: string;
}

export interface SyncResponse {
  success: boolean;
  summary: {
    total: number;
    changed: number;
    errors: number;
    live: number;
    offline: number;
  };
  results: SyncResult | SyncResult[];
}

export async function syncStreamStatus(
  showId?: string
): Promise<{ data: SyncResponse | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "sync-ivs-stream-status",
      {
        body: showId ? { showId } : {},
      }
    );

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: "Failed to sync stream status" };
  }
}
```

### Usage Examples

```typescript
// Sync a single show (e.g., after "Go Live" button)
const { data } = await syncStreamStatus("show-uuid");
if (data?.results?.newStatus === "live") {
  console.log("Stream is now live!");
}

// Sync all shows (e.g., on admin dashboard)
const { data } = await syncStreamStatus();
console.log(`${data?.summary.live} shows currently live`);
```

## Scheduling

This function is designed to be called:

1. **On Demand**: After seller presses "Go Live"
2. **Polling**: Periodically while LiveShow page is open
3. **Cron**: On a schedule (e.g., every 30 seconds)

### Supabase Cron Example

To set up automatic sync every 30 seconds:

```sql
-- Enable pg_cron extension first
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the sync job
SELECT cron.schedule(
  'sync-ivs-status',
  '*/30 * * * * *', -- Every 30 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sync-ivs-stream-status',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "x-internal-call": "true"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### Edge Function Polling (Frontend)

```typescript
// Poll every 10 seconds while on LiveShow page
useEffect(() => {
  if (!showId) return;

  const interval = setInterval(async () => {
    await syncStreamStatus(showId);
  }, 10000);

  return () => clearInterval(interval);
}, [showId]);
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "Unauthorized" | Missing or invalid auth | Use admin token or service key |
| "Show not found" | Invalid showId | Check showId exists |
| "AWS credentials not configured" | Missing env vars | Set AWS credentials |
| "No IVS channel configured" | Show missing ivs_channel_arn | Configure IVS channel first |

## Performance Considerations

- Batch sync is limited to 100 shows per call
- Only syncs shows with status "scheduled" or "live"
- 100ms delay between API calls to avoid rate limiting
- No-op if status unchanged (minimal database writes)

## Troubleshooting

### Stream shows offline but is actually live
1. Check `ivs_channel_arn` is correct
2. Verify AWS credentials have `ivs:GetStream` permission
3. Check AWS region matches channel region

### Sync not updating viewer count
- Viewer count only updates when stream is active
- IVS may have slight delay in reporting viewer count

### Rate limiting
- AWS IVS has API rate limits
- Reduce sync frequency if hitting limits
- Consider syncing only active shows





