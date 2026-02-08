# Phase 1 — Live Chat Unification (Structural, No Code)

---

## SECTION 1 — Current State (Evidence-Based)

### Chat Components

| Component | File | Mount Locations | Device | Show State | Data Source | Fetch Mechanism |
|-----------|------|-----------------|--------|------------|-------------|-----------------|
| **SupabaseLiveChat** | `src/components/chat/SupabaseLiveChat.jsx` | LiveShow.jsx:986-1004 (mobile), LiveShow.jsx:1481-1490 (desktop), HostConsole.jsx:1234-1240 (mobile), HostConsole.jsx:1727-1732 (desktop) | Mobile + Desktop | live only (stream_status 'starting'/'live') | `live_show_messages` | setInterval 2500ms + getLiveShowMessages |
| **LiveChat** | `src/components/chat/LiveChat.jsx` | LiveShow.jsx:1492-1496 (desktop), HostConsole.jsx:1735-1739 (desktop) | Desktop only | non-live (when !useSupabaseChat) | `live_show_messages` via getLiveShowMessages | React Query queryKey ['chat-messages', showId], staleTime 3000, no refetchInterval |
| **LiveChatOverlay** | `src/components/chat/LiveChatOverlay.jsx` | LiveShow.jsx:999-1004 (mobile full), LiveShow.jsx:1249-1255 (mobile inputOnly), HostConsole.jsx:1242-1245 (mobile), LiveShowCardWrapper.jsx:73 | Mobile only | non-live (when !useSupabaseChat) | `base44.entities.ChatMessage` (lines 78, 84, 93) | React Query queryKey ['chat-messages', showId], refetchInterval 2000 |

### Explicit Statements

- **There is more than one chat system**: SupabaseLiveChat (live), LiveChat (desktop non-live), LiveChatOverlay (mobile non-live).
- **There is more than one data source**: `live_show_messages` (Supabase) vs `base44.entities.ChatMessage` (Base44).
- **There is more than one fetch strategy**: Custom setInterval polling (SupabaseLiveChat), React Query with refetchInterval (LiveChatOverlay), React Query without interval (LiveChat).

### Additional Evidence

- **LiveChatOverlay duplication**: On LiveShow mobile when !useSupabaseChat, TWO LiveChatOverlay instances mount (full overlay + inputOnly bottom bar) — see `09_mount_trace_live_show.txt`.
- **LiveChat and LiveChatOverlay never mount together**: Different device branches (desktop vs mobile).
- **createLiveChatPoller**: Defined in `src/api/liveChat.ts:262` but NOT imported by any component — dead code.

---

## SECTION 2 — Canonical Target Architecture

### Declarations

1. **SupabaseLiveChat** is the ONLY future chat engine. All LiveShow and HostConsole chat mounts will use it.
2. **live_show_messages** is the ONLY data source. Base44 ChatMessage table will be retired from chat paths.
3. **Base44 chat runtime** is FORBIDDEN. No `base44.entities.ChatMessage.filter/create/update` in production chat paths.
4. **One lifecycle gate** for "show is live" — a single canonical truth.

### Lifecycle Gate Mismatch (Evidence)

| Location | Condition | Source |
|----------|-----------|--------|
| UI (LiveShow.jsx:134-136, HostConsole.jsx:289-291) | `show?.stream_status === 'starting' \|\| show?.stream_status === 'live'` | Client |
| RLS `is_show_live` (supabase/migrations/20241214010000_live_show_messages.sql:37-50) | `(stream_status = 'live' OR stream_status = 'starting') OR is_streaming = true OR status = 'live'` | Database |

**Mismatch**: RLS allows `is_streaming = true` or `status = 'live'` even when `stream_status` is different. UI only checks `stream_status`. Edge case: RLS may allow read/write while UI shows legacy chat.

**Requirement**: Phase 2 must define a single canonical truth (recommend UI and RLS both use `stream_status` only, or document the intended behavior).

---

## SECTION 3 — Phase 1 Scope (What This Phase DOES)

- Unification planning only
- Component retirement mapping (LiveChat, LiveChatOverlay → retired)
- Architecture definition (canonical engine, data source, lifecycle gate)
- No performance tuning yet
- No realtime wiring yet
- No polling changes yet
- No code edits

---

## SECTION 4 — Phase 2 Preview (What Comes Next, Not Done Here)

- Replace legacy mounts with SupabaseLiveChat (LiveShow, HostConsole)
- Add Realtime subscription for `live_show_messages` INSERT
- Stabilize polling fallback (fix `fetchBuyerNames` [SupabaseLiveChat.jsx:108, deps: buyerNames:138] → `pollMessages` [254] → useEffect [271] dependency churn; buyerNames updates restart the interval)
- Fix scroll behavior (only auto-scroll when user is at bottom)
- Remove Base44 ChatMessage usage from LiveChatOverlay
- Remove or retire LiveChat.jsx and LiveChatOverlay.jsx
- Delete dead code: createLiveChatPoller (liveChat.ts:262-316)

