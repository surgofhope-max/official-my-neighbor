-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add case-insensitive unique index for display_name
-- 
-- Purpose: Ensure display names are globally unique (case-insensitive)
-- Constraint: NULL values are allowed (users without display name yet)
--
-- This supports the semi-immutable display name feature:
-- - User can set display_name once via Buyer Profile
-- - After first save, display_name cannot be changed (except by admin)
-- - Display names are unique across all users
-- ═══════════════════════════════════════════════════════════════════════════

-- Create unique index on lower(display_name) to enforce case-insensitive uniqueness
-- NULLS are allowed (partial index excludes NULLs from uniqueness check)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_unique_lower
ON public.users (LOWER(display_name))
WHERE display_name IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_users_display_name_unique_lower IS 
'Case-insensitive unique constraint for display names. NULLs allowed.';

















