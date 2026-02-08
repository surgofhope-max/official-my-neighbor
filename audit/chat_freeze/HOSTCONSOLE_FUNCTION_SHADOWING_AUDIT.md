# HostConsole Function Shadowing Audit

**Purpose:** Identify functions invoked in HostConsole that are no longer functions at runtime, causing `TypeError: X is not a function`.

**Scope:** HostConsole.jsx, imported hooks/helpers/utils, shared helpers used by LiveShow (isShowLive, isStreaming, canHost, sellerGate).

**Audit Date:** Read-only regression audit. No code modifications.

---

## Executive Summary

One **critical shadowing bug** was identified:

| Identifier | Import | Shadowed By | Call Site | Result |
|------------|--------|-------------|-----------|--------|
| `isShowLive` | `@/api/streamSync` (function) | Local boolean expression (line 289) | Line 1680: `isShowLive(show)` | **TypeError: isShowLive is not a function** |

This call site is inside the **desktop-only** layout. Mobile layout does not invoke `isShowLive` as a function and therefore does not hit this path.

---

## 1. Imports That Are Functions

From `src/pages/HostConsole.jsx`:

| Line | Import | Type | Used As Function? |
|------|--------|------|-------------------|
| 5-6 | `isSuperAdmin`, `requireSellerAsync`, `isAdmin` | Functions | Yes (called) |
| 7 | `checkAccountActiveAsync` | Function | Yes (called) |
| 8 | **`isShowLive`** | **Function** | **Yes at 1680 — but shadowed** |
| 9 | `createProduct`, `updateProduct` | Functions | Yes (called) |
| 10 | `getShowProductsByShowId`, `createShowProduct`, `updateShowProductByIds`, `clearFeaturedForShow`, `deleteShowProductByIds` | Functions | Yes (called) |
| 50 | `createPageUrl` | Function | Yes (called) |

---

## 2. Shadowed Identifier: `isShowLive`

### 2.1 Where It Is Imported

```
8:8:src/pages/HostConsole.jsx
import { isShowLive } from "@/api/streamSync";
```

Source: `src/api/streamSync.ts:116` — `isShowLive` is a function:

```typescript
export function isShowLive(show: { stream_status?: string | null } | null | undefined): boolean {
  return show?.stream_status === "live";
}
```

### 2.2 Where It Is Redefined (Shadowed)

```
288:294:src/pages/HostConsole.jsx
  const isShowLive =
    show?.stream_status === 'starting' ||
    show?.stream_status === 'live' ||
    show?.is_streaming === true ||
    show?.status === 'live';
  const useSupabaseChat = isShowLive;
```

**Effect:** After this declaration, `isShowLive` refers to a **boolean** (true/false), not the imported function. The imported function is shadowed and no longer accessible in the rest of the component.

### 2.3 Where It Is Invoked as a Function

```
1678:1684:src/pages/HostConsole.jsx
                <div className="flex items-center gap-2">
                  {isShowLive(show) && (
                    <Badge className="bg-red-500 text-white border-0 animate-pulse">
                      <Radio className="w-4 h-4 mr-1" />
                      LIVE
                    </Badge>
                  )}
```

**Runtime behavior:** `isShowLive` is a boolean. Calling `true(show)` or `false(show)` throws:

```
TypeError: isShowLive is not a function
```

### 2.4 Why Mobile Does Not Hit This Path

| Section | Condition | Contains `isShowLive(show)`? |
|---------|-----------|-----------------------------|
| Mobile layout | `{isMobileDevice && (` at 1175 | **No** |
| Desktop layout | `{isDesktopDevice && (` at 1368 | **Yes** at 1680 |

The mobile branch (lines 1175–1365) uses `useSupabaseChat` (the boolean) for chat selection and does not render the desktop header overlay. The call `isShowLive(show)` appears only in the desktop layout, inside the header overlay (lines 1678–1684).

### 2.5 Why Desktop/Tablet Does Hit This Path

