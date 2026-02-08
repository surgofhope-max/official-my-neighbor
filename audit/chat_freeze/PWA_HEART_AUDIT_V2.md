# PWA Heart Audit V2 — Domain Canonicalization & Install Failure

**Purpose:** Explain why the PWA installed and rendered yesterday, but after domain canonicalization/uninstall-reinstall it now fails to install/render and sometimes shows incorrect shortcut/icon behavior.

**Scope:** Entire repo (frontend + Supabase functions). Audit only. No code changes.

---

## 1. Executive Summary (Root Cause Hypotheses Ranked by Evidence)

| Rank | Hypothesis | Evidence strength |
|------|------------|-------------------|
| 1 | **Stripe return redirects to wrong domain when FRONTEND_URL unset** — Users completing Stripe Connect are redirected to `https://<project>.vercel.app/sellerdashboard` instead of `https://myneighbor.live/sellerdashboard` | High: stripe-return:36,124 explicitly fall back to vercel.app-derived URL |
| 2 | **PWA install is origin-bound** — An install from vercel.app opens vercel.app. After domain change, users must uninstall and reinstall from myneighbor.live. Old install does not "follow" the new domain | High: Standard PWA behavior; install identity tied to manifest start_url origin |
| 3 | **Favicon 404 causes fallback/placeholder icon** — index.html references `/favicon.svg` which does not exist in public/. Browsers show generic placeholder; can affect install UI and tab/shortcut icons | High: public/ contains no favicon.svg; only icon-192.png, icon-512.png, apple-touch-icon.png |
| 4 | **www vs apex mismatch** — Login.jsx hardcodes `https://www.myneighbor.live/reset-password`. If canonical is apex (myneighbor.live), password reset links may hit www, causing redirect chains or cookie scope issues | Medium: Login.jsx:80; depends on DNS/hosting config |
| 5 | **Stale service worker / cached shell** — Current sw.js does not cache; pass-through only. But if users had an older cached SW from vercel.app, that SW cannot control myneighbor.live (different origin). No direct "old SW breaks new domain" in current code | Low: Current SW has no cache; origin binding prevents cross-origin control |

---

## 2. Evidence Table (file:line, finding, impact)

