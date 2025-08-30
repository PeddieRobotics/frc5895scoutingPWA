# Config Driven Scouting App

This project now builds all scouting forms and displays from a single configuration file.  Non‑developers can modify the form structure, validation and the way data appears simply by editing [`src/config/formConfig.json`](src/config/formConfig.json) – no code changes required.

## Getting Started

```bash
npm install
npm run dev
```

## Editing the Form

`formConfig.json` describes the match information section, how many teams are entered at once, and the fields for each team.  Example:

```json
{
  "teamsCount": 3,
  "matchInfo": [
    {"type": "text", "label": "Scout Name", "name": "scoutname"},
    {"type": "number", "label": "Match #", "name": "match"}
  ],
  "teamFields": [
    {"type": "number", "label": "Team", "name": "team"},
    {"type": "checkbox", "label": "No Show", "name": "noShow"},
    {"type": "comment", "label": "General Comments", "name": "generalComments"}
  ]
}
```

Field types supported:

| type        | description                                      |
|-------------|--------------------------------------------------|
| `text`      | single‑line text input                           |
| `number`    | numeric text box                                 |
| `checkbox`  | boolean toggle                                   |
| `qualitative` | star rating component                          |
| `comment`   | multi‑line comment box                           |
| `select`    | drop‑down list (`options` array required)        |
| `singleSelect` | radio button group (e.g., Endgame stage)     |
| `multiSelect`  | multiple checkboxes (e.g., Intake)           |

Optional properties:

* `default` – starting value
* `dependsOn` – name of another field that must be truthy for the field to appear (useful for conditional comment boxes)

Endgame (single select):

```json
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
}
```

Post‑Match Intake (multi select):

```json
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
}
```

After editing and saving the configuration file, run the app again – the form and submission logic update automatically. The Home page renders Endgame and Intake directly from the config; the confirmation dialog uses the same config for labels; and the QR payload includes a form type marker.

Setup page and theme storage:

- Visit `/setup` to create/select a theme and set the event name/code and target data table. Themes are stored in the `year_themes` DB table.
- The active theme controls:
  - Which DB table is used for all API queries (no hardcoded table names)
  - The Blue Alliance event code used for API calls
  - The form config JSON used to render inputs and summaries

## Displaying Data

Pages that consume submitted data also reference the same configuration so that any changes in `formConfig.json` automatically flow to the UI.  If you add a new field to `teamFields`, it will automatically appear in team and match views without touching the code.

Example – adding a drop‑down:

```json
{
  "type": "select",
  "label": "Starting Position",
  "name": "startPos",
  "options": [
    {"label": "Left", "value": "L"},
    {"label": "Center", "value": "C"},
    {"label": "Right", "value": "R"}
  ]
}
```

Insert the object above into `teamFields` and the new question shows up on the form and in all display pages automatically.

QR and Scanner:

- The config‑driven qualification form emits JSON QR with `formType: "dynamic"` and payload `{match, teams}`; the scanner now recognizes this format and merges match fields into each team before uploading.
- The standard match form QR is unchanged and continues to work.

Data tables:

- API routes now look up the active table from the active theme (via `/api/themes/active`) and query it dynamically. This removes all remaining hard-coded table names (previously `cmptx2025`).

## Contributing

1. Edit `src/config/formConfig.json` to add, remove, or reorder fields.
2. Run `npm run lint` to ensure the project builds.
3. Submit a pull request.
