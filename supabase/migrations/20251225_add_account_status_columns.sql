-- ═══════════════════════════════════════════════════════════════════════════
-- PLATFORM-LEVEL ACCOUNT SUSPENSION: Add account_status to public.users
-- 
-- This enables Suspend/Unsuspend functionality for BOTH buyers and sellers.
-- Suspended users enter VIEWER-ONLY mode (can browse, cannot transact).
--
-- IMPORTANT: This does NOT modify roles, seller status, or auth.users.
-- ═══════════════════════════════════════════════════════════════════════════

-- Add account_status column with 'active' as default
-- Allowed values: 'active', 'suspended'
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

-- Add reason for status change (useful for audit/support)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS account_status_reason TEXT NULL;

-- Timestamp of last status change
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS account_status_updated_at TIMESTAMPTZ NULL;

-- Admin who made the status change (UUID of admin user)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS account_status_updated_by UUID NULL;

-- Add constraint to ensure only valid status values
-- (Using a check constraint rather than enum for flexibility)
ALTER TABLE public.users 
ADD CONSTRAINT chk_account_status_valid 
CHECK (account_status IN ('active', 'suspended'));

-- Create index for efficient status filtering in admin queries
CREATE INDEX IF NOT EXISTS idx_users_account_status 
ON public.users (account_status);

-- Add comment for documentation
COMMENT ON COLUMN public.users.account_status IS 'Platform account status: active (full access) or suspended (viewer-only mode)';
COMMENT ON COLUMN public.users.account_status_reason IS 'Admin-provided reason for suspension';
COMMENT ON COLUMN public.users.account_status_updated_at IS 'Timestamp of last account_status change';
COMMENT ON COLUMN public.users.account_status_updated_by IS 'UUID of admin who changed the status';





