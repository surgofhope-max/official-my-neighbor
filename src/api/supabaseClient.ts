/**
 * Supabase Client Re-export
 *
 * TEMPORARY ALIAS during Base44 → Supabase migration.
 *
 * This file re-exports the canonical Supabase client to maintain
 * backwards compatibility with existing import paths.
 *
 * Existing imports like:
 *   import { supabaseApi } from "@/api/supabaseClient";
 *
 * Will now resolve to the raw Supabase client instance.
 *
 * NOTE: Code using supabaseApi.auth.me(), supabaseApi.entities.*, etc.
 * must be migrated to use direct Supabase client methods or the new
 * typed API functions in src/api/*.ts.
 *
 * After migration is complete, consumers should import directly from:
 *   import { supabase } from "@/lib/supabase/supabaseClient";
 */

import { supabase } from "@/lib/supabase/supabaseClient";

// Named export for backwards compatibility with existing imports
export const supabaseApi = supabase;

// Also export the client directly
export { supabase };

// Default export for any imports using: import supabaseApi from "..."
export default supabase;
