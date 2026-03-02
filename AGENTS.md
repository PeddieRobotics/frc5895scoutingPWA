# AGENTS.md

Project-specific guidance for coding agents working in `frc5895scoutingPWA`.

## Overview

- Stack: Next.js 15 (App Router), React 19, Node/npm
- App type: FRC scouting PWA with a config-driven form + analytics system
- Core behavior: A JSON game config drives form rendering, DB schema generation, and display pages

## Required Environment

Create `.env.local` with:

- `DATABASE_URL` - Neon/PostgreSQL connection string
- `ADMIN_PASSWORD` - password for `/admin`

Notes:

- PWA/service worker behavior is disabled in development.
- Service worker features should be validated from a production build (`npm run build` + `npm run start`).

## Commands

Use `npm` in the repo root.

```bash
npm install        # Install dependencies
npm run dev        # Start local dev server (http://localhost:3000)
npm run build      # Production build (catches many runtime/config issues)
npm run start      # Run built app locally
npm run lint       # Lint via Next.js
```

## Common Workflows

### 1. First-Time Setup

1. Run `npm install`.
2. Add `.env.local` with `DATABASE_URL` and `ADMIN_PASSWORD`.
3. Run `npm run dev`.
4. Open `/admin` and verify admin login works.

### 2. Daily Development Workflow

1. Start with `npm run dev`.
2. Make code changes.
3. Run `npm run lint` for touched areas.
4. Run `npm run build` before finishing larger changes (especially API/config/rendering changes).
5. Manually smoke-test affected pages/routes in the browser.

### 3. Game Config Workflow (Most Important Project-Specific Flow)

Use this when adding/changing scouting fields, calculations, or display pages.

1. Edit/create JSON config in `src/configs/` (examples: `reefscape_2025.json`, `rebuilt_2026.json`).
2. Validate the JSON structure against the project conventions in `README.md`.
3. Start app with `npm run dev`.
4. Go to `/admin/games`.
5. Upload or update the config.
6. Activate the desired game config.
7. Verify:
   - Scouting form renders on `/`
   - Team page works on `/team-view`
   - Match page works on `/match-view`
   - Picklist/compare pages load
   - Scout leads page works for any `holdTimer` fields

Notes:

- Uploading/activating a game config triggers validation and table generation (`scouting_<game>` and `scoutleads_<game>`).
- Display config mistakes may show a config error panel instead of crashing UI (runtime validation).
- `holdTimer` fields with a `scoutLeads.group` key will appear as a single combined card on `/scout-leads` — verify the card title, per-field breakdown, and rate input work correctly after any config changes.

### 4. API / Database Change Workflow

Use this when editing routes under `src/app/api/` or DB helpers under `src/lib/`.

1. Identify which DB client is used in the target code path:
   - `src/lib/auth.js` (`pg`) for most API/server utilities
   - `src/lib/db.js` / Neon client for specific paths
   - `src/middleware.js` uses Edge-compatible Neon access
2. Make the change.
3. Run `npm run lint`.
4. Run `npm run build` (important for Next.js route/runtime compatibility issues).
5. Manually hit the affected route/page and confirm response shape/behavior.

### 5. PWA / Service Worker Validation Workflow

Because PWA is disabled in dev:

1. Run `npm run build`.
2. Run `npm run start`.
3. Test installability/cache/service-worker behavior in the browser.
4. Re-test auth flows because cached assets can affect client behavior.

## High-Value Paths (For Faster Navigation)

- `src/lib/` - config validation, schema generation, calculations, display aggregation
- `src/app/api/` - API routes for scouting data, admin, auth, analytics
- `src/app/form-components/` - reusable form UI components
- `src/configs/` - JSON game config examples
- `src/middleware.js` - auth enforcement and public-path handling

## Expected Validation Before Hand-off

At minimum (unless the task is docs-only):

1. `npm run lint`
2. `npm run build` for non-trivial changes
3. Manual smoke test of changed pages/routes

## Scout Leads Timer Grouping

Multiple `holdTimer` fields can be **grouped** into a single rate-entry card on `/scout-leads` when they share a "per-second" rate (e.g. Auto Fuel and Tele Fuel both shot at the same speed).

### How to configure a group

Add `group` (string key) and optionally `groupLabel` (display name) inside the `scoutLeads` object of each timer field you want to combine:

```json
{
  "type": "holdTimer",
  "name": "autofuelsuccess",
  "label": "Auto Fuel (s)",
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 },
  "scoutLeads": {
    "rateLabel": "Balls / Second",
    "group": "Fuel",
    "groupLabel": "Fuel Scoring",
    "dbColumn": { "type": "NUMERIC(10,4)", "default": 0 }
  }
}
```

All fields with `"group": "Fuel"` collapse into one "Fuel Scoring" card with:
- A per-field breakdown (label + average seconds)
- One rate input that updates all fields in the group simultaneously
- Combined estimated output

