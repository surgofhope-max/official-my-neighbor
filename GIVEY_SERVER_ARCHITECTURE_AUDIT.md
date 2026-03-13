# GIVEY SERVER ARCHITECTURE AUDIT
## Factual Map — No Suggestions, No Recommendations

---

## SECTION 1 — SERVER EXPIRATION FUNCTION FILES

### supabase/functions/finalize-expired-giveys/index.ts

| Property | Value |
|----------|-------|
| File path | supabase/functions/finalize-expired-giveys/index.ts |
| Folder path | supabase/functions/finalize-expired-giveys/ |
| Function name | processExpiredGiveys |
| Line numbers | 14–52 (async function), 54–61 (serve handler) |

**Exact code block:**

```typescript
async function processExpiredGiveys() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const now = new Date().toISOString();

  const { data: expiredGiveys, error: fetchError } = await supabase
    .from("givey_events")
    .select("id")
    .eq("status", "active")
    .lte("ends_at", now)
    .order("ends_at", { ascending: true })
    .limit(200);

  if (fetchError) {
    console.error("Failed to fetch expired giveys", fetchError);
    return;
  }

  if (!expiredGiveys || expiredGiveys.length === 0) {
    return;
  }

  for (const row of expiredGiveys) {
    try {
      const { error } = await supabase.rpc("finalize_givey_event", {
        p_givey_event_id: row.id,
      });
      if (error) {
        console.error(`${row.id}: ${error.message}`);
      }
    } catch (e) {
      console.error(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

serve(async () => {
  await processExpiredGiveys();

  return new Response(
    JSON.stringify({ status: "ok" }),
    { headers: { "Content-Type": "application/json" } }
  );
});
```

### supabase/scripts/expire_givey.sql

| Property | Value |
|----------|-------|
| File path | supabase/scripts/expire_givey.sql |
| Folder path | supabase/scripts/ |
| Function name | N/A (ad-hoc SQL script) |
| Line numbers | 1–8 |

**Exact code block:**

```sql
-- Manually expire an active givey event.
-- Run in Supabase SQL Editor. Replace <active_givey_id> with the actual UUID.
-- This triggers postgres_changes realtime; HostConsole will clear activeGivey UI.

update public.givey_events
set status = 'expired'
where id = '<active_givey_id>';
```

---

## SECTION 2 — CRON / SCHEDULER MAPPING

### Documented schedule (README only — not in codebase)

| Property | Value |
|----------|-------|
| Job name | finalize-expired-giveys |
| Schedule interval | Every 5 seconds (documented as `*/5 * * * * *` in README) |
| File path | supabase/functions/finalize-expired-giveys/README.md |
| Function executed | HTTP POST to edge function URL |
| Scheduler type | pg_cron (example SQL in README; actual schedule not in repo) |

**Code block from README (lines 23–36):**

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'finalize-expired-giveys',
  '*/5 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/finalize-expired-giveys',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

**Fact:** No `cron.schedule` or `pg_cron` job definition for Givey exists in migrations or SQL files. The schedule is documented in README as an example the operator must run manually.

---

## SECTION 3 — DATABASE RPC FUNCTIONS

### finalize_givey_event

| Property | Value |
|----------|-------|
| Function name | finalize_givey_event |
| File path or migration | NOT FOUND in supabase/migrations/ |
| Full SQL definition | NOT IN REPOSITORY |
| Parameters | `p_givey_event_id` (referenced in edge function and HostConsole) |
| Update statements affecting givey_events | NOT IN REPOSITORY — RPC implementation not present in codebase |

**Fact:** The RPC is invoked by:
- `supabase/functions/finalize-expired-giveys/index.ts` (line 42)
- `src/pages/HostConsole.jsx` (line 592)

The RPC definition (CREATE FUNCTION) is not in any migration or SQL file in this repository.

### start_givey_event

| Property | Value |
|----------|-------|
| Function name | start_givey_event |
| File path or migration | NOT FOUND in supabase/migrations/ |
| Invoked from | src/pages/HostConsole.jsx (line 673) |

**Fact:** The RPC is invoked by HostConsole; its SQL definition is not in this repository.

---

## SECTION 4 — SERVER EXECUTION FLOW

### Path A: Edge function (cron / HTTP)

