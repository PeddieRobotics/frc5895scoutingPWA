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

## Known Constraints / Gotchas

- No dedicated automated test suite is configured in `package.json` (lint/build/manual verification are the main checks).
- Client bundling is protected by mocks/aliases in `next.config.js` for server-only modules (`bcrypt`, Neon serverless pieces).
- The active game config is cached (`getActiveGame()`), so config-related behavior may appear stale briefly during development.
