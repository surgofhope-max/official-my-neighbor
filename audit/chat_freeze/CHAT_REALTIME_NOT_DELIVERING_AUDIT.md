# Chat Realtime Not Delivering — Root Cause Audit

**Purpose:** Explain why Live Show chat only shows the sender's own messages live, while other users' messages only appear after leaving/re-entering (initial fetch). This began after adding Realtime + message-polling gating.

**Scope:** SupabaseLiveChat.jsx, liveChat.ts, migrations, Supabase Realtime configuration.

**Audit Type:** Read-only. No code modifications.

---

## STEP 1 — Current Chat Pipelines (Code Proof)

### A) Realtime Subscription Definition

**File:** `src/components/chat/SupabaseLiveChat.jsx` (lines 289-318)

```javascript
const channel = supabase
  .channel(`live_show_messages:${showId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "live_show_messages",
      filter: `show_id=eq.${showId}`,
    },
    async (payload) => {
      const row = payload?.new;
      if (!row?.id) return;
      console.log("[REALTIME_CHAT] insert", { id: row.id, showId });
      await applyIncomingMessages([row]);
    }
  )
  .subscribe((status) => {
    realtimeActiveRef.current = status === "SUBSCRIBED";
    console.log("[REALTIME_CHAT] status", { status, showId });
  });
```

| Property | Value |
|----------|-------|
| Channel name | `live_show_messages:${showId}` |
| Event | `INSERT` |
| Schema | `public` |
| Table | `live_show_messages` |
| Filter | `show_id=eq.${showId}` |

### B) Subscription Status Handling

**File:** `src/components/chat/SupabaseLiveChat.jsx` (lines 306-310)

```javascript
.subscribe((status) => {
  realtimeActiveRef.current = status === "SUBSCRIBED";
  console.log("[REALTIME_CHAT] status", { status, showId });
});
```

- `realtimeActiveRef.current = true` when `status === "SUBSCRIBED"`
- `realtimeActiveRef.current = false` in cleanup (line 315) before `removeChannel`

### C) pollMessages Gate

**File:** `src/components/chat/SupabaseLiveChat.jsx` (lines 240-266)

```javascript
// Gate message fetch when realtime is active — reduces burst load, availability still runs
if (!realtimeActiveRef.current) {
  const { messages: serverMessages, error } = await getLiveShowMessages(showId, {
    limit: 100,
  });
  // ... merge logic ...
}
// Also check availability periodically (always runs)
await checkAvailability();
```

**Exact condition:** `if (!realtimeActiveRef.current)` — when TRUE, the fetch/merge block is skipped.

### D) Realtime Row Passed to applyIncomingMessages

**File:** `src/components/chat/SupabaseLiveChat.jsx` (lines 302-305)

```javascript
const row = payload?.new;
if (!row?.id) return;
console.log("[REALTIME_CHAT] insert", { id: row.id, showId });
await applyIncomingMessages([row]);
```

---

## STEP 2 — Hypothesis Check

### H1) Realtime is "SUBSCRIBED" but live_show_messages is NOT in the Supabase realtime publication

**Search performed:** `publication`, `supabase_realtime`, `add table`, `live_show_messages`, `REPLICA IDENTITY` in `supabase/` and project root.

**Evidence:**

| Search | Result |
|--------|--------|
| `publication` | No matches in supabase/migrations |
| `supabase_realtime` | No matches in supabase/migrations |
| `ALTER PUBLICATION` | No matches |
| `live_show_messages` | Migration `20241214010000_live_show_messages.sql` creates table, enables RLS, adds policies. **No line adds the table to any publication.** |

**Migration files mentioning publications:** None.

**Supabase documentation:** Postgres Changes requires tables to be added to the `supabase_realtime` publication:

> "Go to your project's Publications settings, and under supabase_realtime, toggle on the tables you want to listen to. Alternatively, add tables to the supabase_realtime publication by running: `alter publication supabase_realtime add table your_table_name;`"

**Conclusion:** **H1 SUPPORTED.** `live_show_messages` is never added to `supabase_realtime` in any migration. The channel can reach `SUBSCRIBED` (websocket connected), but no INSERT events are broadcast because the table is not in the publication.

---

### H2) RLS allows polling SELECT but blocks Realtime payload visibility to other users

**Evidence:**

**SELECT policy** (`supabase/migrations/20241214010000_live_show_messages.sql`, lines 64-72):

```sql
CREATE POLICY "live_show_messages_select_policy" ON live_show_messages
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_show_live(show_id)
      OR is_admin_user()
    )
  );
