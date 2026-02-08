# Step 2: Polling Blast Radius Audit — SupabaseLiveChat

**Purpose:** Determine all runtime dependencies on polling behavior in SupabaseLiveChat before gating polling behind realtime activity.

**Scope:** SupabaseLiveChat.jsx, imported hooks/helpers, liveChat.ts (only where used by SupabaseLiveChat).

**Audit Type:** Read-only. No code modifications.

---

## Section A: What Polling Currently Does

### A.1 `pollMessages` Call Flow

**Location:** `SupabaseLiveChat.jsx:211-254`

| Step | Action | File:Line |
|------|--------|-----------|
| 1 | Fetch messages via `getLiveShowMessages(showId, { limit: 100 })` | 213-215 |
| 2 | Compare `lastServerId` to `lastMessageIdRef.current` to detect new messages | 217-222 |
| 3 | Filter to `onlyNew` using `knownMessageIdsRef.current.has(m.id)` | 224 |
| 4 | Add new IDs to `knownMessageIdsRef` | 227 |
| 5 | Trim `knownMessageIdsRef` if size > 150 (keep last 100) | 231-235 |
| 6 | `setMessages(prev => [...prev, ...onlyNew])` with 100-msg cap | 236-241 |
| 7 | `fetchBuyerNames(onlyNew)` | 246 |
| 8 | `resetFadeTimer()` | 247 |
| 9 | `checkAvailability()` | 251 |

### A.2 Polling Schedule

| Event | Location | Behavior |
|-------|----------|----------|
| Initial load | 261 | `pollMessages()` called once on mount |
| Interval | 264 | `setInterval(pollMessages, 2500)` |
| Cleanup | 266-269 | `clearInterval` on unmount |

### A.3 Side Effects That Rely on Polling

| Side Effect | Where It Occurs | Triggered by Polling? |
|-------------|-----------------|------------------------|
| **Message insertion** | `setMessages` in pollMessages | Yes — sole path for others' messages |
| **Buyer name hydration** | `fetchBuyerNames(onlyNew)` | Yes — for messages from other viewers |
| **Availability check** | `checkAvailability()` | Yes — only called from pollMessages |
| **Fade timer reset** | `resetFadeTimer()` | Yes — when new messages arrive via poll |
| **knownMessageIdsRef updates** | `knownMessageIdsRef.current.add(m.id)` | Yes — for messages from poll |
| **State normalization** | Trim to 100 messages, trim ref to 100 IDs | Yes — inside pollMessages |
| **Scroll behavior** | `useEffect` on `messages` | Indirect — scroll runs when `messages` changes; polling triggers setMessages |

---

## Section B: What Realtime Already Covers

**Result: Nothing.**

SupabaseLiveChat has **no realtime subscription**. There is no `supabase.channel()`, no `postgres_changes`, and no subscription to `live_show_messages` anywhere in the component or its imports.

**Grep confirmation:** No matches for `realtime`, `subscribe`, `channel`, or `postgres_changes` in `SupabaseLiveChat.jsx`.

**liveChat.ts:** Exports `getLiveShowMessages`, `sendLiveShowMessage`, `isLiveChatAvailable`, and `createLiveChatPoller`. SupabaseLiveChat uses only the first three. None of these establish realtime.

---

## Section C: What Would Be Lost If Polling Is Gated

If polling is gated (e.g. only runs when realtime is idle or disconnected) **without** realtime or compensatory logic:

| Dependency | Impact if Polling Gated |
|------------|--------------------------|
| **Message insertion** | No new messages from other users unless realtime delivers them |
| **Buyer name hydration** | Other viewers' names never resolve — `fetchBuyerNames` only runs from pollMessages (for polled messages) or handleSend (for own message) |
| **Availability check** | `isChatAvailable` and `showEnded` never update — `checkAvailability` is only called from pollMessages |
| **Fade timer reset** | Fade resets only on own send; new messages from others would not reset it |
| **knownMessageIdsRef** | Realtime inserts would need to add IDs; otherwise duplicates possible if polling resumes |
| **Initial load** | If initial poll is gated, no messages load on mount |
| **Scroll to bottom** | Still works if messages arrive via realtime — scroll effect depends on `messages`, not on polling |

