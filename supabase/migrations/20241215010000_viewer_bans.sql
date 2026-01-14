-- ════════════════════════════════════════════════════════════════════════════
-- VIEWER BANS TABLE (Supabase-native replacement for Base44 ViewerBan)
-- Migrated from Base44 entity to direct Supabase table with RLS
-- ════════════════════════════════════════════════════════════════════════════

-- Create viewer_bans table
CREATE TABLE IF NOT EXISTS viewer_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ban_type TEXT NOT NULL CHECK (ban_type IN ('chat', 'view', 'full')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Only one ban record per seller-viewer pair
  UNIQUE (seller_id, viewer_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_viewer_bans_seller_id ON viewer_bans(seller_id);
CREATE INDEX IF NOT EXISTS idx_viewer_bans_viewer_id ON viewer_bans(viewer_id);

-- Enable RLS
ALTER TABLE viewer_bans ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES FOR viewer_bans
-- ════════════════════════════════════════════════════════════════════════════

-- Policy 1: Sellers can manage bans for their own seller_id
CREATE POLICY "Sellers can manage their own bans"
  ON viewer_bans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sellers
      WHERE sellers.id = viewer_bans.seller_id
      AND sellers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sellers
      WHERE sellers.id = viewer_bans.seller_id
      AND sellers.user_id = auth.uid()
    )
  );

-- Policy 2: Viewers can see their own ban record (read-only)
CREATE POLICY "Viewers can see their own ban"
  ON viewer_bans
  FOR SELECT
  USING (viewer_bans.viewer_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- HARD SERVER ENFORCEMENT ON live_show_messages
-- Block banned users from inserting messages (cannot be bypassed client-side)
-- ════════════════════════════════════════════════════════════════════════════

-- Drop existing INSERT policy if it exists (we'll recreate with ban check)
DROP POLICY IF EXISTS "Users can send messages to live shows" ON live_show_messages;

-- Recreate INSERT policy WITH ban enforcement
CREATE POLICY "Users can send messages to live shows"
  ON live_show_messages
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated and sender_id must match auth user
    auth.uid() = sender_id
    -- Show must be live
    AND is_show_live(show_id)
    -- User must NOT be banned (chat or full ban)
    AND NOT EXISTS (
      SELECT 1 FROM viewer_bans
      WHERE viewer_bans.viewer_id = auth.uid()
      AND viewer_bans.ban_type IN ('chat', 'full')
      AND viewer_bans.seller_id = (
        SELECT seller_id FROM shows WHERE shows.id = live_show_messages.show_id
      )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE viewer_bans IS 'Stores viewer bans per seller. Ban types: chat (blocks chat only), view (blocks viewing), full (blocks both).';
COMMENT ON COLUMN viewer_bans.ban_type IS 'chat = blocks live chat, view = blocks show viewing, full = blocks both';
COMMENT ON COLUMN viewer_bans.reason IS 'Optional reason shown to banned user';














