# Chat Name Hydration Proof

**Purpose:** Identify why a message sender sees their own name as "Buyer" until rejoin, while other clients see the correct full name.

---

## Section A — Where "Buyer" Label Originates

### ChatMessage Display Logic (SupabaseLiveChat.jsx:594–596)

```javascript
const displayName = isSeller ? "Host" : (buyerName || "Buyer");
```

- **seller messages:** `sender_role === "seller"` → `"Host"`
- **viewer messages:** `buyerName || "Buyer"` — `buyerName` comes from `buyerNames[msg.sender_id]`
- **fallback:** When `buyerName` is undefined, `displayName` is `"Buyer"`

### buyerName Propagation

- `ChatMessage` receives `buyerName={buyerNames[msg.sender_id]}` (line 474)
- `buyerNames` is state: `useState({})` (line 85)
- It is filled only by `fetchBuyerNames`, which reads `buyer_profiles.full_name` for viewer `sender_id`s

---

## Section B — Why Optimistic Sender Message Lacks Name

### Message Creation Path (handleSend, lines 355–359)

When the sender posts a message:

1. `sendLiveShowMessage` inserts into `live_show_messages` and returns the row via `.select().single()`
2. The returned message has: `id`, `show_id`, `sender_id`, `sender_role`, `message`, `created_at`
3. There is no `full_name` or other display name; `live_show_messages` only stores `sender_id` and `sender_role`
4. The message is appended locally: `setMessages((prev) => [...prev, message])`
5. `knownMessageIdsRef.current.add(message.id)` is called

### Enrichment Gap

- `handleSend` never calls `fetchBuyerNames`
- `handleSend` never updates `buyerNames`
- The new message is rendered with `buyerNames[sender_id]` still undefined
- `ChatMessage` then uses `buyerName || "Buyer"` → `displayName === "Buyer"`

So the sender’s own message is never enriched with a name.

---

## Section C — Why Enrichment Applies to Others but Not Sender

### Where fetchBuyerNames Is Called

- `fetchBuyerNames` is only invoked from `pollMessages` (line 246)
- `pollMessages` fetches messages from `getLiveShowMessages`
- It computes `onlyNew = serverMessages.filter((m) => !knownMessageIdsRef.current.has(m.id))`
- It calls `fetchBuyerNames(onlyNew)`

### Why Sender’s Message Is Excluded

1. Sender sends message → `handleSend` appends it and calls `knownMessageIdsRef.current.add(message.id)`
2. Next poll returns the same message in `serverMessages`
3. For that message, `knownMessageIdsRef.current.has(m.id)` is true
4. It is filtered out of `onlyNew`
5. `fetchBuyerNames(onlyNew)` is never called for the sender’s message

### Why Other Viewers’ Messages Are Enriched

1. Their messages arrive only via polling (not via `handleSend` on this client)
2. Their IDs are not in `knownMessageIdsRef` when they first appear
3. They are included in `onlyNew`
4. `fetchBuyerNames(onlyNew)` runs for them
5. `buyerNames` is updated for their `sender_id`s
6. `ChatMessage` gets `buyerName` and shows the full name

---

## Section D — Exact Missing Reconciliation Step

### What Is Missing

There is no step that enriches the **sender’s own** message with their display name.

The flow is:

1. Sender sends message → message appended and ID added to `knownMessageIdsRef`
2. Poll runs → sender’s message is excluded from `onlyNew`
3. No `fetchBuyerNames` call for the sender
4. `buyerNames[sender_id]` remains undefined
5. Sender’s message renders with `"Buyer"` until component remount (rejoin)

### Why Rejoin Fixes It

On remount:

1. `knownMessageIdsRef` is reset to a new `Set()`
2. Initial `pollMessages` loads all messages, including the sender’s
3. Every message is “new” → all are in `onlyNew`
4. `fetchBuyerNames(onlyNew)` runs for all viewer messages, including the sender’s
5. `buyerNames[sender_id]` is populated
6. Sender’s name displays correctly