```

**is_show_live** (lines 37-49):

```sql
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
```

**Analysis:** Viewers can SELECT when `is_show_live(show_id)` is true (stream_status = 'live' or 'starting', or is_streaming = true, or status = 'live'). The policy does not restrict by sender — any authenticated user can read any row when the show is live.

**Realtime and RLS:** Supabase Realtime docs indicate that "every change event must be checked to see if the subscribed user has access" for Postgres Changes. If the table were in the publication, RLS would apply. Under the current SELECT policy, viewer A should be able to receive INSERT events for messages from viewer B when the show is live, because the policy allows any authenticated user to read when `is_show_live` is true.

**Conclusion:** **H2 UNLIKELY.** The SELECT policy allows viewers to read others' messages when the show is live. RLS would not explain why no events arrive — the more fundamental issue is that the table is not in the publication (H1).

---

### H3) Realtime payload shape mismatch causes applyIncomingMessages to drop/ignore events

**applyIncomingMessages field usage** (`SupabaseLiveChat.jsx`, lines 212-229):

| Field | Usage |
|-------|-------|
| `m.id` | Line 213: `!knownMessageIdsRef.current.has(m.id)`; Line 216: `knownMessageIdsRef.current.add(m.id)` |
| `m.sender_role` | Line 227: `accepted.filter((m) => m.sender_role === "viewer")` |
| `m.sender_id` | Implicit — fetchBuyerNames uses message objects; buyer_profiles uses user_id |

**LiveChatMessage interface** (`src/api/liveChat.ts`, lines 20-31):

```typescript
export interface LiveChatMessage {
  id: string;
  show_id: string;
  sender_id: string;
  sender_role: "seller" | "viewer";
  message: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
}
```

**getLiveShowMessages return:** `select("*")` from `live_show_messages` — PostgreSQL returns snake_case: `id`, `show_id`, `sender_id`, `sender_role`, `message`, `created_at`.

**sendLiveShowMessage return:** `.insert(...).select().single()` — same snake_case shape.

**Realtime payload.new:** Supabase Realtime returns the row as stored. PostgreSQL column names are snake_case. So `payload.new` has: `id`, `show_id`, `sender_id`, `sender_role`, `message`, `created_at`.

**Field mapping:**

| Field | Polling fetch | Send return | Realtime payload.new |
|-------|---------------|-------------|----------------------|
| id | ✓ snake_case | ✓ snake_case | ✓ snake_case |
| show_id | ✓ | ✓ | ✓ |
| sender_id | ✓ | ✓ | ✓ |
| sender_role | ✓ | ✓ | ✓ |
| message | ✓ | ✓ | ✓ |
| created_at | ✓ | ✓ | ✓ |

**Conclusion:** **H3 UNLIKELY.** Realtime and polling/send use the same snake_case shape. No normalization or mapping needed for the current code.

---

### H4) Gating is activating too early (or never deactivating), disabling polling even though realtime delivery is not functioning

**Places realtimeActiveRef.current is set:**

| Location | Value | Trigger |
|----------|-------|---------|
| SupabaseLiveChat.jsx:307 | `true` | `status === "SUBSCRIBED"` |
| SupabaseLiveChat.jsx:315 | `false` | Cleanup before removeChannel |

**Status comparison:** `status === "SUBSCRIBED"` — matches Layout.jsx (445, 566) and Supabase conventions.

**Sequence:**

1. Component mounts → realtime subscription starts.
2. Channel connects → status callback fires with `"SUBSCRIBED"` → `realtimeActiveRef.current = true`.
3. Polling runs every 2500ms. With `realtimeActiveRef.current === true`, the fetch/merge block is skipped.
4. No events arrive (table not in publication).
5. User B’s messages never reach user A’s client.
6. On leave/re-enter, initial `pollMessages()` runs before realtime may have connected, or `realtimeActiveRef` is false on first render, so the first poll fetches; or after unmount/remount, the first poll runs before `SUBSCRIBED`, so fetch runs.

**Conclusion:** **H4 SUPPORTED as contributing factor.** The gate works as designed: when status is SUBSCRIBED, polling is gated. Because events never arrive (H1), gating removes the only effective fallback for other users’ messages during the session. The gate is correct; the problem is that realtime never delivers events.

---

## STEP 3 — Repro-Aligned Conclusion

### Behavior Summary

| Observer | Own messages | Others' messages | After leave/re-enter |
|----------|--------------|------------------|----------------------|
| Sender | Immediate (send path) | N/A | Same |
| Other users | N/A | Not live | Visible (initial fetch) |

### Root Cause

**Primary:** **H1** — `live_show_messages` is not in the `supabase_realtime` publication. The channel can reach SUBSCRIBED, but no INSERT events are broadcast.

**Secondary:** **H4** — Gating disables the message fetch when realtime is “active,” so polling no longer delivers others’ messages during the session. If realtime actually delivered events, the gate would be fine.

### Minimal SAFE Fix Path (No Code Yet)

**If H1 (primary):**

1. Add `live_show_messages` to the Supabase realtime publication.
2. Optionally set `REPLICA IDENTITY FULL` if you later need UPDATE/DELETE with `old` records (not required for INSERT).

**SQL migration (recommended):**

```sql
-- Enable Postgres replication for live_show_messages (required for Realtime postgres_changes)
ALTER PUBLICATION supabase_realtime ADD TABLE live_show_messages;
```

**If H4 (mitigation while fixing H1):**

- Option A: Temporarily disable gating (always run fetch) until H1 is fixed and verified.
- Option B: Add a “realtime heartbeat” — if no INSERT events have been received for N seconds while SUBSCRIBED, set `realtimeActiveRef.current = false` so polling resumes.

**Blast radius:** SupabaseLiveChat.jsx only, plus one new migration. No changes to LiveShow.jsx, HostConsole.jsx, Stripe, Auth, PWA, or routing.

---

## Evidence Snippets

| File:Line | Snippet |
|-----------|---------|
| SupabaseLiveChat.jsx:291 | `channel(\`live_show_messages:${showId}\`)` |
| SupabaseLiveChat.jsx:294-298 | `event: "INSERT", schema: "public", table: "live_show_messages", filter: \`show_id=eq.${showId}\`` |
| SupabaseLiveChat.jsx:304 | `await applyIncomingMessages([row])` |
| SupabaseLiveChat.jsx:307 | `realtimeActiveRef.current = status === "SUBSCRIBED"` |
| SupabaseLiveChat.jsx:241 | `if (!realtimeActiveRef.current)` |
| 20241214010000_live_show_messages.sql | No `ALTER PUBLICATION` or `supabase_realtime` |
| liveChat.ts:20-31 | LiveChatMessage interface (snake_case) |

---

## Final Verdict

**Primary:** **H1** — `live_show_messages` is not in the `supabase_realtime` publication.  
**Secondary:** **H4** — Gating disables polling when realtime reports SUBSCRIBED, so there is no fallback when events are never delivered.

**Confidence:** High for H1 (no publication migration; docs state tables must be in the publication). High for H4 (gate logic is correct and intentionally disables fetch when realtime is active).

---

## Proposed Step 3 Execution Plan (Audit-Only)

| Step | Action | Blast radius |
|------|--------|--------------|
| 1 | Create migration: `ALTER PUBLICATION supabase_realtime ADD TABLE live_show_messages` | Database only |
| 2 | Run migration in target environment | Database only |
| 3 | Verify Realtime: open chat in two browsers, send from one, confirm the other receives it live | Chat only |
| 4 | If still broken, consider temporarily disabling gating (comment out `if (!realtimeActiveRef.current)` so fetch always runs) | SupabaseLiveChat.jsx only |
| 5 | If Step 4 fixes it, consider “realtime heartbeat” fallback to re-enable polling when no events arrive for N seconds | SupabaseLiveChat.jsx only |

**No code edits in this audit.** Execution plan is for implementation only.
