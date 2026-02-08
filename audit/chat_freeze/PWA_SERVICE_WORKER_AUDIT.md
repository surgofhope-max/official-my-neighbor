# PWA + Service Worker Audit Report

**Purpose:** Determine why the PWA stopped installing/rendering correctly after domain change from vercel.app to myneighbor.live.

**Scope:** Audit only. No fixes, no refactors, no speculative edits.

---

## Section A — Findings

### 1. Manifest Audit (public/manifest.json)

| Field | Value | Compatible with myneighbor.live? |
|-------|-------|----------------------------------|
| name | "MyNeighbor.Live" | Yes |
| short_name | "MyNeighbor" | Yes |
| start_url | "/marketplace" | Yes (relative; resolves to https://myneighbor.live/marketplace) |
| scope | "/" | Yes (relative; resolves to https://myneighbor.live/) |
| display | "standalone" | Yes |
| orientation | "portrait" | Yes |
| background_color | "#000000" | N/A |
| theme_color | "#000000" | N/A |

**Icons:**
| src | sizes | type | purpose |
|-----|-------|------|---------|
| /icon-192.png | 192x192 | image/png | any maskable |
| /icon-512.png | 512x512 | image/png | any maskable |

**Absolute URL check:** No vercel.app or www.myneighbor.live in manifest. All paths are relative.

**Verdict:** Manifest uses relative URLs only. Compatible with any origin including https://myneighbor.live.

---

### 2. Service Worker Audit

**Registration (src/main.jsx:22–31):**
- Path: `/sw.js`
- Scope: Implicit (default: directory of sw.js = `/` → full origin scope)
- Condition: `import.meta.env.PROD && "serviceWorker" in navigator`
- Registers on `window.load`

**Service worker logic (public/sw.js):**
- install: `self.skipWaiting()`
- activate: `event.waitUntil(self.clients.claim())`
- fetch: `event.respondWith(fetch(event.request))` — pass-through, no caching

**Cache names:** None. No caches created.

**Hardcoded origins:** None in sw.js or registration.

**Origin behavior:**
- Service workers are origin-bound. When the page is served from `https://myneighbor.live`, the SW registers at `https://myneighbor.live/sw.js` with scope `https://myneighbor.live/`.
- A service worker registered on `https://*.vercel.app` cannot control pages on `https://myneighbor.live` (different origin).

---

### 3. Installability Audit

**PWA install criteria:**

| Criterion | Status |
|-----------|--------|
| Valid manifest | Yes (relative URLs; no syntax errors) |
| Manifest linked | Yes (index.html: `<link rel="manifest" href="/manifest.json" />`) |
| Service worker registered | Yes (PROD only, /sw.js) |
| Fetch handler present | Yes (pass-through in sw.js) |
| HTTPS / secure context | Depends on deployment |
| Engagement heuristics | Depends on user behavior |

**Favicon (index.html:5):**
- `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
- **favicon.svg does not exist in public/.** Public assets: apple-touch-icon.png, icon-192.png, icon-512.png, manifest.json, sw.js.
- Favicon returns 404. Browsers may show a generic placeholder when the favicon fails.

**Chrome "shortcut" vs "install app":**
Chrome may offer a shortcut instead of full install when:
- Manifest fails to load (404, CORS, invalid JSON)
- Required icons (192px, 512px) fail to load
- Service worker fails to register
- Site does not meet engagement heuristics (e.g. not visited enough, not used in standalone-like context)

---

### 4. Orientation & Display Audit

**Where orientation is defined:**

| Location | Definition |
|----------|------------|
| manifest.json | `"orientation": "portrait"` |
| useMobilePortraitLock.js | Screen Orientation API: `screen.orientation.lock("portrait")` |
| CSS | None found for orientation lock |

**useMobilePortraitLock behavior (src/hooks/useMobilePortraitLock.js):**
- Calls `screen.orientation.lock("portrait")` when `isMobileDevice` is true.
- Fails silently if not supported: *"Fails silently if orientation lock is not supported (most browsers)"*.
- Screen Orientation API typically requires fullscreen or PWA standalone; support is inconsistent across browsers.

**Why rotation may still occur:**
- Manifest `orientation` is advisory; many browsers do not enforce it.
- Screen Orientation API often fails (permission, support) and the hook swallows errors.
- No fallback (e.g. CSS `transform`, viewport lock) when the API fails.

---

### 5. Icon / Branding Audit

**Why a generic/Google-like icon might appear:**

| Cause | Evidence |
|-------|----------|
| Missing favicon | index.html requests /favicon.svg; file does not exist → 404 |
| Invalid icon path | Manifest icons use /icon-192.png, /icon-512.png — files exist in public/ |
| Manifest not loading | Manifest uses relative paths; would load if page loads from correct origin |

**Icon resolution from myneighbor.live:**
- If the app is served from `https://myneighbor.live/` with root as base:
  - `/manifest.json` → `https://myneighbor.live/manifest.json`
  - `/icon-192.png` → `https://myneighbor.live/icon-192.png`
- If the app is served from a subpath (e.g. `https://myneighbor.live/app/`), all `/`-prefixed paths would resolve to the root domain, not the subpath — icons and manifest could 404.

**Google logo:** A literal Google logo is unlikely from this app. Possible explanations:
- User confusion with a generic/broken icon or placeholder
- Third-party script or extension injecting branding
- Browser default when favicon/icon fails

---

### 6. Domain Migration Risk Summary

**Switching from vercel.app to myneighbor.live:**

| Aspect | Effect |
|--------|--------|
| Service worker control | Old SW on vercel.app cannot control myneighbor.live (different origin). A new SW registers for myneighbor.live when the user visits that origin. |
| Install state | An install created from vercel.app opens vercel.app. That install does not switch to myneighbor.live. User must uninstall and reinstall from myneighbor.live to get an install for the new domain. |
| Cached app shell | Current SW does not cache; it passes requests through. No app shell caching. |
| Old service workers breaking the app | Old vercel.app SWs do not control myneighbor.live pages. If a user has both domains in history, vercel.app SW remains for vercel.app only. No direct "old SW breaks new domain" scenario. |

**Critical point:** If FRONTEND_URL is not set, stripe-return and similar edge functions fall back to a vercel.app-derived URL:

```
frontendUrl = Deno.env.get("FRONTEND_URL") || supabaseUrl.replace(".supabase.co", ".vercel.app")
```

This produces a vercel.app URL, not myneighbor.live. Users could be redirected to the wrong domain after Stripe flows.

---

## Section B — Confirmed Root Causes

1. **Favicon 404:** index.html references `/favicon.svg`, which is not in public/. Browsers get 404 and may show a placeholder.
2. **Install tied to origin:** A PWA installed from vercel.app stays on vercel.app. Moving to myneighbor.live requires a new install from the new domain.
3. **Stripe return fallback:** stripe-return (and possibly similar functions) default to vercel.app when FRONTEND_URL is unset, causing post-Stripe redirects to the old domain.
4. **Orientation lock weakness:** Portrait lock relies on manifest + Screen Orientation API; the API often fails, and there is no fallback, so rotation can still occur.

---

## Section C — What Is Broken vs What Is Safe

**Broken or risky:**
- Favicon (404)
- PWA install from vercel.app does not transfer to myneighbor.live
- Stripe and similar redirects to vercel.app when FRONTEND_URL is missing
- Portrait orientation not reliably enforced

**Safe:**
- Manifest structure and relative URLs
- Service worker registration and pass-through fetch
- Icon paths and presence of icon files (assuming root deployment)
- No vercel.app or hardcoded wrong-domain URLs in manifest or SW

---

## Section D — What MUST Be Fixed (No Code Written Here)

1. Add `favicon.svg` to public/ (or change the favicon link to an existing asset, e.g. `icon-192.png`).
2. Set `FRONTEND_URL=https://myneighbor.live` (or the correct production URL) in Supabase Edge Function env so stripe-return and similar functions redirect to the correct domain.
3. Fix or remove the hardcoded `https://www.myneighbor.live/reset-password` in Login.jsx if it should not assume www (or confirm www vs apex is intended).
4. If the app is served from a subpath, adjust manifest and icon paths (and possibly base) so they resolve correctly.

---

## Section E — What Must Be Manually Cleared

**End users:**
1. Uninstall any PWA installed from vercel.app (remove from home screen / app list).
2. Clear site data for vercel.app (optional; removes old SW and storage).
3. Visit myneighbor.live and install the PWA from the new origin.

**Developers / ops:**
1. Ensure `FRONTEND_URL` is set for Edge Functions (e.g. stripe-return) in production.
2. Confirm myneighbor.live serves the app from the expected base path (root vs subpath) so manifest and icon paths resolve.
3. Verify manifest.json and icons are served with correct MIME types and without redirects that could break PWA checks.
