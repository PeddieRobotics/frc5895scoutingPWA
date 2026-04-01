---
name: Prescout Data & Photo Gallery Feature
description: Documents the prescout/photo feature added in early 2026 — DB tables, API routes, components, and page integration
type: project
---

Prescout data and photo gallery were added as non-config-driven features in March 2026.

**DB tables (auto-created):** `prescout_data` (JSONB per-team data, scoped by `game_name`) and `team_photos` (base64 images, multiple per team).

**Key behavioral nuances:**
- Prescout is scoped to `game_name` — not to the active game ID at runtime. Switching games surfaces different prescout data.
- Photos have no access control beyond "any authenticated user" — any scout can upload or delete any photo.
- Spreadsheet must have a sheet named exactly `"Prescout"` (case-sensitive). Transposed layout: row 0 = team numbers, col 0 = field names.
- `xlsx` (SheetJS) package added as a dependency for server-side parse.

**Page integration:** `/team-view` and `/compare` show PrescoutSection + PhotoGallery (read-only); `/scout-leads` shows PhotoGallery with upload/delete; `/admin/prescout` is the upload/clear admin UI.

**Why:** Non-config-driven because prescout data shape varies per event and is imported externally, not collected via the scouting form.

**How to apply:** When reviewing or updating docs, note that prescout/photo are app-level features independent of the game config JSON — document them separately from the config reference sections.