---

## SECTION 5 — Blast Radius Map

### src/pages/LiveShow.jsx

| Aspect | Detail |
|--------|--------|
| **Why in scope** | Primary viewer page; mounts SupabaseLiveChat, LiveChat, LiveChatOverlay conditionally |
| **What will eventually change** | Remove LiveChat and LiveChatOverlay branches; always mount SupabaseLiveChat when chat is available; remove duplicate LiveChatOverlay (inputOnly) on mobile |
| **Must verify** | Mobile and desktop both show chat; no dual mounts; show-ended state still shows "Message Seller" CTA |

### src/pages/HostConsole.jsx

| Aspect | Detail |
|--------|--------|
| **Why in scope** | Primary host page; mounts SupabaseLiveChat, LiveChat, LiveChatOverlay conditionally |
| **What will eventually change** | Remove LiveChat and LiveChatOverlay branches; always mount SupabaseLiveChat when chat is available |
| **Must verify** | Mobile and desktop both show chat; host can moderate (ban viewer); show-ended state handled |

### src/components/chat/LiveChat.jsx

| Aspect | Detail |
|--------|--------|
| **Why in scope** | Legacy desktop chat for non-live shows; uses live_show_messages |
| **What will eventually change** | Retired; all mounts replaced by SupabaseLiveChat |
| **Must verify** | No remaining imports; file can be deleted or archived |

### src/components/chat/LiveChatOverlay.jsx

| Aspect | Detail |
|--------|--------|
| **Why in scope** | Legacy mobile chat; uses Base44 ChatMessage; mounts in LiveShow (2x when !useSupabaseChat) and HostConsole |
| **What will eventually change** | Retired; all mounts replaced by SupabaseLiveChat |
| **Must verify** | No remaining imports; Base44 ChatMessage calls removed; file can be deleted or archived |

### src/components/chat/SupabaseLiveChat.jsx

| Aspect | Detail |
|--------|--------|
| **Why in scope** | Canonical chat engine; will be the only chat component |
| **What will eventually change** | Fix pollMessages dependency churn (fetchBuyerNames/buyerNames); add Realtime subscription; improve scroll behavior |
| **Must verify** | No freeze under burst; no duplicate messages; cleanup on unmount |

### src/components/streaming/LiveShowCardWrapper.jsx

| Aspect | Detail |
|--------|--------|
| **Why in scope** | Uses LiveChatOverlay (line 73); not imported elsewhere (likely dead) |
| **What will eventually change** | Replace LiveChatOverlay with SupabaseLiveChat if component is ever used; or remove if confirmed dead |
| **Must verify** | Whether LiveShowCardWrapper is reachable in production |

### src/components/host/HostBottomControls.jsx

| Aspect | Detail |
|--------|--------|
| **Why in scope** | Imports LiveChatOverlay, SupabaseLiveChat but does NOT render chat (comment: "chat is handled by permanent overlay") |
| **What will eventually change** | Remove unused chat imports |
| **Must verify** | No regression in host bottom controls |

---

## SECTION 6 — Verification Checklist (Lock Criteria)

- [ ] Viewer sees all messages under burst (50+ messages in 10s)
- [ ] Host sees all messages under burst
- [ ] Mobile + desktop consistent (same messages, same order)
- [ ] No Base44 calls reachable in chat path
- [ ] No duplicate chat mounts (single SupabaseLiveChat per device branch)
- [ ] No polling churn (interval not constantly cleared/restarted)
- [ ] No UI freeze or glitch under burst
- [ ] Verified visually by user (manual QA)
- [ ] Show-ended state shows "Message Seller" CTA for viewers
- [ ] Ban enforcement works (banned viewer cannot send)

---

## SECTION 7 — Rollback & Safety Rules

- No deletions without user confirmation
- Feature-flag or branch-based rollout if needed
- Ability to revert to current behavior until verified
- No milestone lock until user confirmation
- Phase 2 edits should be done in small, reviewable increments
- Each increment should be testable in isolation

---

## SECTION 8 — Explicit Non-Goals

- Not fixing DMs (Messages.jsx, conversations, persistent messaging)
- Not touching Messages.jsx
- Not changing moderation logic (ViewerBanDialog, viewer_bans)
- Not changing RLS policies in Phase 1
- Not changing analytics or logging
- Not fixing LiveShowCardWrapper reachability (out of scope unless user requests)

---

## SECTION 9 — Final Statement

- **Phase 1 produces STRUCTURE, not fixes.** This document is the canonical plan.
- **Phase 2 performs edits.** No edits proceed without user approval.
- **No code changes in Phase 1.** All findings are audit-only.