| File:Line | Finding | Impact |
|-----------|---------|--------|
| supabase/functions/stripe-return/index.ts:36 | `frontendUrl = Deno.env.get("FRONTEND_URL") \|\| supabaseUrl.replace(".supabase.co", ".vercel.app")` | When FRONTEND_URL unset, redirect goes to vercel.app-derived URL (e.g. https://xyzproject.vercel.app/sellerdashboard), not myneighbor.live |
| supabase/functions/stripe-return/index.ts:124 | Same fallback in catch block | Error path also redirects to wrong domain |
| src/pages/Login.jsx:80 | `redirectTo = "https://www.myneighbor.live/reset-password"` | Hardcoded www subdomain; may conflict with apex canonical; auth reset links use www |
| index.html:5 | `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` | Favicon requested |
| public/ (directory listing) | No favicon.svg; only apple-touch-icon.png, icon-192.png, icon-512.png, manifest.json, sw.js | Favicon 404; browsers may show placeholder; can affect install/shortcut icons |
| public/manifest.json:4-5 | `start_url: "/marketplace"`, `scope: "/"` | Relative; compatible with any origin |
| public/manifest.json:10-11 | Icons: /icon-192.png, /icon-512.png | Files exist; paths relative |
| index.html:9 | `<link rel="manifest" href="/manifest.json" />` | Manifest linked |
| index.html:14 | `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` | File exists |
| src/main.jsx:22-31 | SW registration: `/sw.js`, PROD only, on load | Custom SW; no Vite PWA plugin |
| public/sw.js:9-11 | `fetch` handler: `event.respondWith(fetch(event.request))` | Pass-through; no caching |
| public/sw.js | No cache names, no versioning | No stale asset risk from SW cache |
| supabase/functions/send-show-reminders/index.ts:319,332 | `from: "MyNeighbor.Live <no-reply@myneighbor.live>"`, `href="https://myneighbor.live"` | Email links use apex; consistent |
| supabase/functions/send-test-email/index.ts:18 | `from: "MyNeighbor.Live <no-reply@myneighbor.live>"` | Same |

---

## 3. Installability Checklist (pass/fail with reason)

| Criterion | Pass/Fail | Reason |
|-----------|-----------|--------|
| Served over HTTPS | Unknown | Depends on deployment; assumed for production |
| Valid manifest (200, correct content-type) | Pass | manifest.json exists; relative URLs; no syntax errors |
| Manifest link in index.html | Pass | index.html:9 |
| Manifest start_url within scope | Pass | start_url /marketplace within scope / |
| Manifest icons (192, 512) exist | Pass | icon-192.png, icon-512.png in public/ |
| Service worker registered | Pass | main.jsx:24-25, PROD only |
| SW controls page | Pass | sw.js has fetch handler; skipWaiting + clients.claim |
| Fetch handler present | Pass | sw.js:9-11 |
| Favicon | Fail | /favicon.svg 404; no file in public/ |
| No mixed content | Pass | No hardcoded http in manifest/SW |

**Chrome "shortcut" vs "install app" degradation:** Chrome may offer a shortcut instead of full install when: (a) favicon or manifest icons fail to load, (b) manifest fails validation or load, (c) SW fails to register, (d) engagement heuristics not met. Favicon 404 and any manifest/icon load failure increase shortcut likelihood.

---

## 4. Redirect/Origin Bounce Map

| Source | Redirect target computation | Can redirect to vercel.app? |
|--------|-----------------------------|-----------------------------|
| stripe-return (success) | `FRONTEND_URL` or `supabaseUrl.replace(".supabase.co", ".vercel.app")` + `/sellerdashboard` | Yes, when FRONTEND_URL unset |
| stripe-return (error) | Same | Yes, when FRONTEND_URL unset |
| stripe-return (no accountId) | Same | Yes, when FRONTEND_URL unset |
| stripe-return (no STRIPE_SECRET) | Same | Yes, when FRONTEND_URL unset |
| stripe-create-account | returnUrl = `${supabaseUrl}/functions/v1/stripe-return` (edge function) | No; Stripe returns to edge fn, which then redirects |
| Login.jsx resetPasswordForEmail | Hardcoded `https://www.myneighbor.live/reset-password` | No vercel.app; uses www |
| BuyerSafetyAgreement | createPageUrl(redirectTo) — client-side, relative | No |
| GIVIViewerOverlay | `/BuyerSafetyAgreement?redirect=LiveShow` — relative | No |
| Layout route guards | createPageUrl(redirectTo) — client-side | No |
| Supabase Auth (magic link, confirm) | Configured in Supabase Dashboard (Site URL, Redirect URLs) | Not in repo; must be set in dashboard |

**Explicit vercel.app fallback:** Only stripe-return:36 and :124. No other edge function in the repo computes a frontend redirect URL with this fallback.

---

## 5. Service Worker Cache Risk Assessment

| Aspect | Finding |
|--------|---------|
| Cache usage | None. sw.js does not create or use caches |
| Versioning | None |
| Stale asset risk | None from SW — pass-through fetch only |
| Precache / app shell | None |
| Cross-deploy persistence | N/A |
| Old vercel.app SW | Cannot control myneighbor.live (different origin). When user visits myneighbor.live, a new SW registers for that origin. No cache bleed. |

**Conclusion:** Service worker caching is not a cause of install/render failure. No stale asset risk.

---

## 6. What Changed Between "Worked Yesterday" and "Broken Today"

**Working yesterday (hypothesized state):**
- App served from vercel.app (or myneighbor.live with correct config)
- PWA installed from that origin
- FRONTEND_URL may have been set (or fallback happened to work)
- Favicon may have been satisfied (e.g. different file, or issue not noticed)
- No domain canonicalization / uninstall-reinstall

**Broken today (after domain canonicalization / uninstall-reinstall):**
1. **Origin change** — Users now visit myneighbor.live. Old PWA install from vercel.app does not apply. New install must be from myneighbor.live.
2. **Stripe return** — If FRONTEND_URL is not set in Supabase Edge Function env, stripe-return redirects to `https://<project>.vercel.app/sellerdashboard`. User lands on wrong/404 domain after Stripe Connect.
3. **Uninstall-reinstall** — Uninstalling removes the old app. Reinstalling from myneighbor.live can fail if: (a) favicon 404 degrades install eligibility, (b) manifest or icons fail to load (e.g. subpath deployment), (c) SW fails to register.
4. **Shortcut vs install** — Chrome may offer "Add to Home Screen" as a shortcut instead of full install when install criteria are not fully met (favicon, icons, engagement).
5. **Icon behavior** — Favicon 404 can cause placeholder icon in tab, home screen, or app list. User may perceive "wrong" or "Google" icon.

---

## 7. No-Fix Recommendations (Manual Steps Only)

**End users:**
1. Uninstall any existing PWA/shortcut from vercel.app.
2. Clear site data for vercel.app (optional; removes old SW and storage).
3. Visit https://myneighbor.live directly (ensure correct canonical — apex vs www).
4. Install PWA from myneighbor.live (browser install prompt or menu).
5. If Stripe Connect was used, ensure redirect lands on myneighbor.live; if it lands on vercel.app, FRONTEND_URL is not set.

**Developers / ops (configuration only; no code changes here):**
1. Set `FRONTEND_URL=https://myneighbor.live` (or the correct production URL) in Supabase Edge Function secrets for stripe-return (and any other function that redirects to frontend).
2. Verify Supabase Auth: Site URL and Redirect URLs in Auth settings include https://myneighbor.live (and https://www.myneighbor.live if used).
3. Confirm myneighbor.live serves the app from the root (/) so /manifest.json, /icon-192.png, /icon-512.png resolve correctly.
4. Add favicon.svg to public/ or change index.html to reference an existing icon (e.g. icon-192.png) — recommendation only; no fix applied in this audit.
