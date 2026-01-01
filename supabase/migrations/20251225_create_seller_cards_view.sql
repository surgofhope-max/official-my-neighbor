-- ═══════════════════════════════════════════════════════════════════════════════
-- SELLER CARD READ MODEL VIEW + PERFORMANCE INDEXES
-- 
-- Purpose: Aggregated read-only view for seller storefronts, discovery,
--          Near Me filtering, community pages, and live show attribution
-- 
-- IMPORTANT:
-- - This is a READ-ONLY view (no mutations)
-- - Filters out non-approved and suspended sellers
-- - Respects global account_status enforcement
-- - Does NOT contain sensitive data (phone, email, revenue details)
-- - Designed for high-volume reads at platform scale
--
-- Created: 2025-12-25
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: PERFORMANCE INDEXES ON BASE TABLES
-- 
-- These indexes support high-volume reads for SellerCard and discovery.
-- SAFE TO APPLY. NO DATA MUTATION.
-- Created BEFORE the view so the view benefits immediately.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Index for filtering approved sellers (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_sellers_status_approved
ON public.sellers (status)
WHERE status = 'approved';

-- Index for follower count aggregation
CREATE INDEX IF NOT EXISTS idx_followed_sellers_seller_id
ON public.followed_sellers (seller_id);

-- Index for review stats aggregation (seller_id + created_date for recent reviews)
CREATE INDEX IF NOT EXISTS idx_reviews_seller_created
ON public.reviews (seller_id, created_date DESC);

-- Index for active product count (partial index for active + in-stock only)
CREATE INDEX IF NOT EXISTS idx_products_seller_active
ON public.products (seller_id)
WHERE status = 'active' AND quantity > 0;

-- Index for order stats aggregation (orders use user_id as seller_id)
CREATE INDEX IF NOT EXISTS idx_orders_seller_user
ON public.orders (seller_id);

-- Composite index for show lookups by seller and status
CREATE INDEX IF NOT EXISTS idx_shows_seller_status
ON public.shows (seller_id, status);

-- Index for upcoming shows (scheduled, ordered by start time)
CREATE INDEX IF NOT EXISTS idx_shows_scheduled_start
ON public.shows (seller_id, scheduled_start)
WHERE status = 'scheduled';

-- Index for recent ended shows (for past shows display)
CREATE INDEX IF NOT EXISTS idx_shows_ended_at
ON public.shows (seller_id, ended_at DESC)
WHERE status = 'ended';

-- Index for live show lookup (fast single-row lookup)
CREATE INDEX IF NOT EXISTS idx_shows_live
ON public.shows (seller_id)
WHERE status = 'live';

-- Index for user account status + role filtering
CREATE INDEX IF NOT EXISTS idx_users_account_status_role
ON public.users (account_status, role)
WHERE account_status = 'active';


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: SELLER CARDS VIEW
-- 
-- Aggregated read model for seller storefronts and discovery.
-- Uses LATERAL joins for efficient per-seller aggregation.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.seller_cards AS
SELECT
    -- ═══════════════════════════════════════════════════════════════════════
    -- A) IDENTITY FIELDS
    -- ═══════════════════════════════════════════════════════════════════════
    s.id                            AS seller_id,
    s.user_id                       AS user_id,
    s.business_name                 AS display_name,
    s.profile_image_url             AS avatar_url,
    s.background_image_url          AS banner_url,
    LEFT(s.bio, 200)                AS short_bio,
    s.pickup_city                   AS city,
    s.pickup_state                  AS state,
    DATE(s.created_at)              AS member_since,

    -- ═══════════════════════════════════════════════════════════════════════
    -- B) SOCIAL PROOF FIELDS (Computed via LATERAL subqueries)
    -- ═══════════════════════════════════════════════════════════════════════
    COALESCE(follower_stats.follower_count, 0)      AS follower_count,
    COALESCE(review_stats.rating_average, 0)        AS rating_average,
    COALESCE(review_stats.rating_count, 0)          AS rating_count,
    review_stats.recent_review_ids                  AS recent_review_ids,

    -- ═══════════════════════════════════════════════════════════════════════
    -- C) COMMERCE STATS FIELDS
    -- ═══════════════════════════════════════════════════════════════════════
    COALESCE(product_stats.total_products, 0)       AS total_products,
    COALESCE(order_stats.total_items_sold, 0)       AS total_items_sold,
    COALESCE(order_stats.total_orders, 0)           AS total_orders,
    COALESCE(s.stripe_connected, false)             AS is_accepting_orders,

    -- ═══════════════════════════════════════════════════════════════════════
    -- D) CONTENT REFERENCE FIELDS
    -- ═══════════════════════════════════════════════════════════════════════
    product_stats.active_product_ids                AS active_product_ids,
    show_stats.live_show_id                         AS live_show_id,
    show_stats.upcoming_show_ids                    AS upcoming_show_ids,
    show_stats.recent_show_ids                      AS recent_show_ids,

    -- ═══════════════════════════════════════════════════════════════════════
    -- E) METADATA
    -- ═══════════════════════════════════════════════════════════════════════
    s.created_at                                    AS created_at,
    CURRENT_TIMESTAMP                               AS computed_at

