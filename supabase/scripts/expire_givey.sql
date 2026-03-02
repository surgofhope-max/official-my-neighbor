-- Manually expire an active givey event.
-- Run in Supabase SQL Editor. Replace <active_givey_id> with the actual UUID.
-- This triggers postgres_changes realtime; HostConsole will clear activeGivey UI.

update public.givey_events
set status = 'expired'
where id = '<active_givey_id>';
