-- ═══════════════════════════════════════════════════════════════════════════════
-- SELLER CARDS VIEW UPDATE: Add Buyer Avatar Inheritance
-- 
-- Purpose: Allow seller surfaces to fall back to buyer profile avatar
--          when seller has no explicit profile_image_url
-- 
-- This adds:
-- - buyer_avatar_url: The buyer profile image (if exists) for this seller's user
-- 
-- Inheritance order for UI:
-- 1) sellers.profile_image_url (explicit seller override)
-- 2) buyer_profiles.profile_image_url (fallback)
-- 3) UI fallback (initials/icon)
--
-- Created: 2025-12-27
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
    -- A.1) BUYER AVATAR FALLBACK (NEW)
    -- Used when seller has no profile_image_url
    -- ═══════════════════════════════════════════════════════════════════════
    bp.profile_image_url            AS buyer_avatar_url,

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
-- LEFT JOIN: Buyer profile for avatar fallback (may not exist for seller-first users)
-- ═══════════════════════════════════════════════════════════════════════════
LEFT JOIN public.buyer_profiles bp ON bp.user_id = s.user_id

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
-- READ PATH: Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
-- ═══════════════════════════════════════════════════════════════════════════
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*)                                    AS total_orders,
        COUNT(*) FILTER (
            WHERE o.status IN ('paid', 'picked_up')
        )                                           AS total_items_sold
    FROM public.orders o
    WHERE 
        o.seller_entity_id = s.id
        OR (
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


COMMENT ON VIEW public.seller_cards IS 
'Read-only aggregated Seller Card view for storefronts, discovery, Near Me, and community pages.

FIELDS:
- seller_id: Primary identifier (sellers.id)
- user_id: Auth user ID (sellers.user_id)
- display_name: Business name
- avatar_url: Seller profile image (explicit override)
- buyer_avatar_url: Buyer profile image (fallback, may be null)
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

AVATAR INHERITANCE:
UI should prefer avatar_url, fallback to buyer_avatar_url, then UI fallback.

FILTERS:
- Only approved sellers (status = approved)
- Only active accounts (account_status = active)
- Only seller/admin roles

Updated: 2025-12-27 - Added buyer_avatar_url for avatar inheritance';

















