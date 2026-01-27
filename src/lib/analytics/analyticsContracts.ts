// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS EVENT CONTRACTS
// 
// This file defines TypeScript interfaces for analytics event payloads.
// These are CONTRACT definitions only — they document the expected shape
// of events that will be emitted in the future.
// 
// DO NOT import these into runtime code until the corresponding
// emission logic is implemented.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PlatformFeeCollectedEvent
 * 
 * Emitted when a Stripe payment succeeds and platform fee is collected.
 * This event MUST be emitted from Stripe webhooks, not client code.
 * 
 * Canonical trigger: payment_intent.succeeded webhook
 * 
 * ID Reference:
 *   - seller_id: public.sellers.id (entity ID)
 *   - seller_user_id: auth.users.id (user ID)
 *   - buyer_id: auth.users.id
 * 
 * Monetary values are stored in the smallest currency unit (cents for USD).
 */
export interface PlatformFeeCollectedEvent {
  event_type: "platform_fee_collected";

  // Core identifiers
  order_id: string;
  seller_id: string | null;        // public.sellers.id
  seller_user_id: string | null;   // auth.users.id
  buyer_id: string | null;
  show_id: string | null;

  // Stripe identifiers (future)
  stripe_payment_intent_id: string;
  stripe_charge_id?: string;
  stripe_account_id?: string;

  // Monetary values (stored in metadata)
  gross_amount: number;            // total paid by buyer
  platform_fee_amount: number;     // fee retained by LiveMarket
  net_to_seller: number;           // amount sent to seller

  // Meta
  currency: string;                // e.g. "usd"
  event_at: string;                // ISO timestamp
}



















