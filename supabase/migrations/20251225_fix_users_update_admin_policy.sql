-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Allow both 'admin' AND 'super_admin' roles to UPDATE public.users
-- 
-- Problem: The existing users_update_admin_only policy only allowed role='admin'
-- but super_admin users were being blocked, causing silent 0-row updates.
--
-- Solution: Expand the policy to include both admin roles.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS users_update_admin_only ON public.users;

-- Recreate with support for both admin and super_admin roles
CREATE POLICY users_update_admin_only
ON public.users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'super_admin')
  )
);

-- Add comment for documentation
COMMENT ON POLICY users_update_admin_only ON public.users IS 
  'Allows admin and super_admin users to update any user row (for account_status, role changes, etc.)';

