### C.1 Buyer Name Hydration Blast

**`fetchBuyerNames` call sites:**

| Location | Trigger | Path |
|----------|---------|------|
| 246 | `pollMessages` | Only when new messages arrive via poll |
| 360 | `handleSend` | Optimistic send — hydrates own message if sender_role === 'viewer' |

**Conclusion:** Messages from other viewers are hydrated **only** via polling. Gating polling without a realtime path would prevent name resolution for all other viewers.

### C.2 Availability Check Blast

**`checkAvailability` call sites:** Only `pollMessages` (line 251).

Gating polling would mean:
- `isChatAvailable` stays at initial `true` (line 74)
- `showEnded` never becomes `true` when the show ends
- Users could keep typing in a chat that is no longer available
- "Show has ended" UI (lines 384-398) would never render

---

## Section D: Message State Integrity

### D.1 How Messages Enter Local State

| Path | Location | Triggers |
|------|----------|----------|
| **a) Polling** | 236-241 | `setMessages` in pollMessages when `onlyNew.length > 0` |
| **b) Realtime** | — | None — no realtime subscription |
| **c) Optimistic send** | 354-355 | `setMessages(prev => [...prev, message])` in handleSend after sendLiveShowMessage succeeds |

### D.2 Required State Mutations

| Mutation | Polling | Realtime | Optimistic |
|----------|---------|----------|------------|
| Append messages from others | ✓ | ✗ | ✗ |
| Append own message | ✓ (on next poll) | ✗ | ✓ |
| knownMessageIdsRef.add | ✓ | ✗ | ✓ |
| fetchBuyerNames for others | ✓ | ✗ | ✗ |
| fetchBuyerNames for self | ✓ | ✗ | ✓ |
| resetFadeTimer | ✓ | ✗ | ✓ |
| checkAvailability | ✓ | ✗ | ✗ |

**Conclusion:** Several required mutations occur **only** via polling. Realtime + optimistic paths do **not** fully cover the message lifecycle today.

---

## Section E: knownMessageIdsRef Reliance

### E.1 All Logic Depending on knownMessageIdsRef

| Location | Purpose |
|----------|---------|
| 224 | Filter `onlyNew` — `!knownMessageIdsRef.current.has(m.id)` |
| 227 | Add new IDs: `onlyNew.forEach((m) => knownMessageIdsRef.current.add(m.id))` |
| 231-235 | Trim ref when size > 150 |
| 354 | handleSend: `knownMessageIdsRef.current.add(message.id)` |

### E.2 Realtime and knownMessageIdsRef

- Realtime inserts do **not** add IDs today — there is no realtime path.
- If realtime is added, it must add each new message ID to `knownMessageIdsRef` to avoid duplicates when polling resumes or when merging.
- Polling is not required to reconcile IDs — it is the source of IDs. Realtime would need to be the source for its own inserts.

### E.3 Cleanup Logic

- Ref trim (231-235) runs only inside pollMessages when new messages are processed.
- No cleanup logic depends on polling execution alone; trimming is a side effect of processing new messages.

---

## Section F: UI / Render Assumptions

### F.1 Effects That Assume Polling

| Effect | Lines | Assumption |
|--------|-------|------------|
| Poll start/stop | 256-271 | `pollMessages` runs on mount and every 2.5s |
| Auto-scroll | 274-278 | Depends on `messages` — runs whenever messages change; does not assume polling |
| Fade cleanup | 296-302 | Clears `fadeTimeoutRef` on unmount; does not assume polling |

### F.2 Initial Load

- Line 261: `pollMessages()` is called once on mount. This is the only initial load. If polling is gated and realtime is not yet connected, **no messages load** until either polling runs or realtime delivers them.

### F.3 Effects When Messages Arrive Only via Realtime

- Auto-scroll: ✓ Would run — it depends on `messages`, not on polling.
- Fade: ✗ Would not reset — `resetFadeTimer` is only called from pollMessages and handleSend. Realtime would need to call it.

