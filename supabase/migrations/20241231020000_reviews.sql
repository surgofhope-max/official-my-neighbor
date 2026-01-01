-- ═══════════════════════════════════════════════════════════════════════════════
-- REVIEWS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Buyer reviews for completed and verified orders.
-- Reviews are immutable once published.
-- One review per order.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create the reviews table
-- NOTE: Column names match existing seller_cards view expectations
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  star_rating INTEGER NOT NULL CHECK (star_rating >= 1 AND star_rating <= 5),
  review_text TEXT,
  buyer_name TEXT,
  buyer_profile_image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One review per order
  CONSTRAINT reviews_order_id_unique UNIQUE (order_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer_id ON reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_seller_id ON reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_star_rating ON reviews(star_rating);
CREATE INDEX IF NOT EXISTS idx_reviews_published ON reviews(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_reviews_created_date ON reviews(created_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Public can read published reviews
CREATE POLICY "Public can read published reviews"
  ON reviews
  FOR SELECT
  USING (is_published = true);

-- Buyers can read their own reviews (even unpublished)
CREATE POLICY "Buyers can read own reviews"
  ON reviews
  FOR SELECT
  USING (
    buyer_id IN (
      SELECT id FROM buyer_profiles WHERE user_id = auth.uid()
    )
  );

-- Sellers can read reviews about them
CREATE POLICY "Sellers can read their reviews"
  ON reviews
  FOR SELECT
  USING (
    seller_id IN (
      SELECT id FROM sellers WHERE user_id = auth.uid()
    )
  );

-- Only buyers can insert reviews for their verified orders
CREATE POLICY "Buyers can insert reviews for verified orders"
  ON reviews
  FOR INSERT
  WITH CHECK (
    -- Must be the buyer
    buyer_id IN (
      SELECT id FROM buyer_profiles WHERE user_id = auth.uid()
    )
    -- Order must be completed
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_id
        AND o.status = 'completed'
    )
    -- Order must be verified
    AND EXISTS (
      SELECT 1 FROM order_verifications ov
      WHERE ov.order_id = order_id
        AND ov.verified_at IS NOT NULL
    )
  );

-- Reviews are immutable - no updates allowed
-- (No UPDATE policy = no updates possible)

-- Reviews cannot be deleted by users
-- (No DELETE policy = no deletes possible)

-- ═══════════════════════════════════════════════════════════════════════════════
-- SELLER RATING AGGREGATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add rating columns to sellers if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sellers' AND column_name = 'average_rating'
  ) THEN
    ALTER TABLE sellers ADD COLUMN average_rating NUMERIC(3,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sellers' AND column_name = 'review_count'
  ) THEN
    ALTER TABLE sellers ADD COLUMN review_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Function to update seller rating aggregate
CREATE OR REPLACE FUNCTION update_seller_rating_aggregate()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_avg_rating NUMERIC(3,2);
  v_review_count INTEGER;
BEGIN
  -- Determine which seller to update
  IF TG_OP = 'DELETE' THEN
    v_seller_id := OLD.seller_id;
  ELSE
    v_seller_id := NEW.seller_id;
  END IF;
  
  -- Calculate new aggregate
  SELECT 
    COALESCE(AVG(star_rating)::NUMERIC(3,2), 0),
    COUNT(*)::INTEGER
  INTO v_avg_rating, v_review_count
  FROM reviews
  WHERE seller_id = v_seller_id
    AND is_published = true;
  
  -- Update seller
  UPDATE sellers
  SET 
    average_rating = v_avg_rating,
    review_count = v_review_count
  WHERE id = v_seller_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update seller rating on review changes
DROP TRIGGER IF EXISTS trigger_update_seller_rating ON reviews;
CREATE TRIGGER trigger_update_seller_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_rating_aggregate();

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Check if order is review eligible
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_order_review_eligible(p_order_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM orders o
    JOIN order_verifications ov ON ov.order_id = o.id
    WHERE o.id = p_order_id
      AND o.status = 'completed'
      AND ov.verified_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM reviews r WHERE r.order_id = p_order_id
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Get review eligibility status for buyer's orders
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_buyer_review_eligible_orders(p_buyer_id UUID)
RETURNS TABLE (
  order_id UUID,
  seller_id UUID,
  product_id UUID,
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  has_review BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id AS order_id,
    o.seller_id,
    o.product_id,
    o.completed_at,
    ov.verified_at,
    EXISTS (SELECT 1 FROM reviews r WHERE r.order_id = o.id) AS has_review
  FROM orders o
  LEFT JOIN order_verifications ov ON ov.order_id = o.id
  WHERE o.buyer_id = p_buyer_id
    AND o.status = 'completed'
    AND ov.verified_at IS NOT NULL
  ORDER BY ov.verified_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE reviews IS 
  'Buyer reviews for completed and verified orders. Immutable once published.';
COMMENT ON COLUMN reviews.rating IS 
  'Star rating from 1 to 5';
COMMENT ON COLUMN reviews.review_text IS 
  'Optional text review from buyer';
COMMENT ON COLUMN reviews.is_published IS 
  'Whether review is publicly visible. Always true on creation.';
COMMENT ON FUNCTION is_order_review_eligible IS 
  'Check if an order can receive a review (completed + verified + no existing review)';
COMMENT ON FUNCTION get_buyer_review_eligible_orders IS 
  'Get all orders for a buyer that are eligible for review';