FROM public.sellers s

-- ═══════════════════════════════════════════════════════════════════════════
-- JOIN: Ensure only active platform users
-- ═══════════════════════════════════════════════════════════════════════════
INNER JOIN public.users u ON u.id = s.user_id

-- ═══════════════════════════════════════════════════════════════════════════
-- LATERAL JOIN: Follower count (deduplicated by buyer_id)
-- ═══════════════════════════════════════════════════════════════════════════
LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT f.buyer_id) AS follower_count
    FROM public.followed_sellers f
    WHERE f.seller_id = s.id
) follower_stats ON true

-- ═══════════════════════════════════════════════════════════════════════════
-- LATERAL JOIN: Review stats (average, count, recent IDs)
-- ═══════════════════════════════════════════════════════════════════════════
LEFT JOIN LATERAL (
    SELECT 
        ROUND(AVG(r.star_rating)::numeric, 2)   AS rating_average,
        COUNT(*)                                 AS rating_count,
        ARRAY(
            SELECT r2.id
            FROM public.reviews r2
            WHERE r2.seller_id = s.id
            ORDER BY r2.created_date DESC
            LIMIT 3
        )                                        AS recent_review_ids
    FROM public.reviews r
    WHERE r.seller_id = s.id
) review_stats ON true

-- ═══════════════════════════════════════════════════════════════════════════
-- LATERAL JOIN: Product stats (active count, IDs)
-- ═══════════════════════════════════════════════════════════════════════════
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*)                                    AS total_products,
        ARRAY_AGG(p.id ORDER BY p.created_at DESC)  AS active_product_ids
    FROM public.products p
    WHERE p.seller_id = s.id
      AND p.status = 'active'
      AND p.quantity > 0
) product_stats ON true

-- ═══════════════════════════════════════════════════════════════════════════
-- LATERAL JOIN: Order stats
-- READ PATH (Step T3.5): Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
-- - New orders: seller_entity_id = sellers.id
-- - Legacy orders: seller_id = sellers.user_id (seller_entity_id is null)
-- ═══════════════════════════════════════════════════════════════════════════
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*)                                    AS total_orders,
        COUNT(*) FILTER (
            WHERE o.status IN ('paid', 'picked_up')
        )                                           AS total_items_sold
    FROM public.orders o
    WHERE 
        -- Canonical: seller_entity_id = sellers.id (preferred)
        o.seller_entity_id = s.id
        OR (
            -- Legacy fallback: seller_id = sellers.user_id (when seller_entity_id is null)
            o.seller_entity_id IS NULL
            AND o.seller_id = s.user_id
        )
) order_stats ON true

-- ═══════════════════════════════════════════════════════════════════════════
-- LATERAL JOIN: Show stats (live, upcoming, recent)
-- ═══════════════════════════════════════════════════════════════════════════
LEFT JOIN LATERAL (
    SELECT 
        (SELECT sh.id FROM public.shows sh
         WHERE sh.seller_id = s.id AND sh.status = 'live'
         LIMIT 1)                                   AS live_show_id,
        ARRAY(
            SELECT sh.id FROM public.shows sh
            WHERE sh.seller_id = s.id
              AND sh.status = 'scheduled'
            ORDER BY sh.scheduled_start ASC
            LIMIT 5
        )                                           AS upcoming_show_ids,
        ARRAY(
            SELECT sh.id FROM public.shows sh
            WHERE sh.seller_id = s.id
              AND sh.status = 'ended'
            ORDER BY sh.ended_at DESC
            LIMIT 5
        )                                           AS recent_show_ids
) show_stats ON true

-- ═══════════════════════════════════════════════════════════════════════════
-- FILTERS: Only approved sellers with active platform accounts
-- ═══════════════════════════════════════════════════════════════════════════
WHERE
    s.status = 'approved'
    AND u.account_status = 'active'
    AND u.role IN ('seller', 'admin', 'super_admin');


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: VIEW DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON VIEW public.seller_cards IS 
'Read-only aggregated Seller Card view for storefronts, discovery, Near Me, and community pages.

FIELDS:
- seller_id: Primary identifier (sellers.id)
- user_id: Auth user ID (sellers.user_id)
- display_name: Business name
- avatar_url: Profile image
- banner_url: Banner image
- short_bio: Bio truncated to 200 chars
- city/state: Location for Near Me filtering
- member_since: Join date
- follower_count: Unique followers
- rating_average: Average star rating (0-5)
- rating_count: Number of reviews
- recent_review_ids: Latest 3 review IDs
- total_products: Active product count
- total_items_sold: Completed orders
- total_orders: All orders
- is_accepting_orders: Stripe connected
- active_product_ids: Array of active product IDs
- live_show_id: Current live show (if any)
- upcoming_show_ids: Scheduled shows
- recent_show_ids: Recent ended shows

FILTERS:
- Only approved sellers (status = approved)
- Only active accounts (account_status = active)
- Only seller/admin roles

PRIVACY:
- No PII (email, phone, address)
- No financial details (revenue)
- No enforcement internals

Created: 2025-12-25';


-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════

