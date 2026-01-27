# Stripe Integration Setup

## Environment Variables

### Frontend (.env.local)
```
VITE_STRIPE_ENABLED=true
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

### Supabase Edge Functions
Set these in Supabase Dashboard > Project Settings > Edge Functions:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Webhook Configuration (CRITICAL FOR DIRECT CHARGES)

This platform uses **Direct Charges (Model A)** where PaymentIntents are created
ON the seller's connected account. This means payment events originate from
connected accounts, NOT the platform account.

### Step-by-Step Webhook Setup

1. Go to https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"**
3. Enter endpoint URL: `https://<your-project>.supabase.co/functions/v1/stripe-webhook`
4. **CRITICAL**: Under "Listen to", select **"Events on Connected accounts"**
   - This is required for Direct Charges model
   - Without this, payment_intent.succeeded events will NOT be delivered
5. Select events to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
6. Click **"Add endpoint"**
7. Copy the **Signing secret** (starts with `whsec_`)
8. Set `STRIPE_WEBHOOK_SECRET` in Supabase Edge Function secrets

### Verify Webhook Configuration

Your webhook endpoint should show:
- Endpoint URL: `https://<project>.supabase.co/functions/v1/stripe-webhook`
- Listen to: **Events on connected accounts** ✓
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`

### Why This Matters

| Charge Model | PaymentIntent Created On | Events Sent To |
|--------------|-------------------------|----------------|
| Platform charges | Platform account | Platform webhooks |
| **Direct charges** | **Connected account** | **Connect webhooks only** |
| Destination charges | Platform account | Platform webhooks |

If your webhook is NOT configured for "Events on Connected accounts":
- Stripe payments will succeed (money collected)
- Platform will NEVER receive the webhook event
- Orders will stay in "pending" forever
- Batches will never activate
- Inventory will never update

## Deployment

```bash
# Deploy Edge Functions
supabase functions deploy create-payment-intent
supabase functions deploy stripe-webhook
```

## Testing

1. Use Stripe test mode keys (sk_test_*, pk_test_*)
2. Test cards: https://stripe.com/docs/testing
3. Use Stripe CLI for local webhook testing with Connect:
   ```bash
   # Forward both platform AND Connect events
   stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook --forward-connect-to localhost:54321/functions/v1/stripe-webhook
   ```

## Troubleshooting

### Orders stuck in "pending" after successful Stripe payment

1. Check Stripe Dashboard > Developers > Webhooks
2. Click on your webhook endpoint
3. Verify "Listen to" shows **"Events on connected accounts"**
4. Check "Webhook attempts" for recent deliveries
5. If no deliveries for `payment_intent.succeeded`, the webhook is misconfigured

### Webhook signature verification failed

1. Ensure `STRIPE_WEBHOOK_SECRET` matches the signing secret shown in Stripe Dashboard
2. If you recreated the webhook, you need a NEW signing secret





