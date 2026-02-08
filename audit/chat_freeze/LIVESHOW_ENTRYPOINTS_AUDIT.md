# LiveShow Entry Points Audit

**Purpose:** Identify every navigation entrypoint to LiveShow and verify showId presence, createPageUrl usage, and consistency.

---

## Table: LiveShow Navigation Entry Points

| File:Line | Source surface | Navigation code snippet | Pass showId? | Param style | createPageUrl correct? | Risk note |
|-----------|----------------|-------------------------|--------------|-------------|------------------------|-----------|
| Marketplace.jsx:389 | Marketplace card (live grid) | `onClick={() => navigate(createPageUrl("LiveShow") + \`?showId=${show.id}\`)}` | YES | query | YES | — |
| Marketplace.jsx:428 | Marketplace card (live grid) | Same pattern | YES | query | YES | — |
| Marketplace.jsx:467 | Marketplace card (live grid) | Same pattern | YES | query | YES | — |
| LiveShows.jsx:94 | LiveShows list | `onClick={() => navigate(createPageUrl("LiveShow") + \`?showId=${show.id}\`)}` | YES | query | YES | — |
| SellerStorefront.jsx:831 | Seller storefront (live show card) | Same pattern | YES | query | YES | — |
| SellerStorefront.jsx:876 | Seller storefront (live show card) | Same pattern | YES | query | YES | — |
| CommunityPage.jsx:401 | Community page (live show card) | Same pattern | YES | query | YES | — |
| CommunityPage.jsx:425 | Community page (live show card) | Same pattern | YES | query | YES | — |
| NearMe.jsx:992 | NearMe (live shows other) | Same pattern | YES | query | YES | — |
| NearMe.jsx:1016 | NearMe (live shows followed) | Same pattern | YES | query | YES | — |
| NearMe.jsx:1043 | NearMe (upcoming followed) | Same pattern | YES | query | YES | — |
| NearMe.jsx:1055 | NearMe (upcoming other) | Same pattern | YES | query | YES | — |
| UnifiedSearchBar.jsx:185 | Search (show result when live) | `navigate(createPageUrl("LiveShow") + \`?showId=${data.id}\`);` | YES | query | YES | — |
| BuyerProfile.jsx:1245 | Buyer profile (bookmarks dialog) | `navigate(createPageUrl("LiveShow") + \`?showId=${show.id}\`);` | YES | query | YES | — |
| SellerDashboard.jsx:1608 | Seller dashboard (bookmarks dialog) | Same pattern | YES | query | YES | — |
| BuyerSafetyAgreement.jsx:97 | Post-agreement redirect (already agreed) | `createPageUrl("liveshow") + \`?showId=${showId}\`` | YES (when present) | query | YES | showId from URL; lost if referrer omitted it |
| BuyerSafetyAgreement.jsx:163 | Post-agreement redirect (submit) | Same pattern | YES (when present) | query | YES | Same |
| ShareButton.jsx:69-70 | Share URL generation | `path = \`/LiveShow\`; params.set('showId', id);` | YES | query | N/A | **Does NOT use createPageUrl**; hardcoded `/LiveShow` |
| GIVIViewerOverlay.jsx:474 | GIVI redirect (no agreement) | `window.location.href = \`/BuyerSafetyAgreement?redirect=LiveShow\`;` | NO | — | N/A | **Loses showId**; user lands on LiveShow without showId after agreeing |

---

## Indirect / Non-Navigation Entry Points

| File:Line | Description | Pass showId? | Note |
|-----------|-------------|--------------|------|
| CheckoutOverlay.jsx:721 | Redirect to BuyerSafetyAgreement | N/A | Passes `redirect=LiveShow` only; showId must be in prior URL when user returns |
| GIVIViewerOverlay.jsx:474 | Redirect to BuyerSafetyAgreement | NO | **Risk:** No showId in redirect; BuyerSafetyAgreement cannot restore LiveShow context |

---

## LiveShow.jsx: showId Consumption

| File:Line | Code | Note |
|-----------|------|------|
| LiveShow.jsx:61 | `const showId = urlParams.get('showId') \|\| urlParams.get('showid');` | Accepts both `showId` and `showid` |
| LiveShow.jsx:607-609 | Redirect if no showId | Redirects to Marketplace when showId missing after params load |

---

## Known Invariant: CreatePageUrl() Must Receive ONLY Route Key

**Rule:** `createPageUrl(routeKey)` must receive ONLY the route key string. Query parameters must be appended AFTER the returned path.

**Correct pattern:**
```javascript
createPageUrl("LiveShow") + `?showId=${show.id}`
```

**Violations:** None found. All LiveShow navigations use the correct pattern: route key only, query appended after.

**Caveat:** BuyerSafetyAgreement uses `createPageUrl("liveshow")` (lowercase). `createPageUrl` internally lowercases the input (`pageName.toLowerCase()`), so `"liveshow"` and `"LiveShow"` both resolve to `/liveshow`. No violation.

---

## createPageUrl Non-Usage (Potential Inconsistency)

| File:Line | Code | Risk |
|-----------|------|------|
| ShareButton.jsx:69 | `path = \`/LiveShow\`;` | Hardcoded path; if route changes, ShareButton URL may break. Does not use createPageUrl. |

---

## Route Key Consistency

- **pages.config.js:40:** Route key is `"liveshow"` (lowercase in PAGES object).
- **createPageUrl behavior:** Returns `'/' + pageName.toLowerCase().replace(/ /g, '-')` → `/liveshow`.
- **ShareButton:** Uses `/LiveShow` (capital L, capital S). Browsers/routers often treat paths case-insensitively; verify routing config.

---

## Summary

- **Direct navigations to LiveShow:** 17 entry points across Marketplace, LiveShows, SellerStorefront, CommunityPage, NearMe, UnifiedSearchBar, BuyerProfile, SellerDashboard, BuyerSafetyAgreement.
- **showId present:** All direct navigations pass showId except GIVIViewerOverlay → BuyerSafetyAgreement flow (showId lost).
- **createPageUrl usage:** All createPageUrl usages pass route key only; query appended after. No violations.
- **Risks:** (1) ShareButton hardcodes path; (2) GIVIViewerOverlay loses showId when redirecting unauthenticated users to BuyerSafetyAgreement.
