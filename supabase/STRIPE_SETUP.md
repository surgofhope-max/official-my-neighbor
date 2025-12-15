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

## Webhook Configuration

1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://<your-project>.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

## Deployment

```bash
# Deploy Edge Functions
supabase functions deploy create-payment-intent
supabase functions deploy stripe-webhook
```

## Testing

1. Use Stripe test mode keys (sk_test_*, pk_test_*)
2. Test cards: https://stripe.com/docs/testing
3. Use Stripe CLI for local webhook testing:
   ```bash
   stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
   ```





