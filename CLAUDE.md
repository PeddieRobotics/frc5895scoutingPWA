# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> [!CAUTION]
> **🚨✨ DO NOT HARDCODE DATA ✨🚨**
> **ALL game-specific values — team numbers, field names, table names, match data, thresholds, labels, config keys — MUST come from the active JSON game config or the database. Never hardcode these into source code. The entire system is config-driven by design. Violating this breaks every future game season.**

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (http://localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run start      # Serve production build
```

> [!IMPORTANT]
> **ALWAYS kill the dev server before building:** `pkill -f "next dev"` then `npm run build`. Running both simultaneously causes flaky build failures.

PWA is disabled in development (`NODE_ENV === 'development'`), so service worker features only work in production/build.

## Environment Variables

Required in `.env.local` (or Vercel env settings):
- `DATABASE_URL` — Neon PostgreSQL connection string
- `ADMIN_PASSWORD` — Admin panel password

## Architecture Overview

This is a **Next.js 15 PWA** for FRC (FIRST Robotics) match scouting. It uses a **config-driven system** where a JSON game configuration drives the entire app: form rendering, database schema creation, and all display/analytics pages.

### Data Flow

1. **Admin uploads a JSON game config** at `/admin/games` → validated, stored in `game_configs` table, scouting table (`scouting_<gameName>`), scout-leads table (`scoutleads_<gameName>`), and betting table (`betting_<gameName>`) are auto-created.
2. **Scouts open the app** → form is dynamically rendered from the active game config → submissions write rows to `scouting_<gameName>`. When `enableBetting: true`, a `BettingSection` appears between basics and the dynamic form.
3. **Scout leads open `/scout-leads`** → enter per-second rates for `holdTimer` fields (individual or grouped) → stored in `scoutleads_<gameName>`. Also access the standalone **Gallery section** to upload/tag/view robot photos for any team. The **Prescout** button navigates to `/scout-leads/prescout/` — a config-driven form for structured per-team pre-event data entry (requires a `prescout` key in the game config). A bulk spreadsheet upload is available at `/scout-leads/prescout/upload`.
4. **Display pages** (`/team-view`, `/match-view`, `/picklist`, `/compare`) call API routes which use the display engine to aggregate data from `scouting_<gameName>` using field references from the active config.
5. **Scouts visit `/betting`** → leaderboard of virtual point balances from match outcome bets (when `enableBetting: true`).

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
  - `edit-match-entry/` — PATCH endpoint to update a single scouting row (config-driven field allowlist; auth: own entry or admin password)
  - `prescout/` — Spreadsheet prescout data CRUD: `GET ?team&gameId` (any auth), `DELETE ?gameName` (admin); `upload/` POST xlsx (any auth); `teams/` GET list (any auth); `photos/` GET metadata + POST upload (any auth); `photos/[id]/` GET full data + DELETE (any auth); `form/` GET `?team&gameId` + POST `{teamNumber, gameId, data}` — config-driven prescout form CRUD (any auth); POST uses field-level merge (existing fields not submitted are preserved)
  - `betting/` — Betting system (requires `enableBetting: true` in config + `tbaEventCode`): `prediction/` GET Statbotics win probabilities; `place/` POST place a bet; `my-bet/` GET scout's bet for a match; `balance/` GET scout's point balance; `leaderboard/` GET ranked balance table (also auto-resolves completed bets)
  - `admin/` — Game management, auth, team management

- `src/app/` — Pages: `/` (scouting form), `/team-view`, `/match-view`, `/picklist`, `/compare`, `/qual`, `/scanner`, `/scout-leads`, `/scout-leads/prescout/` (config-driven prescout form), `/scout-leads/prescout/upload` (spreadsheet upload), `/betting`, `/admin`, `/admin/prescout` (redirects to `/scout-leads/prescout/upload`), `/sudo`

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
- `gameName` — becomes the DB table suffix (`scouting_<gameName>`, `scoutleads_<gameName>`, `betting_<gameName>`)
- `enableBetting` — optional boolean; activates the match betting system (Statbotics predictions, `betting_<gameName>` table, `BettingSection` on form, `/betting` leaderboard). Requires `tbaEventCode`.
- `basics` — pre-match fields (e.g., "No Show")
- `sections` — form sections with fields; supports `showWhen` conditional visibility
- `calculations` — EPA formulas (`auto`, `tele`, `end`) using formula or mapping types
- `prescout` — optional object; defines the config-driven prescout form at `/scout-leads/prescout/`. Contains `sections[]`, each with `id`, `header`, optional `description`, and `fields[]`. Field types: `singleSelect` (with `options`), `comment`, `starRating` (with `max`), `checkbox`, `multiSelect`. Additional field properties:
  - `hasOther` (boolean, `singleSelect` only) — appends an "Other" tile; selecting it reveals a free-text input whose typed value is stored as the display string instead of an option label.
  - `showWhen` (object) — conditional visibility: `{ field: "<name>", equals: N }` or `{ field: "<name>", notEquals: N }`. Referenced field must appear before this field in the config. Hidden fields are excluded from submission and cleared when the controlling field changes. Validated by `config-validator.js` (warns if `field` is missing or not found in preceding fields).
  Data stored in `prescoutform_<gameName>` as `[{field, value}]` arrays (one row per team, field-level merge on upsert — existing fields not in the submission are preserved). Validated by `config-validator.js`. See `README.md` for full config reference.
- `photoTags` — optional array of `{ name, emoji, color }` tag definitions. Drives tag pill UI in the `/scout-leads` Gallery section. Referenced by `display.teamView.photoSections`. Validated by `config-validator.js`.
- `display` — config for all display pages: `teamView`, `matchView`, `picklist`, `compare`, `apiAggregation`
  - `matchView.showEpaOverTime` (bool): when `true`, each team card in match-view shows a per-match EPA/PPR over-time line chart; PPR injection skipped when `false`
  - `matchView.teamStats[]` — `{label, key, format}` for additional stat rows per team card; `key` uses dot-notation path traversal (e.g., `"qualitative.defenseplayed"`); `format`: `"number"` (1 decimal) or `"percent"` (×100 + %)
  - `matchView.endgamePie.label` — section title for endgame pie in team cards (default: `"Endgame %"`); section hidden when `keys` is absent/empty
  - `matchView.piecePlacement.bars` — piece placement bar section hidden in match-view team cards when empty/omitted
  - `teamView.piecePlacement.<group>.avgLabel` — TwoByTwo avg column header override (default: `"Average"`)
  - `compare.sections[]` — array of `{ label, stats[] }` groups rendered as pill-card sections on `/compare`; each stat is `{ label, key?, compute?, format? }` where `key` is a direct property on team data, `compute` is a dot-path or `"path1 + path2"` expression, and `format` is `"number"` (default, 1 decimal) or `"percent"` (1 decimal + `%`)
  - `compare.qualitativeSection` — `{ label, stats[] }` section for qualitative data; each stat supports `defenseField` (scouting row field name) which renders a pill showing the avg rating with a hover tooltip listing `"{scout} #Q{match}: {rating}"` per entry; also supports `key`/`compute` for plain numeric stats
  - `compare.photoTag` (string, optional) — renders a `TaggedPhotoGrid` per team on `/compare`, filtered to this tag name; must match a name in `photoTags`; validated by `config-validator.js`
  - `teamView.epaChartOverlayOptions[]` — `{field, label}` array. Adds a pill-style selector above the main PPR/EPA Over Time chart on `/team-view`, `/match-view`, and `/compare`. Selecting an option renders a dashed second line on a right-side Y-axis. `field` is either `"auto"/"tele"/"end"` (reuses existing per-period over-time arrays) or a `qualitativeDisplay` field name (plots per-match star-rating averages from `overlayOverTime`). Omit or set to `[]` to hide selector. Auto/Tele sub-charts in team-view do **not** get an overlay selector.
  - `teamView.photoSections[]` — `{ tag, placement }` array. Each entry renders a `TaggedPhotoGrid` at the specified location in `/team-view` for photos tagged with `tag`. Supported placements: `"aboveEpaChart"` (above EPA chart), `"sections.auto.afterImageSelect"` (below imageSelect in Auto section). `tag` must match a name in `photoTags`. Validated by `config-validator.js`.

Field types: `checkbox`, `counter`, `number`, `holdTimer`, `text`, `comment`, `singleSelect`, `imageSelect`, `multiSelect`, `starRating`/`qualitative`, `table`, `collapsible`

#### holdTimer & Scout Leads Grouping

`holdTimer` fields with a `scoutLeads` object can optionally include `group` (string key) and `groupLabel` (display name). Fields sharing the same `group` string are collapsed into a single combined rate card on `/scout-leads`:
- One rate input controls all fields in the group simultaneously.
- The same rate value is written to each field's individual column in `scoutleads_<gameName>` on save.
- `extractTimerFieldsFromConfig()` in `schema-generator.js` propagates `group` and `groupLabel` to the returned field metadata.
- The GET `/api/scout-leads` response includes `group`/`groupLabel` on each `timerSummary` item; the `/scout-leads` page builds grouped display items using `buildDisplayItems()`.
- The DB schema is **unchanged** — each `holdTimer` still has its own column; grouping is purely a UI concern.

#### Scout Leads — Scouting Entry Display & Edit

The `/scout-leads` page also renders the full scouting form data below the timer cards:
- All submitted entries (including No Show) are shown in entry cards.
- Edit button visible for own entries or when admin password is unlocked.
- Admin unlock: enter `ADMIN_PASSWORD` in the unlock form on the page to enable editing of all entries.
- `isConfidenceRating: true` on a single `starRating`/`qualitative` field drives a red→green section background based on average confidence. `extractConfidenceRatingField()` in `schema-generator.js` extracts this field client-side.
- The GET `/api/scout-leads` now returns `allScoutingRows` (all rows including noshow) and `currentUserTeam` in addition to existing timer data.
- Edits are saved via `PATCH /api/edit-match-entry` which validates auth, checks allowed fields against config, and uses parameterized SQL.
- **`starRating`/`qualitative` fields render `max` stars (default: 6).** Add `"max": N` (integer ≥ 2) to configure the star count. All rendering, editing, display, and inversion logic uses the actual `max` value.
- **`zeroLabel`** (string, optional): text shown below the stars when no rating is selected (e.g. `"Did Not Defend"`). If omitted, nothing is shown at zero.
- **`ratingLabels`** (array of exactly `max` strings, optional, default 6): overrides the default Low→High scale labels shown below the stars when a rating is selected. Defaults to `["Low", "Relatively Low", "Just Below Average", "Just Above Average", "Relatively High", "High"]`. Validated by `config-validator.js` — wrong length or non-strings produce a warning.

### Prescout Data & Photo Gallery

Per-game DB tables (created alongside scouting tables in `createGame()`, dropped in `deleteGame()`):

- **`prescout_<gameName>`** — `team_number UNIQUE`; `data` JSONB column holds ordered array of `{field, value}` prescout fields from spreadsheet upload; upserted on re-upload. Table name from `sanitizePrescoutTableName()`.
- **`prescoutform_<gameName>`** — `team_number UNIQUE`; `data` JSONB; `submitted_by`, `submitted_at`, `updated_at`. Config-driven prescout form data. One row per team; upsert on re-submit. Table name from `sanitizePrescoutFormTableName()`. Created at game-creation time and lazily by the form API route.
- **`photos_<gameName>`** — multiple photos per team; `photo_data TEXT` stores base64; `mime_type`, `uploaded_by`, `tag VARCHAR(100)` (nullable), `uploaded_at` metadata columns. `tag` is migrated into existing tables automatically via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Table name from `sanitizePhotosTableName()`.

**Config-driven prescout form (`/scout-leads/prescout/`):**
- Driven by the `prescout` top-level key in the game config. Any authenticated user can access.
- Scouts load a team number, fill out the form (sections → fields), and submit via `POST /api/prescout/form`. Existing data is pre-populated for editing.
- Includes `PhotoGallery` for the loaded team (robot photo upload/view).
- `/api/prescout/form` — `GET ?team&gameId` returns `{data, submittedBy, submittedAt, updatedAt}`; `POST {teamNumber, gameId, data}` upserts.
- If the active config has no `prescout` key, the page shows an informational message and still links to the spreadsheet upload.

**Spreadsheet ingestion (`POST /api/prescout/upload`):**
- Auth: any authenticated user (standard session token — admin password no longer required).
- Accepts `.xlsx` via `multipart/form-data` (`file` + `gameName`).
- Parses the sheet named `"Prescout"` (case-sensitive) using the `xlsx` (SheetJS) package.
- Transposed layout: row 0 = team numbers (cols 1+), col 0 = field names (rows 1+). All values stored as strings; nulls filtered in UI.
- `/api/prescout/teams?gameName=<name>` — any authenticated user (switched from admin-only).

**Display page data fetching:**
- `/team-view` and `/compare` dual-fetch from both `/api/prescout/form` and `/api/prescout` in parallel. Form data takes priority; spreadsheet data is fallback. Both render via `PrescoutSection` using the same `[{field, value}]` format.

**Upload page (`/scout-leads/prescout/upload`):**
- Moved from `/admin/prescout` (which now redirects here). Auth: any authenticated user. Same features: upload `.xlsx`, view imported teams, clear all data.

**Photos (`/api/prescout/photos`):**
- Any authenticated user can upload (`POST`) or delete (`DELETE /api/prescout/photos/[id]?gameId=<id>`).
- Max 3 MB enforced server-side; client-side check mirrors this.
- `GET /api/prescout/photos?team&gameId[&tag=<name>]` returns metadata only (no base64); optional `tag` filter. Each item includes `tag` field.
- `POST /api/prescout/photos` accepts optional `tag` in `multipart/form-data`; stored as-is (null if omitted).
- `GET /api/prescout/photos/[id]?gameId=<id>` returns full record including `photo_data` and `tag`.
- `photos/[id]` routes require `gameId` query param to resolve which per-game table to query.

**Components:**
- `src/app/team-view/components/PrescoutSection.js` — collapsible key-value table; shown on `/team-view` (read-only) and `/compare` (per-team).
- `src/app/team-view/components/PhotoGallery.js` — modal gallery with lightbox; used on `/scout-leads` entry cards and `/scout-leads/prescout/` form page. `readOnly` prop controls delete/upload UI.
- `src/app/team-view/components/TaggedPhotoGrid.js` — config-driven horizontally scrollable photo row for one tag; driven by `display.teamView.photoSections`; renders inline on `/team-view` at configured placements. Fetches photo data immediately on mount.
- `src/app/components/LightboxModal.js` — reusable fullscreen image lightbox; used by both `PhotoGallery` and `TaggedPhotoGrid`.

See `README.md` — "Prescout Data & Photo Gallery" section for full API reference, spreadsheet layout, config structure, and page integration table.

### imageSelect Field Type & Field Images

`imageSelect` renders selectable options positioned over a background image (e.g., field map with starting positions). Stores a single INTEGER value like `singleSelect`.

**Per-game DB table:** `fieldimages_<gameName>` — `image_tag VARCHAR(100) UNIQUE`, `image_data TEXT` (base64), `mime_type`, `uploaded_by`, `uploaded_at`. Created alongside scouting tables in `createGame()`, dropped in `deleteGame()`. Table name generated by `sanitizeFieldImagesTableName()` in `schema-generator.js`.

**Config field properties:** `imageTag` (required string, references uploaded image), `optionLayout` (optional: `{ top: "<CSS string>", distribution: "even" }` — `distribution` only supports `"even"` currently; other values warn), `options` (array of `{ value, label }`), `required` (bool).

**Admin upload:** After game creation, the `/admin/games` page detects `imageSelect` fields and shows an "Image Assets" section with upload buttons per `imageTag`. Uses `POST /api/admin/field-images`. Auth note: the `/api/admin/field-images` routes use `validateAuthToken` (any valid session), not admin password — the admin password gate is at the page level, not the API level.

**Form component:** `src/app/form-components/ImageSelect.js` — fetches image via `GET /api/field-images?gameId=<id>&tag=<tag>` (requires both `gameId` and `tag` from the component; the API itself makes `gameId` optional with active-game fallback). Caches response in sessionStorage. Falls back to plain `SingleSelect` if image is unavailable. Uses hidden `<input type="radio">` for `processFormData()` compatibility.

**Display:** `display.teamView.sections.<key>.imageSelectDisplay[]` — each entry `{ field, label, valueMapping }` uses `bucketSingleSelectField()` in `display-engine.js` for aggregation. Rendered as alternating-color percentage boxes in team-view.

### Display Config Validation

`src/lib/display-config-validation.js` validates at runtime that display config keys are internally consistent (e.g., `matchView.piecePlacement.bars[*].key` must exist in `apiAggregation.alliancePiecePlacement[*].key`). Failures show a config error panel instead of broken UI.

### PPR (Peddie Power Rating) — `usePPR` Config Flag

Setting `usePPR: true` in the top-level game config JSON activates OPR-based scoring (TBA data) instead of scouting EPA across all display pages.

**How it works:**
- OPR is computed server-side via `src/lib/opr-service.js`, which fetches played matches from TBA and solves the least-squares system in `src/lib/opr-calculator.js`.
- A short in-memory cache (60 s) in `opr-service.js` prevents redundant TBA HTTP requests per request cycle.
- `opr-service.js` also reads/writes an OPR blacklist (excluded match keys) from `opr_settings_<gameName>` DB table via `getOprBlacklist` / `saveOprBlacklist`.

**Exported functions from `opr-service.js`:**
- `getTeamOPRMap(activeGame)` — full-event OPR: `Map<teamNumber, opr>`
- `getLast3OPRMap(activeGame)` — adjusted-contribution last-3: for each team, estimates their per-match contribution as `allianceScore − sum(teammates' full-event OPR)`, averages the 3 most recent.
- `getPPROverTime(activeGame, teamNumber)` — per-match adjusted contributions for Q matches only: `[{match, epa}]` used for the "PPR Over Time" chart in team-view.
- `getTBAMatches(tbaEventCode)` — cached TBA fetch (internal helper, also exported).

**API injection points:**
- `GET /api/get-team-data` — overrides `avgEpa`, `last3Epa`, and `epaOverTime`; preserves scouting `autoOverTime`/`teleOverTime`.
- `GET /api/get-alliance-data` — overrides `avgEpa` and `last3Epa` per team.
- `POST /api/compute-picklist` — injects PPR into `realEpa`/`realEpa3`, re-normalizes `epa`/`epa3` to 0–1 against new PPR max, then recomputes the weighted score using the same formula as `computePicklistMetrics`. Weights remain fully functional.

**Front-end label behavior:**
- All pages check `config?.usePPR` to rename "EPA" → "PPR" in user-visible labels (chart titles, column headers, stat labels, sudo table).
- Config JSON labels for games with `usePPR: true` should use "PPR" / "3 PPR" directly (see `rebuilt_2026.json`).

**`computeOPR` in `opr-calculator.js`:**
- Accepts optional `lambda` (Tikhonov regularization) parameter (default 0 — no change to existing callers).
- PPR uses the adjusted-contribution method for last-3 and over-time charts, so regularization is not needed in normal operation.

**TBA event code:** read from `activeGame.tba_event_code` or `config.tbaEventCode`. `TBA_AUTH_KEY` env var required.

### Betting System — `enableBetting` Config Flag

Setting `enableBetting: true` in the top-level game config JSON activates the match outcome betting system. `tbaEventCode` must also be set.

**Per-game DB table:** `betting_<gameName>` — created in `createGame()`, dropped in `deleteGame()`. Schema: `scoutname`, `scoutteam`, `match`, `matchtype`, `alliance` (`'red'`/`'blue'`), `red_win_prob`, `blue_win_prob`, `points_wagered` (win reward), `points_if_loss` (default 25), `status` (`'pending'`/`'won'`/`'lost'`), `points_earned`, `placed_at`, `resolved_at`. UNIQUE on `(scoutname, scoutteam, match, matchtype)`. `ensureBettingTable()` in `betting.js` creates it lazily on first bet if missing.

**Points formula (asymmetric):** Win reward = `max(1, round(1000 * e^(-5.3 * chosenAllianceWinProb)))` — exponential curve: ~948 at 1%, ~266 at 25%, ~71 at 50%, ~19 at 75%, ~5 at 99%. Loss penalty = flat **25 points**. Win → `+pointsIfWin`, loss → `-25`. Balance = `SUM(points_earned)` (derived, not stored). Both values stored per bet (`points_wagered` = win reward, `points_if_loss` = loss penalty).

**Statbotics:** predictions fetched from `https://api.statbotics.io/v3/match/{eventCode}_qm{matchNumber}` — no API key. 60 s in-memory cache per match key. Bets can only be placed when `matchStatus === 'Upcoming'`; attempting to bet on an in-progress or completed match returns 409. Bet resolution is triggered automatically on `GET /api/betting/leaderboard` via `resolveCompletedBets()`.

**Form integration (`src/app/page.js`):** when `enableBetting: true`, `BettingSection` renders between the basics block and the dynamic form. The dynamic form is dimmed (`opacity: 0.4`, `pointerEvents: none`) until the scout places a bet or abstains (X button). If the form is interacted with first, `window.__lockBetting()` fires, locking the betting card and unlocking the form.

**NavBar:** `/betting` link is always present in `NavBar.js`; the page itself shows a "not enabled" message when the config flag is absent.

**Key files:**
- `src/lib/betting.js` — service layer (Statbotics fetch, bet CRUD, leaderboard, resolution)
- `src/app/form-components/BettingSection.js` — client component on scouting form
- `src/app/betting/page.js` — leaderboard page (light mode)
- `src/lib/schema-generator.js` — `sanitizeBettingTableName()`

See `README.md` — "Betting System" section for full API reference, points formula, and config details.

### webpack Config Note

`next.config.js` aliases `bcrypt` and `@neondatabase/serverless` to mock modules on the client side to prevent bundling server-only packages into the browser bundle. API routes are excluded from this via `null-loader`.