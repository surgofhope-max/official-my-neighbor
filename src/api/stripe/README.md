# Stripe Analytics Integration (Future)

LiveMarket uses Stripe Connect with individual seller accounts.
Analytics events related to revenue MUST be emitted from Stripe webhooks,
not client code.

Canonical event:
- platform_fee_collected

Recommended trigger:
- payment_intent.succeeded

Fallback trigger (non-canonical):
- charge.succeeded

Emission rules:
- Emit EXACTLY once per successful payment
- Use Stripe event idempotency keys
- Never backfill or guess historical revenue
- Store monetary values in analytics_events.payload.metadata

This file intentionally contains no executable code.


















