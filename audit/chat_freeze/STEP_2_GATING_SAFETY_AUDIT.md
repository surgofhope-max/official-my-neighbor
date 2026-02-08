# Step 2: Gating Safety Audit — Message Polling

**Purpose:** Confirm that gating MESSAGE polling when realtime is active will NOT break any other live chat or app functionality.

**Scope:** SupabaseLiveChat.jsx, liveChat.ts (functions used by SupabaseLiveChat), LiveShow.jsx, HostConsole.jsx.

**Audit Type:** Read-only. No code modifications.

---

## A) Message Path Isolation

### A.1 pollMessages as Sole Server Fetch + Merge for Others

| Question | Answer | Evidence |
|----------|--------|----------|
| Is pollMessages the ONLY place that fetches messages from the server? | **YES** | `getLiveShowMessages` is called only at SupabaseLiveChat.jsx:237 |
| Is pollMessages the ONLY place that merges OTHER USERS' messages (non-optimistic)? | **YES** | Realtime and send do not fetch; they receive data via INSERT payload or API return. pollMessages is the only path that fetches from server and merges for others |

**Server fetch:** `getLiveShowMessages(showId, { limit: 100 })` — SupabaseLiveChat.jsx:237

**Non-optimistic merge:** pollMessages (254) and realtime handler (300) both call `applyIncomingMessages`. pollMessages gets data from fetch; realtime gets data from postgres_changes payload. Send path (396) is optimistic (own message).

### A.2 applyIncomingMessages Call Sites After Step 1

| Path | File:Line | Trigger |
|------|-----------|---------|
| **Polling** | SupabaseLiveChat.jsx:254 | `await applyIncomingMessages(onlyNew)` — when poll finds new messages |
| **Realtime** | SupabaseLiveChat.jsx:300 | `await applyIncomingMessages([row])` — on postgres_changes INSERT |
| **Send success** | SupabaseLiveChat.jsx:396 | `await applyIncomingMessages([message])` — after sendLiveShowMessage returns |

### A.3 Complete applyIncomingMessages Call List

| # | File:Line | Caller |
|---|-----------|--------|
| 1 | SupabaseLiveChat.jsx:254 | pollMessages (onlyNew from server fetch) |
| 2 | SupabaseLiveChat.jsx:300 | Realtime INSERT handler (payload.new) |
| 3 | SupabaseLiveChat.jsx:396 | handleSend success path (returned message) |

---

## B) Availability Dependency Check

### B.1 checkAvailability Call Sites

| File:Line | Caller |
|-----------|--------|
| SupabaseLiveChat.jsx:260 | pollMessages only |

**Conclusion:** checkAvailability is ONLY called from pollMessages.

### B.2 checkAvailability Independence

| Question | Answer | Evidence |
|----------|--------|----------|
| Does checkAvailability depend on message results? | **NO** | It calls `isLiveChatAvailable(showId)` which queries `shows.stream_status` (liveChat.ts:225-228) |
| Does it require pollMessages to merge messages first? | **NO** | It only needs showId; no message data is used |

**isLiveChatAvailable implementation:** liveChat.ts:219-241 — queries `shows` table for `stream_status`. No use of `live_show_messages`.

### B.3 UI/State That Depends on checkAvailability

| State | Set By | UI Impact |
|-------|--------|-----------|
| `isChatAvailable` | checkAvailability → setIsChatAvailable(available) | Line 74 init true; 369, 403, 416, 423: input disabled, placeholder "Chat ended" |
| `showEnded` | checkAvailability when !available → setShowEnded(true) | Line 384: early return "Show has ended" + "Message Seller" CTA |

---

## C) Buyer Name Hydration Safety

### C.1 Hydration Flow

| Path | Calls fetchBuyerNames? | Via |
|------|-------------------------|-----|
| Polling | YES | applyIncomingMessages(onlyNew) at 254 → fetchBuyerNames(acceptedViewers) at 229 |
| Realtime | YES | applyIncomingMessages([row]) at 300 → same |
| Send | YES | applyIncomingMessages([message]) at 396 → same |

**Conclusion:** All buyer name hydration flows through applyIncomingMessages. fetchBuyerNames is only invoked inside applyIncomingMessages (line 229).

### C.2 Polling-Specific Hydration

**Question:** Does any other code path depend on polling specifically to hydrate names?

**Answer:** NO. Realtime and send both call applyIncomingMessages, which triggers fetchBuyerNames. No polling-only path for hydration.

---

## D) Timer / UI Side Effects

### D.1 Side Effects Triggered by pollMessages

| Side Effect | Location | Triggered By |
|-------------|----------|--------------|
| Message merge (setMessages) | 254 → applyIncomingMessages | pollMessages |
| knownMessageIdsRef updates | 254 → applyIncomingMessages | pollMessages |
| resetFadeTimer | 254 → applyIncomingMessages | pollMessages |
| fetchBuyerNames | 254 → applyIncomingMessages | pollMessages |
| checkAvailability | 260 | pollMessages directly |

### D.2 Side Effects in applyIncomingMessages vs pollMessages