### Key invariants

| Concern | Answer |
|---------|--------|
| DB schema change? | **No.** Each `holdTimer` keeps its own column in `scoutleads_<gameName>`. |
| How is the rate saved? | The client sends the same value for every field in the group in the `rates` object. `POST /api/scout-leads` writes it to each column independently. |
| Rate processing (`applyScoutLeadRatesToRows`)? | Unchanged — operates per field. All grouped fields have identical rates so results are correct. |
| Card order on `/scout-leads`? | Follows first-appearance order in the config. |
| Which field's `rateLabel` is used for the group card? | The first field in the group. Use a generic label for all members (e.g. `"Balls / Second"`). |

### Implementation file map

| File | Role |
|------|------|
| `src/lib/schema-generator.js` `extractTimerFieldsFromConfig()` | Reads `scoutLeads.group` and `scoutLeads.groupLabel`; adds them to the returned timer field metadata |
| `src/app/api/scout-leads/route.js` GET | Includes `group` and `groupLabel` on each `timerSummary` and `timerFields` item |
| `src/app/scout-leads/page.js` `buildDisplayItems()` | Groups `timerSummary` items by group key; ungrouped items pass through |
| `src/lib/config-validator.js` `validateHoldTimerField()` | Warns if `group` or `groupLabel` is not a string |

---

## Scouting Entry Edit Feature

### Overview

`/scout-leads` displays the full scouting form data for the loaded team+match below the timer rate cards. Entries are editable if the current user's team submitted them, or if the master admin password has been used to unlock editing on that page session.

### New endpoint: `PATCH /api/edit-match-entry`

- **Auth:** `validateAuthToken(request)` → `teamName`
- **Authorization logic:**
  1. Fetch the target row by `id`
  2. If `row.scoutteam === teamName` → authorized (own entry)
  3. Else if `request.body.adminPassword === process.env.ADMIN_PASSWORD` → authorized (admin override)
  4. Otherwise → 403
- **Allowed fields:** All config-defined fields from `extractFieldsFromConfig(config)` **minus** `IMMUTABLE_FIELDS` (`id`, `team`, `match`, `matchtype`, `scoutteam`, `timestamp`). `scoutname` and `noshow` are always editable.
- **Why NOT `update-row`:** The legacy `/api/update-row` is hardcoded to a specific table with a hardcoded field allowlist. The new endpoint is fully config-driven using `getActiveGame()` and `extractFieldsFromConfig()`.

### `isConfidenceRating` tag

- A single `starRating` or `qualitative` field may carry `"isConfidenceRating": true`.
- `extractConfidenceRatingField(config)` in `schema-generator.js` returns `{ name, label, max }` or `null`.
- The `/scout-leads` page computes `sectionBackground` via `getConfidenceColor(avg, max)`:
  - Maps average from 1→max to hue 0 (red) → 120 (green) in `hsl(hue, 65%, 93%)` (soft pastel).
  - Background is `#ffffff` when no confidence field configured or no entries loaded.
- **Validation:** more than one field with `isConfidenceRating: true` → **error** in config-validator. On a non-star field → **warning**.

### Background color algorithm

```
ratio = clamp((avg - 1) / (max - 1), 0, 1)
hue   = round(ratio * 120)
color = hsl(hue, 65%, 93%)
```

### GET `/api/scout-leads` additions

- `allScoutingRows` — all scouting rows for the team/match including noshow (for entry display)
- `currentUserTeam` — `teamName` from `validateAuthToken` (to determine which entries the user can edit)
- The existing `scoutingRows` still excludes noshow rows (used for timer rate accuracy).

### Key files

| File | Role |
|------|------|
| `src/app/api/edit-match-entry/route.js` | New PATCH endpoint |
| `src/app/api/scout-leads/route.js` | GET additions (allScoutingRows, currentUserTeam) |
| `src/app/scout-leads/page.js` | Entry display, edit UI, admin unlock, confidence background |
| `src/app/scout-leads/page.module.css` | Entry card styles |
| `src/lib/schema-generator.js` | `extractConfidenceRatingField()` |
| `src/lib/config-validator.js` | isConfidenceRating validation rules |

---

## Known Constraints / Gotchas

- No dedicated automated test suite is configured in `package.json` (lint/build/manual verification are the main checks).
- Client bundling is protected by mocks/aliases in `next.config.js` for server-only modules (`bcrypt`, Neon serverless pieces).
- The active game config is cached (`getActiveGame()`), so config-related behavior may appear stale briefly during development.
- Timer grouping is **UI-only** — never add a "group column" to the DB schema. The group key exists only in the JSON config and in the API/page layer.
- Match number stored in DB uses an offset via `normalizeMatchForStorage()`. Always use the utility functions in `match-utils.js` for match number conversion.
