-- ============================================================================
-- LIVE SHOW MESSAGES TABLE
-- ============================================================================
-- Ephemeral chat messages for live shows.
-- Messages are scoped to a show and only accessible while the show is live.
-- This is separate from the persistent messaging system.
-- ============================================================================

-- Create the live_show_messages table
CREATE TABLE IF NOT EXISTS live_show_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('seller', 'viewer')),
  message TEXT NOT NULL CHECK (char_length(message) > 0 AND char_length(message) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient message retrieval by show
CREATE INDEX IF NOT EXISTS idx_live_show_messages_show_id 
  ON live_show_messages(show_id);

-- Index for chronological ordering
CREATE INDEX IF NOT EXISTS idx_live_show_messages_created_at 
  ON live_show_messages(show_id, created_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Messages can only be read/written when the show is live.
-- This ensures chat "disappears" when the show ends.
-- ============================================================================

ALTER TABLE live_show_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to check if a show is currently live
CREATE OR REPLACE FUNCTION is_show_live(p_show_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM shows 
    WHERE id = p_show_id 
    AND (
      (stream_status = 'live' OR stream_status = 'starting')
      OR is_streaming = true 
      OR status = 'live'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'role') = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SELECT: Authenticated users can read messages only if show is live (or admin)
DROP POLICY IF EXISTS "live_show_messages_select_policy" ON live_show_messages;
CREATE POLICY "live_show_messages_select_policy" ON live_show_messages
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_show_live(show_id)
      OR is_admin_user()
    )
  );

-- INSERT: Authenticated users can send messages only if show is live
DROP POLICY IF EXISTS "live_show_messages_insert_policy" ON live_show_messages;
CREATE POLICY "live_show_messages_insert_policy" ON live_show_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = sender_id
    AND is_show_live(show_id)
  );

-- No UPDATE allowed - messages cannot be edited
-- No DELETE allowed - messages cannot be deleted by users
-- (Service role can still clean up old messages)

-- ============================================================================
-- CLEANUP FUNCTION (Optional)
-- ============================================================================
-- Function to clean up old live chat messages from ended shows.
-- Can be called via cron job to remove stale data.
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_live_show_messages()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete messages from shows that have ended (status = 'ended')
  -- and are older than 24 hours
  DELETE FROM live_show_messages
  WHERE show_id IN (
    SELECT id FROM shows 
    WHERE status = 'ended' 
    AND (
      ended_at < now() - interval '24 hours'
      OR (ended_at IS NULL AND actual_end < now() - interval '24 hours')
    )
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE live_show_messages IS 
  'Ephemeral chat messages for live shows. Only accessible while show is live.';
COMMENT ON COLUMN live_show_messages.sender_role IS 
  'Role of the sender: seller (show host) or viewer';
COMMENT ON FUNCTION is_show_live(UUID) IS 
  'Check if a show is currently live (for RLS policies)';
COMMENT ON FUNCTION cleanup_old_live_show_messages() IS 
  'Clean up old live chat messages from ended shows (for maintenance)';





