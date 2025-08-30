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

Optional properties:

* `default` – starting value
* `dependsOn` – name of another field that must be truthy for the field to appear (useful for conditional comment boxes)

After editing and saving the configuration file, run the app again – the form and submission logic update automatically.

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

## Contributing

1. Edit `src/config/formConfig.json` to add, remove, or reorder fields.
2. Run `npm run lint` to ensure the project builds.
3. Submit a pull request.

