---
name: Prescout Data & Photo Gallery Feature
description: Documents the prescout/photo system — per-game DB tables, API routes, config-driven form, auth changes, and page integration (updated April 2026)
type: project
---

Prescout data and photo gallery were added as non-config-driven features in March 2026. In April 2026, the shared tables were replaced with per-game tables. In April 2026 (later), photo tagging was added. In April 2026 (latest), a config-driven prescout form was added at `/scout-leads/prescout/`, and the upload page was moved out of admin.

**DB tables (per-game, created in `createGame()`, dropped in `deleteGame()`):**
- `prescout_<gameName>` — spreadsheet upload data; `team_number UNIQUE`, `data` JSONB, `uploaded_at`; table name from `sanitizePrescoutTableName()`
- `prescoutform_<gameName>` — config-driven form data; `team_number UNIQUE`, `data` JSONB, `submitted_by`, `submitted_at`, `updated_at`; table name from `sanitizePrescoutFormTableName()`; also created lazily by the form API route
- `photos_<gameName>` — `team_number`, `photo_data TEXT`, `mime_type`, `uploaded_by`, `tag VARCHAR(100)` (nullable), `uploaded_at`; migrated into existing tables via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS tag`

**Config-driven prescout form (added April 2026; extended April 2026):**
- `prescout` is an optional top-level config key with `sections[]` (each has `id`, `header`, optional `description`, `fields[]`).
- Field types for prescout form: `singleSelect`, `comment`, `starRating`, `checkbox`, `multiSelect`.
- `starRating` in prescout defaults to 5 stars (not 6 as in the scouting form).
- Data stored as `[{field, value}]` arrays using the field `label` as key; `singleSelect` stored as option label string (not numeric value).
- **`hasOther`** (boolean, `singleSelect` only): adds an "Other" tile; typed value stored as-is as the display string.
- **`showWhen`** (`{ field, equals }` or `{ field, notEquals }`): conditional visibility on a field; references must be preceding fields. Hidden fields excluded from submission; cleared when controlling field changes.
- **Field-level merge on POST**: `POST /api/prescout/form` reads existing row before upserting. Fields not included in the submission are preserved; submitted fields overwrite matching existing fields. Prevents data loss from concurrent edits.
- API: `GET /api/prescout/form?team&gameId` → `{data, submittedBy, submittedAt, updatedAt}`; `POST /api/prescout/form {teamNumber, gameId, data}` → field-level-merge upsert.
- Page at `/scout-leads/prescout/` — any authenticated user; pre-populates existing data; includes `PhotoGallery` for the loaded team.
- If no `prescout` key in config, form page shows informational message + upload link (does not error out).
- `config-validator.js` validates `hasOther` is boolean, `showWhen.field` exists and references a preceding field.

**Auth changes (April 2026):**
- `/api/prescout/upload` switched from admin-only to any-auth (`validateAuthToken`).
- `/api/prescout/teams` switched from admin-only to any-auth.
- Upload page moved from `/admin/prescout` to `/scout-leads/prescout/upload`; old URL redirects.
- `DELETE /api/prescout?gameName=` still requires admin auth.

**Display page data fetching (updated):**
- `/team-view` and `/compare` dual-fetch from both `/api/prescout/form` and `/api/prescout` in parallel. Form data takes priority; spreadsheet data is fallback. Both render via `PrescoutSection` using same `[{field, value}]` format.

**Photo tagging:**
- `photoTags` is an optional top-level config key: array of `{ name, emoji, color }`.
- Gallery on `/scout-leads` shows tag pill selector. `display.teamView.photoSections` renders `TaggedPhotoGrid` inline on `/team-view`. `display.compare.photoTag` renders one `TaggedPhotoGrid` per team on `/compare`.
- Supported photoSection placements: `"aboveEpaChart"`, `"sections.auto.afterImageSelect"`.

**Page integration (current):**
- `/team-view`: `PrescoutSection` (form data priority) + config-driven `TaggedPhotoGrid` rows
- `/compare`: `PrescoutSection` (form data priority) per team; `TaggedPhotoGrid` if `display.compare.photoTag` set
- `/scout-leads`: standalone **Gallery section** + `PhotoGallery` per entry card
- `/scout-leads/prescout/`: config-driven prescout form + `PhotoGallery` for loaded team
- `/scout-leads/prescout/upload`: spreadsheet upload/view/clear (any auth)
- `/admin/prescout`: redirects to `/scout-leads/prescout/upload`

**Key behavioral nuances:**
- `photos/[id]` GET and DELETE routes require `?gameId=<id>` query param.
- Spreadsheet sheet name must be exactly `"Prescout"` (case-sensitive). Transposed layout.
- `xlsx` (SheetJS) package used for server-side parse.
- `prescoutform_<gameName>` is safe to call on games created before the feature existed (lazy creation).

**Why:** Prescout form replaces the admin-only spreadsheet workflow for structured per-team data collection. Scouts can now fill out and edit prescout data from their phones during pit scouting.

**How to apply:** When reviewing docs, note that prescout has two data sources (form + spreadsheet), with form taking priority on display pages. Upload/teams routes are no longer admin-only.