| Step | Location | File |
|------|----------|------|
| 1. Expiration detection | Query: `givey_events` where `status = 'active'` and `ends_at <= now()` | supabase/functions/finalize-expired-giveys/index.ts:24–30 |
| 2. Server function | `processExpiredGiveys()` | supabase/functions/finalize-expired-giveys/index.ts:14–52 |
| 3. Database RPC | `supabase.rpc("finalize_givey_event", { p_givey_event_id: row.id })` | supabase/functions/finalize-expired-giveys/index.ts:42–44 |
| 4. Database row update | Performed by RPC (implementation not in repo) | — |
| 5. Realtime broadcast | Supabase Realtime postgres_changes on `givey_events` (standard behavior for table updates) | Client subscriptions in HostConsole.jsx, LiveShow.jsx |

### Path B: Host client watcher (client-side, not server)

| Step | Location | File |
|------|----------|------|
| 1. Expiration detection | Client reads `giveyLifecycleRef.current.endsAt`, compares to `Date.now()` | src/pages/HostConsole.jsx:568–582 |
| 2. RPC call | `supabase.rpc("finalize_givey_event", { p_givey_event_id: giveyId })` | src/pages/HostConsole.jsx:591–593 |
| 3. Database row update | Performed by RPC | — |
| 4. Realtime broadcast | Same as Path A | — |

### Path C: Manual SQL script

| Step | Location | File |
|------|----------|------|
| 1. Manual execution | Operator runs script in SQL Editor | supabase/scripts/expire_givey.sql |
| 2. Direct update | `UPDATE givey_events SET status = 'expired' WHERE id = '<id>'` | supabase/scripts/expire_givey.sql:5–7 |
| 3. Realtime broadcast | postgres_changes on givey_events | — |

**Note:** Path C does not call `finalize_givey_event`; it directly sets `status = 'expired'`. The README states the edge function calls the RPC, which performs the full finalization logic (e.g., winner selection). The manual script only sets status.

---

## SECTION 5 — REALTIME BROADCAST TRIGGERS

| Property | Value |
|----------|-------|
| Table name | givey_events |
| Event type | postgres_changes (UPDATE) |
| Trigger | Row update from `finalize_givey_event` RPC or direct UPDATE |
| Configuration | Supabase Realtime — table must be in replication publication (standard for public schema) |
| Code triggering broadcast | RPC body (not in repo) or direct UPDATE in expire_givey.sql |

**Client subscriptions:**

| File | Line | Subscription |
|------|------|--------------|
| src/pages/HostConsole.jsx | 454–461 | `postgres_changes`, event: "UPDATE", table: "givey_events", filter: `show_id=eq.${show.id}` |
| src/pages/LiveShow.jsx | 414–421 | `postgres_changes`, event: "*", table: "givey_events", filter: `show_id=eq.${show.id}` |

**Fact:** No explicit realtime trigger or function is defined in the repo. Realtime is driven by Supabase’s built-in behavior for table updates.

---

## SECTION 6 — DEPENDENCY MAP

### Server-side components involved in Givey expiration

| Component | Type | File path |
|-----------|------|-----------|
| finalize-expired-giveys | Edge function | supabase/functions/finalize-expired-giveys/index.ts |
| processExpiredGiveys | Async function | supabase/functions/finalize-expired-giveys/index.ts:14–52 |
| finalize-expired-giveys README | Documentation | supabase/functions/finalize-expired-giveys/README.md |
| expire_givey | SQL script | supabase/scripts/expire_givey.sql |

### Components NOT in repository

| Component | Type | Status |
|-----------|------|--------|
| finalize_givey_event | Database RPC | Not in migrations |
| start_givey_event | Database RPC | Not in migrations |
| givey_events | Database table | Schema not in migrations |
| pg_cron job for finalize-expired-giveys | Scheduled job | Example in README only; no migration |

### Client-side (reference only — not server)

| Component | File |
|-----------|------|
| Host watcher (calls finalize_givey_event) | src/pages/HostConsole.jsx |
| Realtime subscription (Host) | src/pages/HostConsole.jsx |
| Realtime subscription (Buyer) | src/pages/LiveShow.jsx |

---

## SUMMARY TABLE

| Item | In Repository |
|------|---------------|
| Edge function (finalize-expired-giveys) | Yes |
| processExpiredGiveys logic | Yes |
| finalize_givey_event RPC definition | No |
| givey_events table schema | No |
| pg_cron schedule for edge function | No (README example only) |
| Manual expire script | Yes |
| Realtime subscription (client) | Yes |
