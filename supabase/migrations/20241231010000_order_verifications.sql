-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDER VERIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Physical confirmation handoff between buyer and seller.
-- Buyer receives a verification code on order completion.
-- Seller enters code to confirm physical receipt.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create the order_verifications table
CREATE TABLE IF NOT EXISTS order_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  verification_code TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One verification per order
  CONSTRAINT order_verifications_order_id_unique UNIQUE (order_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_order_verifications_order_id 
  ON order_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_verifications_buyer_id 
  ON order_verifications(buyer_id);
CREATE INDEX IF NOT EXISTS idx_order_verifications_seller_id 
  ON order_verifications(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_verifications_verified_at 
  ON order_verifications(verified_at) WHERE verified_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Generate verification code on order completion
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_verification_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
BEGIN
  -- Generate a 6-digit numeric code
  code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Create verification record when order is completed
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_order_verification_on_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes TO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    -- Check if verification doesn't already exist
    IF NOT EXISTS (SELECT 1 FROM order_verifications WHERE order_id = NEW.id) THEN
      INSERT INTO order_verifications (
        order_id,
        buyer_id,
        seller_id,
        verification_code
      ) VALUES (
        NEW.id,
        NEW.buyer_id,
        NEW.seller_id,
        generate_verification_code()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic verification generation
DROP TRIGGER IF EXISTS trigger_create_order_verification ON orders;
CREATE TRIGGER trigger_create_order_verification
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION create_order_verification_on_complete();

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE order_verifications ENABLE ROW LEVEL SECURITY;

-- Buyers can read their own verifications (to see the code)
CREATE POLICY "Buyers can read own verifications"
  ON order_verifications
  FOR SELECT
  USING (
    buyer_id IN (
      SELECT id FROM buyer_profiles WHERE user_id = auth.uid()
    )
  );

-- Sellers can read verifications for their orders (to see status)
CREATE POLICY "Sellers can read their order verifications"
  ON order_verifications
  FOR SELECT
  USING (
    seller_id IN (
      SELECT id FROM sellers WHERE user_id = auth.uid()
    )
  );

-- Sellers can update verification (to mark as verified)
CREATE POLICY "Sellers can verify orders"
  ON order_verifications
  FOR UPDATE
  USING (
    seller_id IN (
      SELECT id FROM sellers WHERE user_id = auth.uid()
    )
    AND verified_at IS NULL  -- Can only verify once
  )
  WITH CHECK (
    seller_id IN (
      SELECT id FROM sellers WHERE user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Verify order with code
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION verify_order_with_code(
  p_order_id UUID,
  p_verification_code TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_verification order_verifications%ROWTYPE;
  v_seller_id UUID;
BEGIN
  -- Get caller's seller_id
  SELECT id INTO v_seller_id 
  FROM sellers 
  WHERE user_id = auth.uid();
  
  IF v_seller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized as seller');
  END IF;
  
  -- Find the verification record
  SELECT * INTO v_verification
  FROM order_verifications
  WHERE order_id = p_order_id
    AND seller_id = v_seller_id;
  
  IF v_verification.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verification not found');
  END IF;
  
  IF v_verification.verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already verified');
  END IF;
  
  -- Check code match
  IF v_verification.verification_code <> p_verification_code THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid verification code');
  END IF;
  
  -- Mark as verified
  UPDATE order_verifications
  SET verified_at = now(),
      updated_at = now()
  WHERE id = v_verification.id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'verified_at', now(),
    'order_id', p_order_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE order_verifications IS 
  'Physical handoff verification between buyer and seller. Buyer shows code, seller enters to confirm.';
COMMENT ON COLUMN order_verifications.verification_code IS 
  '6-digit code shown to buyer, entered by seller to confirm receipt';
COMMENT ON COLUMN order_verifications.verified_at IS 
  'Timestamp when seller confirmed receipt. NULL = awaiting verification';
COMMENT ON FUNCTION verify_order_with_code IS 
  'Seller-callable function to verify order with buyer code';


