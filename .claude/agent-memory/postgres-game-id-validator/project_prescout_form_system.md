---
name: Prescout Form System Architecture
description: prescoutform_<gameName> table pattern, audit findings for the new config-driven prescout form feature
type: project
---

New `prescoutform_<gameName>` per-game table added for the config-driven prescout form submission system.

**Why:** Feature audited in April 2026. Recording for future validation context.

**How to apply:** When auditing prescout-form-related code, use this as the baseline.

## Table
- `prescoutform_<gameName>` — per-game table; created in `createGame()`, dropped in `deleteGame()`, lazy-created via `ensurePrescoutFormTable()` in form/route.js
- Schema: `id SERIAL PK, team_number INTEGER UNIQUE, data JSONB, submitted_by VARCHAR(100), submitted_at TIMESTAMP, updated_at TIMESTAMP`
- `sanitizePrescoutFormTableName()` in schema-generator.js uses prefix `prescoutform_`

## API Routes
- `GET /api/prescout/form?team=<num>&gameId=<id>` — returns prescout form data for a team; auth: any token
- `POST /api/prescout/form` — upsert prescout form data; body: `{teamNumber, gameId?, data: [{field,value},...]}` auth: any token

## Auth / submittedBy (resolved)
Prior audit flagged that POST was destructuring `scoutName`/`scoutTeam` from `validateAuthToken()`, which only returns `{ isValid, teamName, error }`.
This was fixed: current POST handler correctly destructures `teamName` and assigns `submittedBy = teamName || null`. No longer an issue.

## Merge-Logic Race Condition (open, non-blocking)
The SELECT → merge → upsert sequence in POST is NOT wrapped in a transaction and uses no row lock.
Two concurrent submissions for the same team can both read the same stale row, independently merge, and the second write silently overwrites the first write's fields with stale data.
This is a last-write-wins race, not a crash — acceptable for low-traffic FRC use, but worth noting.
Fix (if needed): wrap in `BEGIN ... COMMIT` with `SELECT ... FOR UPDATE` on the existing row to serialize concurrent writers.

## Auth Pattern Changes (upload/route.js and teams/route.js)
- Both routes changed from admin-cookie auth to `validateAuthToken` (any authenticated scout).
- This is a deliberate downgrade in privilege — previously admin-only, now open to all scouts.
- The `prescout/route.js` DELETE still uses `validateAdminAuth()` (correct).
- Upload now validates `gameName` against `game_configs` before creating orphan tables (good).