| Side Effect | applyIncomingMessages | pollMessages |
|-------------|------------------------|--------------|
| setMessages | YES (221-224) | Indirect via applyIncomingMessages |
| knownMessageIdsRef | YES (215-219) | Indirect via applyIncomingMessages |
| resetFadeTimer | YES (226) | Indirect via applyIncomingMessages |
| fetchBuyerNames | YES (227-229) | Indirect via applyIncomingMessages |
| checkAvailability | NO | YES (260) – only in pollMessages |

---

## E) Gating Blast Radius

### E.1 If Polling Is Gated for MESSAGE MERGE ONLY (Early Return Before Fetch)

**Question:** Will realtime + send path still fully update messages?

**Answer: YES**

**Explanation:** Realtime receives INSERT events and calls applyIncomingMessages([row]). Send success calls applyIncomingMessages([message]). Both paths bypass polling. Gating the fetch in pollMessages does not affect them.

**Caveat:** Initial load would need handling. Today, pollMessages() runs once on mount (268) and delivers initial messages. If we gate before fetch, the first run would not fetch. Options: (a) run one ungated initial fetch before enabling the gate, or (b) rely on realtime to deliver backlog (Supabase realtime does not replay past inserts by default). An ungated initial fetch is the safe approach.

### E.2 If Polling Still Runs Availability Logic

**Question:** Will show end detection still function?

**Answer: YES**

**Explanation:** checkAvailability is called at the end of pollMessages (260). If we gate only the message fetch/merge (early return before getLiveShowMessages) but still run the rest of pollMessages, we would skip the fetch block and still reach `await checkAvailability()`. So availability can remain ungated: keep the interval, skip the fetch when realtime is active, and always run checkAvailability.

### E.3 Will Any of the Following Break?

| System | Break? | Reason |
|--------|--------|--------|
| **Stripe** | NO | No dependency on SupabaseLiveChat or chat polling |
| **Auth** | NO | SupabaseLiveChat uses user prop; no polling dependency |
| **Routing** | NO | No routing logic in SupabaseLiveChat |
| **PWA** | NO | No PWA logic in chat |
| **HostConsole rendering** | NO | Only mounts SupabaseLiveChat with props; no polling dependency |
| **LiveShow rendering** | NO | Only mounts SupabaseLiveChat with props; no polling dependency |

---

## F) Dependency Table

| Responsibility | Polling | Realtime | Send | Notes |
|----------------|---------|----------|------|-------|
| Fetch messages from server | YES | NO | NO | getLiveShowMessages only in pollMessages |
| Merge messages into state | YES (via applyIncomingMessages) | YES (via applyIncomingMessages) | YES (via applyIncomingMessages) | All use applyIncomingMessages |
| knownMessageIdsRef | Indirect | Indirect | Indirect | All via applyIncomingMessages |
| resetFadeTimer | Indirect | Indirect | Indirect | All via applyIncomingMessages |
| fetchBuyerNames | Indirect | Indirect | Indirect | All via applyIncomingMessages |
| checkAvailability | YES (direct) | NO | NO | Only in pollMessages |

---

## G) Side-Effect Ownership Table

| Side Effect | Owner | Can Be Gated? |
|-------------|-------|---------------|
| getLiveShowMessages | pollMessages | YES — when realtime active |
| applyIncomingMessages (message merge) | pollMessages, realtime, send | N/A — callers remain |
| checkAvailability | pollMessages | NO — must keep running |
| resetFadeTimer | applyIncomingMessages | N/A — triggered by all message paths |
| fetchBuyerNames | applyIncomingMessages | N/A — triggered by all message paths |

---

## H) Availability Can Remain Ungated

**Confirmation:** checkAvailability can remain ungated.

**Implementation approach:** When gating message polling:

1. Keep the polling interval (setInterval) running.
2. At the start of pollMessages, if realtime is active, skip `getLiveShowMessages` and the applyIncomingMessages block.
3. Still run `await checkAvailability()` at the end of pollMessages.

Availability checks will continue every 2500ms. Message fetching can be skipped when realtime is active.

---

## I) Verdict

### SAFE to gate MESSAGE polling only

**Conditions:**

1. **Availability must stay ungated.** checkAvailability must still run on the same interval (or equivalent). Do not gate or remove the checkAvailability call.
2. **Initial load.** Ensure an ungated initial fetch runs before the gate applies (e.g. first pollMessages call always fetches, or a separate one-time fetch on mount).
3. **Gate placement.** Gate only the message fetch and merge. Skip `getLiveShowMessages` and the `applyIncomingMessages(onlyNew)` block when realtime is active. Always run `await checkAvailability()`.

**Why it is safe:**

- Realtime and send both update messages via applyIncomingMessages.
- Buyer name hydration is fully covered by applyIncomingMessages (used by realtime and send).
- resetFadeTimer is triggered by applyIncomingMessages.
- checkAvailability is independent of messages and can continue to run from pollMessages.
- No dependency on SupabaseLiveChat or chat polling in Stripe, Auth, Routing, PWA, HostConsole, or LiveShow.

**Risk to mitigate:** Initial load when realtime connects after mount. Use an ungated initial fetch so messages appear before the gate takes effect.
