// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL ANALYTICS EVENT TYPES
// 
// This file defines the canonical event types for the analytics_events table.
// All analytics emission code MUST use these constants.
// ═══════════════════════════════════════════════════════════════════════════

export const ANALYTICS_EVENT_TYPES = {
  ORDER_CREATED: "order_created",
  ORDERS_FULFILLED: "orders_fulfilled",
  BATCH_PICKED_UP: "batch_picked_up",

  // STRIPE (future)
  PLATFORM_FEE_COLLECTED: "platform_fee_collected",
} as const;

export type AnalyticsEventType =
  typeof ANALYTICS_EVENT_TYPES[keyof typeof ANALYTICS_EVENT_TYPES];


