---

## Section G: Failure Modes

### G.1 If Realtime Disconnects

- **Current state:** No realtime exists; N/A.
- **With gating:** Gating logic would need to resume polling when realtime disconnects. If it does not, message starvation is permanent until reconnect.

### G.2 If Realtime Never Connects

- **Current state:** N/A.
- **With gating:** If polling is gated until realtime is "active" and realtime never connects, polling never runs. Result: no messages, no availability checks, no name hydration for others.

### G.3 Polling Resume Requirement

For gating to be safe, the implementation must:
1. Resume polling when realtime disconnects.
2. Ensure no permanent message starvation.
3. Run an initial fetch (or equivalent) if realtime is not yet connected.

---

## Section H: Confirmed Safe / Unsafe Areas

### Safe to Gate (if realtime covers equivalent behavior)

| Area | Condition |
|------|-----------|
| Message insertion | Realtime must deliver new messages and update state |
| knownMessageIdsRef | Realtime handler must add new message IDs |
| Scroll behavior | No change needed — already message-driven |
| Fade timer | Realtime handler must call `resetFadeTimer` on new messages |

### Unsafe to Gate Without Compensating Logic

| Area | Risk |
|------|------|
| **Availability check** | `checkAvailability` is only called from pollMessages. Realtime does not cover show-end detection. Need: separate polling for availability, or show-end realtime, or parent-driven updates. |
| **Buyer name hydration** | `fetchBuyerNames` for others is only called from pollMessages. Realtime must trigger it for each new message (or batch). |
| **Initial load** | If polling is fully gated before realtime connects, no initial messages. Need: ungated initial fetch, or realtime to deliver backlog. |

---

## Section I: Final Verdict

### NOT SAFE to gate polling

**Reasons:**

1. **No realtime exists.** SupabaseLiveChat is fully polling-based. Gating polling with nothing to replace it would remove the only path for receiving messages from others.

2. **Availability depends only on polling.** `checkAvailability` is invoked solely from `pollMessages`. Gating polling would prevent detection of show end and correct `isChatAvailable` / `showEnded` state.

3. **Buyer name hydration for others is polling-only.** `fetchBuyerNames` for other viewers is only called from `pollMessages`. Gating would block name resolution for all other viewers.

4. **Realtime must cover all side effects before gating.** Before polling can be gated, the following must be in place:
   - Realtime subscription for `live_show_messages` INSERT events
   - Realtime handler that: appends messages, updates `knownMessageIdsRef`, calls `fetchBuyerNames`, calls `resetFadeTimer`
   - Separate mechanism for availability (e.g. show status realtime, or ungated availability polling)
   - Fallback: resume polling when realtime disconnects
   - Initial load: either ungated initial fetch or realtime backlog delivery

---

## Evidence Table

| File:Line | Finding |
|-----------|---------|
| SupabaseLiveChat.jsx:211-254 | pollMessages: getLiveShowMessages, knownMessageIdsRef, setMessages, fetchBuyerNames, resetFadeTimer, checkAvailability |
| SupabaseLiveChat.jsx:246 | fetchBuyerNames(onlyNew) — only from polling |
| SupabaseLiveChat.jsx:251 | checkAvailability() — only from polling |
| SupabaseLiveChat.jsx:261 | Initial pollMessages() on mount |
| SupabaseLiveChat.jsx:264 | setInterval(pollMessages, 2500) |
| SupabaseLiveChat.jsx:354-360 | Optimistic send: setMessages, knownMessageIdsRef.add, fetchBuyerNames([message]) |
| SupabaseLiveChat.jsx:108-137 | fetchBuyerNames implementation |
| SupabaseLiveChat.jsx:196-206 | checkAvailability implementation |
| liveChat.ts:66-124 | getLiveShowMessages — used by pollMessages |
| liveChat.ts:219-241 | isLiveChatAvailable — used by checkAvailability |
| (none) | No realtime subscription in SupabaseLiveChat or liveChat for live_show_messages |
