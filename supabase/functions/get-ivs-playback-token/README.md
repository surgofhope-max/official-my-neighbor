# AWS IVS Playback Token Generator

This Supabase Edge Function generates signed playback authorization tokens for AWS Interactive Video Service (IVS) private channels.

## Overview

When AWS IVS channels are configured with private playback authorization, viewers need a valid token to access the stream. This Edge Function:

1. Verifies the user is authenticated via Supabase
2. Reads the private key from Supabase Vault
3. Generates a signed JWT token valid for 5 minutes
4. Returns the token to the frontend for stream playback

## Setup

### 1. Generate IVS Playback Key Pair

In AWS IVS Console:
1. Go to **Playback key pairs** → **Create key pair**
2. Download the private key (`.pem` file)
3. Note the ARN of the public key for channel configuration

### 2. Store Private Key in Supabase Vault

```sql
-- In Supabase SQL Editor
SELECT vault.create_secret(
  '-----BEGIN EC PRIVATE KEY-----
  ... your private key content ...
  -----END EC PRIVATE KEY-----',
  'IVS_PLAYBACK_PRIVATE_KEY',
  'AWS IVS playback authorization private key'
);
```

Or via CLI:
```bash
supabase secrets set IVS_PLAYBACK_PRIVATE_KEY="$(cat path/to/private-key.pem)"
```

### 3. Configure IVS Channel

In AWS IVS Console:
1. Edit your channel
2. Enable **Playback authorization**
3. Select the public key created in step 1

## API Usage

### Request

```http
POST /functions/v1/get-ivs-playback-token
Authorization: Bearer <supabase-user-jwt>
Content-Type: application/json

{
  "channelArn": "arn:aws:ivs:us-east-1:123456789:channel/abcdef",
  "playbackUrl": "https://xxx.us-east-1.playback.live-video.net/api/video/v1/xxx.m3u8"
}
```

### Response (Success)

```json
{
  "token": "eyJhbGciOiJFUzM4NCIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 300
}
```

### Response (Error)

```json
{
  "error": "Unauthorized"
}
```

## Frontend Integration

```typescript
import { supabase } from "@/lib/supabase/supabaseClient";

async function getPlaybackToken(channelArn: string, playbackUrl: string) {
  const { data, error } = await supabase.functions.invoke("get-ivs-playback-token", {
    body: { channelArn, playbackUrl },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.token;
}

// Usage with Amazon IVS Player
async function playStream(channelArn: string, playbackUrl: string) {
  const token = await getPlaybackToken(channelArn, playbackUrl);
  
  // Append token to playback URL
  const authorizedUrl = `${playbackUrl}?token=${token}`;
  
  // Initialize IVS player with authorized URL
  const player = IVSPlayer.create();
  player.load(authorizedUrl);
  player.play();
}
```

## Security Considerations

1. **Private Key Protection**: The private key is stored in Supabase Vault and is never exposed to the frontend or logs.

2. **Short-Lived Tokens**: Tokens expire after 5 minutes. The frontend should request a new token before playback or when token expires.

3. **Authentication Required**: Only authenticated Supabase users can request tokens.

4. **TODO: Show-Based Authorization**: Add checks to verify the user has access to the specific show/channel.

## Token Claims

The generated JWT includes:

| Claim | Description |
|-------|-------------|
| `aws:channel-arn` | The IVS channel ARN |
| `aws:access-control-allow-origin` | CORS origin (set to `*`) |
| `exp` | Expiration timestamp (5 minutes from now) |
| `iat` | Issued-at timestamp |

## Troubleshooting

### "Playback authorization not configured"

The `IVS_PLAYBACK_PRIVATE_KEY` environment variable is not set. Add it via Supabase Vault.

### "Invalid channel ARN format"

The `channelArn` must start with `arn:aws:ivs:`. Verify the ARN is correct.

### Token Validation Fails on IVS

1. Verify the private key matches the public key configured on the channel
2. Check that the channel ARN in the token matches the stream's channel
3. Ensure the token hasn't expired

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Auto-set |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Auto-set |
| `IVS_PLAYBACK_PRIVATE_KEY` | PEM-formatted EC private key | Yes |





