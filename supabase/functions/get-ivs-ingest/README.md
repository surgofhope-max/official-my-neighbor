# get-ivs-ingest Edge Function

Securely provides AWS IVS ingest details to authorized sellers for starting their livestreams.

## Overview

This function enables sellers to retrieve the RTMPS ingest endpoint and stream key needed to go live on AWS IVS, while keeping all AWS credentials server-side.

## Security Features

- **Authentication Required**: Valid Supabase session required
- **Seller Authorization**: Verifies seller owns the show
- **Admin Impersonation**: Supports admin impersonating sellers
- **No Secret Exposure**: AWS credentials never sent to frontend
- **Stream Key Protection**: Stream keys only returned in response body, never logged

## Prerequisites

### AWS IAM Permissions

The AWS credentials must have the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ivs:GetChannel",
        "ivs:ListStreamKeys",
        "ivs:GetStreamKey",
        "ivs:CreateStreamKey"
      ],
      "Resource": [
        "arn:aws:ivs:*:*:channel/*",
        "arn:aws:ivs:*:*:stream-key/*"
      ]
    }
  ]
}
```

### Environment Variables

Set these in Supabase Dashboard → Project Settings → Edge Functions → Secrets:

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key ID | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret access key | Yes |
| `AWS_REGION` | AWS region for IVS (default: us-east-1) | No |
| `SUPABASE_URL` | Supabase project URL | Auto-set |
| `SUPABASE_ANON_KEY` | Supabase anon key | Auto-set |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Auto-set |

### Database Schema

The `shows` table must have these columns:

```sql
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ivs_channel_arn TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ivs_ingest_endpoint TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ivs_stream_key_arn TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS stream_status TEXT;
```

## API Usage

### Request

```http
POST /functions/v1/get-ivs-ingest
Authorization: Bearer <supabase-jwt>
Content-Type: application/json
X-Impersonate-Seller-Id: <seller-id>  (optional, admin only)

{
  "showId": "uuid-of-show"
}
```

### Response (Success)

```json
{
  "ingestEndpoint": "rtmps://abc123.global-contribute.live-video.net:443/app/",
  "streamKey": "sk_us-east-1_xxxxxxxxxxxxx",
  "serverUrl": "rtmps://abc123.global-contribute.live-video.net:443/app/",
  "streamKeyHint": "Use this as your Stream Key in OBS or your streaming software"
}
```

### Response (Error)

```json
{
  "error": "Error message"
}
```

### HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success - ingest details returned |
| 400 | Bad request (missing showId, no IVS channel configured) |
| 401 | Unauthorized (no/invalid auth token) |
| 403 | Forbidden (not seller, seller not approved, not show owner) |
| 404 | Show not found |
| 500 | Server error (AWS API failure, missing config) |

## Frontend Integration

### TypeScript API Helper

Create `src/api/ingest.ts`:

```typescript
import { supabase } from "@/lib/supabase/supabaseClient";

export interface IngestDetails {
  ingestEndpoint: string;
  streamKey: string;
  serverUrl: string;
  streamKeyHint: string;
}

export async function getIngestDetails(
  showId: string,
  impersonatedSellerId?: string
): Promise<{ data: IngestDetails | null; error: string | null }> {
  try {
    const headers: Record<string, string> = {};
    
    if (impersonatedSellerId) {
      headers["x-impersonate-seller-id"] = impersonatedSellerId;
    }

    const { data, error } = await supabase.functions.invoke("get-ivs-ingest", {
      body: { showId },
      headers,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    if (data.error) {
      return { data: null, error: data.error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: "Failed to get ingest details" };
  }
}
```

### React Component Example

```tsx
import { useState } from "react";
import { getIngestDetails, IngestDetails } from "@/api/ingest";
import { Button } from "@/components/ui/button";
import { Copy, Eye, EyeOff } from "lucide-react";

function IngestDetailsPanel({ showId }: { showId: string }) {
  const [ingestDetails, setIngestDetails] = useState<IngestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStreamKey, setShowStreamKey] = useState(false);

  const fetchIngestDetails = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error } = await getIngestDetails(showId);
    
    if (error) {
      setError(error);
    } else {
      setIngestDetails(data);
    }
    
    setIsLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!ingestDetails) {
    return (
      <Button onClick={fetchIngestDetails} disabled={isLoading}>
        {isLoading ? "Loading..." : "Get Stream Details"}
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Server URL</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={ingestDetails.serverUrl}
            className="flex-1 px-3 py-2 bg-gray-100 rounded"
          />
          <Button
            variant="outline"
            onClick={() => copyToClipboard(ingestDetails.serverUrl)}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div>
        <label className="text-sm font-medium">Stream Key</label>
        <div className="flex gap-2">
          <input
            readOnly
            type={showStreamKey ? "text" : "password"}
            value={ingestDetails.streamKey}
            className="flex-1 px-3 py-2 bg-gray-100 rounded"
          />
          <Button
            variant="outline"
            onClick={() => setShowStreamKey(!showStreamKey)}
          >
            {showStreamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button
            variant="outline"
            onClick={() => copyToClipboard(ingestDetails.streamKey)}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {ingestDetails.streamKeyHint}
        </p>
      </div>
    </div>
  );
}
```

## OBS Configuration

1. Open OBS Settings → Stream
2. Service: **Custom**
3. Server: Use the `serverUrl` from the response
4. Stream Key: Use the `streamKey` from the response
5. Click Apply and Start Streaming

## Stream Key Lifecycle

| Scenario | Behavior |
|----------|----------|
| First request for show | Creates new stream key |
| Subsequent requests | Returns existing stream key |
| Stream key deleted in AWS | Creates new stream key |
| Channel deleted | Returns error |

## TODO

- [ ] Implement stream key rotation policy
- [ ] Add rate limiting for stream key creation
- [ ] Add audit logging for stream key access
- [ ] Add stream key expiration/revocation

## Troubleshooting

### "Seller profile not found"
- User is not registered as a seller
- Seller record doesn't match auth user ID

### "Seller not approved"
- Seller status is not "approved"
- Admin can bypass this check

### "Show does not have IVS channel configured"
- Show record is missing `ivs_channel_arn`
- Need to create IVS channel first

### "Failed to retrieve channel details"
- AWS credentials may be invalid
- IVS channel may have been deleted
- AWS region may be incorrect

### "Failed to create stream key"
- AWS IAM permissions may be missing
- Stream key limit may be reached (AWS allows max 1 per channel by default)