- Device classification: `useDeviceClass()` returns `isDesktopDevice: true` for desktop/tablet.
- The desktop branch at 1368 renders the 3-column layout.
- The header overlay (lines 1664–1693) includes `{isShowLive(show) && (`.
- When that expression runs, `isShowLive` is the boolean, so `isShowLive(show)` throws.

---

## 3. LiveShow Correct Pattern (Reference)

`LiveShow.jsx` avoids shadowing by using a different name for the derived boolean:

```
13:13:src/pages/LiveShow.jsx
import { isShowLive } from "@/api/streamSync";
```

```
134:139:src/pages/LiveShow.jsx
  const isShowLiveUI =
    show?.stream_status === 'starting' ||
    show?.stream_status === 'live' ||
    show?.is_streaming === true ||
    show?.status === 'live';
  const useSupabaseChat = isShowLiveUI;
```

`isShowLive` remains the imported function; `isShowLiveUI` holds the derived boolean. Calls like `isShowLive(show)` (e.g. at 513, 669) work correctly.

---

## 4. Other Identifiers Checked (No Shadowing)

| Identifier | Import Source | Local Redefinition? | Invoked? |
|------------|---------------|---------------------|----------|
| `createPageUrl` | `@/utils` | No | Yes |
| `isSuperAdmin` | `@/lib/auth/routeGuards` | No | Yes |
| `isAdmin` | `@/lib/auth/routeGuards` | No | Yes |
| `requireSellerAsync` | `@/lib/auth/routeGuards` | No | Yes |
| `checkAccountActiveAsync` | `@/lib/auth/accountGuards` | No | Yes |
| `createProduct` | `@/api/products` | No | Yes |
| `updateProduct` | `@/api/products` | No | Yes |
| `getShowProductsByShowId` | `@/api/showProducts` | No | Yes (inside queryFn) |
| `createShowProduct` | `@/api/showProducts` | No | Yes |
| `updateShowProductByIds` | `@/api/showProducts` | No | Yes |
| `clearFeaturedForShow` | `@/api/showProducts` | No | Yes |
| `deleteShowProductByIds` | `@/api/showProducts` | No | Yes |
| `getShowByIdWithStats` | `@/api/shows` | No | Yes (inside queryFn) |

No `useMemo` or `useCallback` in HostConsole redefines an imported function name.

---

## 5. Shared Helpers (isStreaming, canHost, sellerGate)

| Helper | Defined In | Used in HostConsole? |
|--------|------------|----------------------|
| `isShowLive` | `@/api/streamSync` | Yes — shadowed, then invoked |
| `isStreaming` | `WebRTCBroadcaster.jsx` (local state) | No — not imported by HostConsole |
| `canHost` | Not found in scope | No |
| `sellerGate` | Logic in loadUserAndSeller (lines 159–244) | Not a shared function; inline logic |

---

## 6. Evidence Table

| File:Line | Finding | Impact |
|-----------|---------|--------|
| HostConsole.jsx:8 | `isShowLive` imported as function from streamSync | — |
| HostConsole.jsx:289-293 | `isShowLive` redefined as boolean expression | Shadows import |
| HostConsole.jsx:294 | `useSupabaseChat = isShowLive` (boolean) | — |
| HostConsole.jsx:1680 | `isShowLive(show)` invoked | **TypeError** — `isShowLive` is boolean |
| HostConsole.jsx:1368 | Desktop branch starts | Contains call site |
| HostConsole.jsx:1175 | Mobile branch starts | Does not contain call site |
| streamSync.ts:116 | `isShowLive` function definition | Authoritative source |
| LiveShow.jsx:134-139 | Uses `isShowLiveUI` for derived boolean | Correct pattern |

---

## 7. Conclusion

The only function shadowing issue found is `isShowLive` in HostConsole. The imported function is shadowed by a local boolean at lines 289–293, and later invoked as a function at line 1680 inside the desktop layout, causing `TypeError: isShowLive is not a function`.

Mobile does not hit this because the call site exists only in the desktop branch. Desktop and tablet users will see the error when the header overlay renders.
