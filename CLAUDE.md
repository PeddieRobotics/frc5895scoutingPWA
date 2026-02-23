# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (http://localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run start      # Serve production build
```

PWA is disabled in development (`NODE_ENV === 'development'`), so service worker features only work in production/build.

## Environment Variables

Required in `.env.local` (or Vercel env settings):
- `DATABASE_URL` — Neon PostgreSQL connection string
- `ADMIN_PASSWORD` — Admin panel password

## Architecture Overview

This is a **Next.js 15 PWA** for FRC (FIRST Robotics) match scouting. It uses a **config-driven system** where a JSON game configuration drives the entire app: form rendering, database schema creation, and all display/analytics pages.

### Data Flow

1. **Admin uploads a JSON game config** at `/admin/games` → validated, stored in `game_configs` table, scouting table (`scouting_<gameName>`) and scout-leads table (`scoutleads_<gameName>`) are auto-created.
2. **Scouts open the app** → form is dynamically rendered from the active game config → submissions write rows to `scouting_<gameName>`.
3. **Scout leads open `/scout-leads`** → enter per-second rates for `holdTimer` fields → stored in `scoutleads_<gameName>`.
4. **Display pages** (`/team-view`, `/match-view`, `/picklist`, `/compare`) call API routes which use the display engine to aggregate data from `scouting_<gameName>` using field references from the active config.

### Key Directories

- `src/lib/` — Server-only utilities:
  - `auth.js` — DB pool (uses `pg`), session validation helpers, cookie management
  - `db.js` — Secondary Neon client (uses `@neondatabase/serverless` with WebSocket)
  - `game-config.js` — CRUD for `game_configs` table; `getActiveGame()` with 5-min cache
  - `config-validator.js` — JSON config validation logic
  - `schema-generator.js` — Generates `CREATE TABLE` SQL from config fields
  - `display-engine.js` — Data aggregation for display pages (uses `@tidyjs/tidy`)
  - `display-config-validation.js` — Runtime validation of display config keys
  - `calculation-engine.js` — Evaluates EPA formulas and mapping calculations
  - `form-renderer.js` — Server-side form field extraction helpers
  - `timer-rate-processing.js` — Converts timer seconds + scout-lead rates to scored values
  - `useGameConfig.js` — Client-side hook for fetching active game config

- `src/app/form-components/` — Reusable React components for the scouting form (Checkbox, Counter, HoldTimerInput, SingleSelect, MultiSelect, StarRating, etc.) plus NavBar, AuthDialog.

- `src/app/api/` — Next.js API routes:
  - `get-data/` — Fetches scouting rows for a team
  - `get-team-data/` — Aggregated team stats for team-view
  - `get-alliance-data/` — Alliance-level aggregation for match-view
  - `add-match-data/` — Inserts a scouting submission
  - `compute-picklist/` — Picklist computation
  - `scout-leads/` — Scout-lead timer rate CRUD
  - `admin/` — Game management, auth, team management

- `src/app/` — Pages: `/` (scouting form), `/team-view`, `/match-view`, `/picklist`, `/compare`, `/qual`, `/scanner`, `/scout-leads`, `/admin`, `/sudo`

- `src/configs/` — Reference JSON game configs (`reefscape_2025.json`, `rebuilt_2026.json`)

### Authentication

- **Scout/user auth**: Session-based using `team_auth` and `user_sessions` DB tables. Sessions validated in `src/middleware.js` (Edge Runtime, uses `@neondatabase/serverless`). Cookies: `auth_session`, `auth_session_lax`, `auth_session_secure`.
- **Admin auth**: Separate password-based auth at `/admin` using `ADMIN_PASSWORD` env var, validated client-side via `/api/admin/auth`.
- Public paths bypass middleware auth (see `PUBLIC_PATHS` in `middleware.js`).

### Two DB Clients

There are two separate DB connection mechanisms — use the right one for the context:
- `src/lib/auth.js` exports `pool` (using `pg` package) — used in API routes and server utilities
- `src/lib/db.js` exports `pool` and `sql` (using `@neondatabase/serverless`) — secondary Neon client; `middleware.js` uses `neon()` directly for Edge Runtime compatibility

### Game Config JSON Structure

See `README.md` for full reference. Key top-level keys:
- `gameName` — becomes the DB table suffix (`scouting_<gameName>`, `scoutleads_<gameName>`)
- `basics` — pre-match fields (e.g., "No Show")
- `sections` — form sections with fields; supports `showWhen` conditional visibility
- `calculations` — EPA formulas (`auto`, `tele`, `end`) using formula or mapping types
- `display` — config for all display pages: `teamView`, `matchView`, `picklist`, `compare`, `apiAggregation`

Field types: `checkbox`, `counter`, `number`, `holdTimer`, `text`, `comment`, `singleSelect`, `multiSelect`, `starRating`/`qualitative`, `table`, `collapsible`

### Display Config Validation

`src/lib/display-config-validation.js` validates at runtime that display config keys are internally consistent (e.g., `matchView.piecePlacement.bars[*].key` must exist in `apiAggregation.alliancePiecePlacement[*].key`). Failures show a config error panel instead of broken UI.

### webpack Config Note

`next.config.js` aliases `bcrypt` and `@neondatabase/serverless` to mock modules on the client side to prevent bundling server-only packages into the browser bundle. API routes are excluded from this via `null-loader`.