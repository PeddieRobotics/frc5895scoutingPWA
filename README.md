# Config-Driven Scouting (Theme-Based)

The app is now fully theme-driven. The active form layout and all views (team-view, match-view, picklist, etc.) are controlled by the currently active “theme”. Themes are stored in the database table `year_themes`. You create and activate themes from the in-app Setup page — no code edits needed.

Important: `src/config/formConfig.json` is a template/example. Copy/paste it into the Setup page when creating a theme. The app reads the active theme’s config from the database at runtime.

## Quick Start

```bash
npm install
npm run dev
```

Then open https://frc5895.app/setup to create your first theme.

## How Themes Work

- Active theme: Exactly one theme can be active at a time. Its config drives the form UI and how data is interpreted in all pages.
- Storage: Themes are rows in the `year_themes` table with columns like `year`, `theme_name`, `event_code`, `event_name`, `event_table`, `config`, `is_active`.
- Event table: When you create or activate a theme, the app automatically ensures the backing data table (`event_table`) exists with columns derived from your JSON (plus baked fields). No manual SQL is needed.
- Runtime source of truth: The app fetches the active theme from `/api/themes/active` and uses `item.config` for dynamic rendering. The file `src/config/formConfig.json` is only a sample.

## Create or Switch a Theme (non‑technical)

1. Open `/setup` in the app.
2. Fill in:
   - Year, Theme Name.
   - Event Code (e.g., TBA code like `2025mil`) and Display Event Name (optional).
   - Event Table: a simple name using letters/numbers/underscore only (example: `cmptx2025`).
3. Paste your JSON config (or copy from `src/config/formConfig.json`).
4. Click “Save and Activate” to make it the active theme. This also creates the event table if it doesn’t exist.

Notes:
- You can also “Save” without activating to draft a theme.
- Switching the active theme immediately updates the form and dependent views.
- To edit the form mid‑event, create a new theme with the updated config. If you want to keep writing to the same table, reuse the same `event_table` value.

## Config JSON Schema (what you paste in Setup)

Top-level keys:

- Baked pre‑match fields on the form: `scoutname`, `match`, `team`, `noshow` (do not include these in JSON).
- `teamsCount`: Number of teams (used by qual/QR helper; optional).
- `sections`: `{ auto: boolean, tele: boolean }` to toggle sections.
- `autoFields`, `teleFields`: arrays of fields for those phases (e.g., `{ type: 'checkbox', label: 'Leave', name: 'leave' }`).
- `counters.auto`, `counters.tele`: groups of Success/Fail counters; each row `{ label, success, fail? }` creates INT columns.
- `endgame`: singleSelect definition; saves to `endgame.name`.
- `postMatchIntake`: multiSelect options; each `{ label, name }` becomes a BOOLEAN column.
- `teamFields`: optional extra fields for analytics/views.
- `sortField`, `commentFields`: optional helpers for summaries/QR.

Supported field types:

- text: single‑line input
- number: numeric input
- checkbox: true/false toggle
- qualitative: 1–6 rating component
- comment: multi‑line text
- select: drop‑down (requires `options`)
- singleSelect: radio group (for Endgame)
- multiSelect: multiple checkboxes (for Intake)

Common field options:

- `label`: Human‑readable field label.
- `name`: Internal key used to store the value.
- `default`: Optional default value.
- `dependsOn`: Optional; show only if another boolean field is true (useful for conditional comment boxes like breakdown/defense notes).

Example config (copy/paste into Setup):

```json
{
  "teamsCount": 3,
  "sections": { "auto": true, "tele": true },
  "autoFields": [
    { "type": "checkbox", "label": "Leave", "name": "leave" }
  ],
  "teleFields": [
    { "type": "comment", "label": "General Comments", "name": "generalcomments" }
  ],
  "counters": {
    "auto": [
      { "title": "Coral", "rows": [
        { "label": "L4", "success": "autol4success", "fail": "autol4fail" },
        { "label": "L3", "success": "autol3success", "fail": "autol3fail" },
        { "label": "L2", "success": "autol2success", "fail": "autol2fail" },
        { "label": "L1", "success": "autol1success", "fail": "autol1fail" }
      ]}
    ],
    "tele": [
      { "title": "Coral", "rows": [
        { "label": "L4", "success": "telel4success", "fail": "telel4fail" },
        { "label": "L3", "success": "telel3success", "fail": "telel3fail" },
        { "label": "L2", "success": "telel2success", "fail": "telel2fail" },
        { "label": "L1", "success": "telel1success", "fail": "telel1fail" }
      ]}
    ]
  },
  "endgame": {
    "type": "singleSelect",
    "label": "Stage Placement",
    "name": "stageplacement",
    "options": [
      { "label": "None", "value": 0 },
      { "label": "Park", "value": 1 },
      { "label": "Fail + Park", "value": 2 },
      { "label": "Shallow Cage", "value": 3 },
      { "label": "Deep Cage", "value": 4 }
    ],
    "default": 0
  },
  "postMatchIntake": {
    "type": "multiSelect",
    "label": "Intake Capabilities",
    "options": [
      { "label": "Coral Ground", "name": "coralgrndintake" },
      { "label": "Coral Station", "name": "coralstationintake" },
      { "label": "Algae Ground", "name": "algaegrndintake" },
      { "label": "Algae High Reef", "name": "algaehighreefintake" },
      { "label": "Algae Low Reef", "name": "algaelowreefintake" }
    ]
  },
  "teamFields": [
    { "type": "qualitative", "label": "Defense Played", "name": "defenseplayed" }
  ],
  "sortField": "defenseplayed",
  "commentFields": ["generalcomments"]
}
```

Endgame note: The UI stores your selection under the configured `endgame.name` (typically `stageplacement`). No extra columns are added automatically — if you change the name in JSON, the column will be created/used with that name when the theme is (re)activated.

## Where Data Goes

- All submissions write to the active theme’s `event_table`.
- The app creates/updates table columns from your JSON (plus baked fields), then writes only those columns.
- Team-view and match-view render summaries based on the active config.
- Switching the active theme immediately updates the UI and target table.

## Notes

- Baked pre‑match fields are always present on the form: `scoutname`, `match`, `team`, `noshow`.
- Make “Leave” or other toggles appear by adding them to `autoFields` or `teleFields`.
- Add “Breakdown” by adding two items to `teleFields` (or your preferred section):
  - `{ "type": "checkbox", "label": "Broke down?", "name": "breakdown" }`
  - `{ "type": "comment", "label": "Breakdown Comments", "name": "breakdowncomments", "dependsOn": "breakdown" }`
- Rename or remove counters by editing `counters.auto/tele` rows. If a row doesn’t need a fail column, omit `fail`.
- To pick which sections appear, set `sections.auto` / `sections.tele` to true/false.
- Re‑activate the theme after JSON changes so the event table picks up any new/renamed columns.

## Troubleshooting

- “No active theme configured”: Go to `/setup` and Activate a theme.
- “Invalid eventTable”: Use only letters, numbers, and underscores (e.g., `pookie2025`).
- Submit error (500): Activate the theme again to ensure the event table exists/updates to your JSON.
- Authentication errors (401) on data pages: Log in again when prompted; some routes require a team session.

## Tips for Non‑Developers

- Keep a copy of your JSON config in a safe place. To roll back, paste the previous JSON into a new theme and activate it.
- To test changes without affecting live data, create a theme with a different `event_table`, activate it, and try a few submissions. Switch back when done.

## Contributing

- The source template lives at `src/config/formConfig.json` for convenience, but the app uses the active theme’s config from the database at runtime.
- PRs that improve the Setup UX, validation, or documentation are welcome.
