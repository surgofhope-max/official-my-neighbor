# LiveShow Callback Invocation Proof

**Purpose:** Prove which callback is invoked as a function without being guaranteed to exist for all entry paths, causing `"TypeError: Me is not a function"` (or equivalent) on DESKTOP Marketplace entry.

---

## Section A — Regression Context

### isShowLive Expansion (Phase 2 Step 1)

**Before:**
```javascript
const useSupabaseChat =
  show?.stream_status === 'starting' ||
  show?.stream_status === 'live';
```

**After:**
```javascript
const isShowLive =
  show?.stream_status === 'starting' ||
  show?.stream_status === 'live' ||
  show?.is_streaming === true ||
  show?.status === 'live';
const useSupabaseChat = isShowLive;
```

### Why This Branch Became Unreachable (Prior) / Reachable (Now)

- The Phase 2 change **introduced a local variable `isShowLive`** (a boolean).
- LiveShow.jsx **already imported** `isShowLive` from `@/api/streamSync` (line 13) — a **function**.
- The new local `const isShowLive = ...` **shadows** the imported function.
- All references to `isShowLive` after line 147 now refer to the **boolean**, not the imported function.

---

## Section B — Function Inventory

### Callback / Function-Typed Variables in DESKTOP + LIVE Scope

| Variable | Source | typeof (after shadow) | Used as function? |
|----------|--------|------------------------|-------------------|
| `isShowLive` | **Import** from streamSync (function) → **shadowed** by local const (boolean) | `"boolean"` | **YES** — lines 526, 683 |
| `onMessageSeller` | Inline arrow passed to SupabaseLiveChat | `"function"` | No (passed only) |
| `handleIvsStateChange` | Local handler | `"function"` | No (passed only) |
| `handleIvsError` | Local handler | `"function"` | No (passed only) |
| `handleViewerCountChange` | Local handler | `"function"` | No (passed only) |
| `navigate` | useNavigate() | `"function"` | Yes (invoked) — always defined |
| `createPageUrl` | Import | `"function"` | Yes (invoked) — always defined |

### Marketplace Entry vs Seller Dashboard Entry

- On Marketplace entry (viewer), the render path reaches line 683 before the desktop branch.
- Line 683: `const isShowActuallyLive = isShowLive(show);` — invokes `isShowLive`.
- At that point `isShowLive` is the **shadowed boolean**, not the imported function.
- `typeof isShowLive === "boolean"` → invoking it throws `"X is not a function"`.
- On Seller Dashboard → Go Live, the same code path runs; the crash would occur there too unless that path is not exercised before the fix.

---

## Section C — Invocation Sites

### LiveShow.jsx — Direct Callback/Function Invocations

| File:Line | Invocation | Guarded? | In DESKTOP+LIVE branch? |
|-----------|------------|----------|--------------------------|
| LiveShow.jsx:526 | `isShowLive(show)` | No — unconditional in handleBuyNow | No — handleBuyNow runs on buy click |
| LiveShow.jsx:687 | `isShowLive(show)` | **No — unconditional during render** | **No — runs before device branch; affects ALL paths** |

### Critical Path

- Line 687 runs on **every render** where `show` has been loaded and we pass the loading/error early returns.
- Execution order: load show → compute `canShowProducts`, `canBuy` → **line 687: `isShowLive(show)`** → then device-gated JSX (mobile vs desktop).
- The crash occurs **before** the desktop branch renders; the desktop branch is simply the visible surface when the crash manifests on desktop.
- The imported `isShowLive` (function) is shadowed by the local `isShowLive` (boolean). Calling the boolean as a function produces the error.

---

## Section D — Failing Candidate

### Exact Callback: `isShowLive` (imported function, shadowed by boolean)

**Evidence:**

1. **Import (LiveShow.jsx:13):** `import { isShowLive } from "@/api/streamSync";` — `isShowLive` is a function.
2. **Shadow (LiveShow.jsx:147–152):** `const isShowLive = show?.stream_status === '...' || ...;` — `isShowLive` becomes a boolean.
3. **Invocation (LiveShow.jsx:526):** `if (!isShowLive(show)) {` — calls `isShowLive` as a function.
4. **Invocation (LiveShow.jsx:687):** `const isShowActuallyLive = isShowLive(show);` — calls `isShowLive` as a function.
5. **Unconditional:** Both invocations are unguarded.
6. **Entry path:** Runs on every render where `show` exists, including Marketplace → LiveShow.

### Correlation with Error Message

- Error: `"TypeError: Me is not a function"` (or similar).
- Minified variable names (e.g. `isShowLive` → `Me`) make this consistent with calling a non-function value as a function.

### Root Cause

Phase 2 Step 1 introduced a local `isShowLive` boolean that shadows the imported `isShowLive` function. The existing calls `isShowLive(show)` were written for the imported function; they now receive the boolean and throw.
