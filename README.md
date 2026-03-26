## Getting Started

First, install the dependencies:

```bash
npm install
```

Next, configure the game collection JSON configuration file at /admin/games

Please note that the PostgreSQL database keys, as well as ADMIN_PASSWORD must be defined in environment variables.

Required environment variables:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `ADMIN_PASSWORD` — Admin panel password

Optional environment variables:
- `TBA_AUTH_KEY` — The Blue Alliance API key (required when `usePPR: true` is set in the game config to enable the OPR Rankings sidebar). Obtain from https://www.thebluealliance.com/account

---

# JSON Game Configuration Guide

This guide documents how to build and validate JSON game configurations for form rendering, calculations, and all display pages.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start Template](#quick-start-template)
3. [Top-Level Structure](#top-level-structure)
4. [The Basics Section](#the-basics-section)
5. [Sections](#sections)
6. [Field Types (Complete Reference)](#field-types-complete-reference)
   - [checkbox](#checkbox)
   - [counter](#counter)
   - [number](#number)
   - [holdTimer](#holdtimer)
   - [text](#text)
   - [comment](#comment)
   - [singleSelect](#singleselect)
   - [multiSelect](#multiselect)
   - [starRating](#starrating)
   - [qualitative](#qualitative)
   - [table](#table)
   - [collapsible](#collapsible)
7. [Database Column Definitions](#database-column-definitions)
8. [Conditional Visibility (showWhen)](#conditional-visibility-showwhen)
9. [Calculations](#calculations)
10. [Display Configuration](#display-configuration)
   - [Display Quick Start](#display-quick-start)
   - [Required Display Keys](#required-display-keys)
   - [Team View Configuration](#team-view-configuration)
   - [Match View Configuration](#match-view-configuration)
   - [Picklist Configuration](#picklist-configuration)
   - [Compare Configuration](#compare-configuration)
   - [API Aggregation Configuration](#api-aggregation-configuration)
   - [Display Troubleshooting](#display-troubleshooting)
11. [Reserved Field Names](#reserved-field-names)
12. [Validation & Common Errors](#validation--common-errors)
13. [Complete Example](#complete-example)
14. [Best Practices](#best-practices)
15. [Scout Leads Timer Workflow](#scout-leads-timer-workflow)
16. [Scoring Requirements](#scoring-requirements)
17. [OPR Rankings Sidebar](#opr-rankings-sidebar)
18. [Acknowledgements](#acknowledgements)

---

## Overview

The JSON configuration system allows you to define scouting forms without writing any code. Each JSON file describes:

- **What fields appear on the form** (checkboxes, counters, dropdowns, etc.)
- **How fields are organized** (sections like Auto, Tele, Endgame)
- **What database columns are created** (automatic table generation)
- **What scout-lead timer-rate columns are created** (automatic `scoutleads_*` table generation from `holdTimer` fields)
- **How points are calculated** (EPA formulas for auto, tele, endgame)
- **How data is displayed** (team view, match view, charts)

When you create a new game configuration and activate it, the system automatically:
1. Validates your JSON for errors
2. Creates a scouting table (`scouting_<game>`) with all form data columns
3. Creates a scout-leads table (`scoutleads_<game>`) with one per-second rate column for each `holdTimer` field
4. Renders the scouting form based on your configuration
5. Calculates EPA scores using your formulas

---

## Quick Start Template

Copy this minimal template to get started quickly:

```json
{
  "gameName": "my_game_2025",
  "displayName": "My Game 2025",
  "formTitle": "Team Scouter",
  "version": "1.0",

  "basics": {
    "fields": [
      {
        "type": "checkbox",
        "name": "noshow",
        "label": "No Show",
        "hidesForm": true,
        "dbColumn": { "type": "BOOLEAN", "default": false }
      }
    ]
  },

  "sections": [
    {
      "id": "auto",
      "header": "Auto",
      "showWhen": { "field": "noshow", "equals": false },
      "fields": [
        {
          "type": "checkbox",
          "name": "leave",
          "label": "Left Starting Zone",
          "dbColumn": { "type": "BOOLEAN", "default": false }
        },
        {
          "type": "counter",
          "name": "autoscore",
          "label": "Auto Scores",
          "dbColumn": { "type": "INTEGER", "default": 0 }
        }
      ]
    },
    {
      "id": "tele",
      "header": "Teleop",
      "showWhen": { "field": "noshow", "equals": false },
      "fields": [
        {
          "type": "counter",
          "name": "telescore",
          "label": "Teleop Scores",
          "dbColumn": { "type": "INTEGER", "default": 0 }
        },
        {
          "type": "holdTimer",
          "name": "defensetime",
          "label": "Defense Time",
          "buttonLabel": "Hold While Defending",
          "precision": 2,
          "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 },
          "scoutLeads": {
            "rateLabel": "Stops per second",
            "defaultRate": 0,
            "placeholder": "e.g. 0.75"
          }
        },
        {
          "type": "comment",
          "name": "generalcomments",
          "label": "Comments",
          "dbColumn": { "type": "TEXT", "default": null }
        }
      ]
    },
    {
      "id": "endgame",
      "header": "Endgame",
      "showWhen": { "field": "noshow", "equals": false },
      "fields": [
        {
          "type": "singleSelect",
          "name": "endlocation",
          "label": "Final Position",
          "dbColumn": { "type": "INTEGER", "default": 0 },
          "options": [
            { "value": 0, "label": "None", "default": true },
            { "value": 1, "label": "Parked" },
            { "value": 2, "label": "Climbed" }
          ]
        }
      ]
    }
  ],

  "calculations": {
    "auto": {
      "formula": "autoscore*5 + (leave?3:0)",
      "fields": ["autoscore", "leave"]
    },
    "tele": {
      "formula": "telescore*2",
      "fields": ["telescore"]
    },
    "end": {
      "type": "mapping",
      "field": "endlocation",
      "mapping": {
        "0": 0,
        "1": 2,
        "2": 10
      }
    }
  }
}
```

---

## Top-Level Structure

Every configuration file must have these top-level properties:

### Required Properties

| Property | Type | Description | Constraints |
|----------|------|-------------|-------------|
| `gameName` | string | Unique identifier for the game (used as database table name) | 3-100 characters, only letters, numbers, underscores, hyphens, spaces |
| `displayName` | string | Human-readable name shown in the UI | Max 200 characters |

### Optional Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `formTitle` | string | Title shown at the top of the scouting form | `displayName` |
| `version` | string | Version number for tracking changes | None |
| `tbaEventCode` | string | TBA event code (e.g. `"2026njski"`); used by `/api/get-tba-rank` and the OPR Rankings sidebar | None |
| `usePPR` | boolean | If `true`, shows the OPR Rankings sidebar on `/scout-leads`. Requires `tbaEventCode` to be set and `TBA_AUTH_KEY` env var configured | `false` |
| `basics` | object | Pre-match fields (like "No Show") | None |
| `sections` | array | Main form sections (Auto, Tele, etc.) | Required for form |
| `calculations` | object | EPA point calculation formulas | None |
| `display` | object | Configuration for team/match views | None |

### Example

```json
{
  "gameName": "reefscape_2025",
  "displayName": "REEFSCAPE 2025",
  "tbaEventCode": "2026rebu",
  "formTitle": "5895 SKOUTER",
  "version": "1.0",
  "basics": { ... },
  "sections": [ ... ],
  "calculations": { ... },
  "display": { ... }
}
```

---

## The Basics Section

The `basics` section defines fields that appear at the very top of the form, before any sections. This is typically used for the "No Show" checkbox that can hide the rest of the form.

### Structure

```json
{
  "basics": {
    "description": "Optional description text",
    "fields": [
      { ... field definitions ... }
    ]
  }
}
```

### Special Property: `hidesForm`

When a field in basics has `"hidesForm": true`, checking that field will hide all sections. This is how the "No Show" functionality works:

```json
{
  "type": "checkbox",
  "name": "noshow",
  "label": "No Show",
  "hidesForm": true,
  "dbColumn": { "type": "BOOLEAN", "default": false }
}
```

When `noshow` is checked:
- All sections with `showWhen: { "field": "noshow", "equals": false }` will be hidden
- Only the basics section remains visible
- The form can still be submitted (recording that the robot didn't show up)

---

## Sections

Sections are the main organizational units of your form. Each section groups related fields together under a header.

### Section Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Recommended | Unique identifier for the section |
| `header` | string | Yes | Display name shown as section header |
| `description` | string | No | Optional descriptive text |
| `fields` | array | Yes | Array of field definitions |
| `showWhen` | object | No | Conditional visibility rule |
| `hidden` | boolean | No | If true, section is not rendered but fields still exist in DB |

### Example Section

```json
{
  "id": "auto",
  "header": "Autonomous",
  "description": "Fields for the autonomous period",
  "showWhen": { "field": "noshow", "equals": false },
  "fields": [
    { "type": "checkbox", "name": "leave", "label": "Left Zone", "dbColumn": { "type": "BOOLEAN", "default": false } },
    { "type": "counter", "name": "autoscore", "label": "Auto Scores", "dbColumn": { "type": "INTEGER", "default": 0 } }
  ]
}
```

### Hidden Sections

If you have fields that should exist in the database but not show on the main form (like qualitative ratings that are added later), use `"hidden": true`:

```json
{
  "id": "qualitative",
  "header": "Qualitative Ratings",
  "hidden": true,
  "description": "These fields are for internal tracking and not shown on the main form",
  "fields": [
    { "type": "starRating", "name": "speed", "label": "Speed Rating", "max": 6, "dbColumn": { "type": "INTEGER", "default": null } }
  ]
}
```

---

## Field Types (Complete Reference)

This section documents **every field type** available in the configuration system.

---

### checkbox

A simple true/false toggle.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"checkbox"` |
| `name` | string | Yes | Database column name (lowercase, no spaces) |
| `label` | string | Yes | Display label next to checkbox |
| `dbColumn` | object | Yes | Database column configuration |
| `hidesForm` | boolean | No | If true, hides form sections when checked |
| `scoringRequirement` | object | No | Excludes scouting rows from scoring when the field value doesn't match `requiredValue`. See [Scoring Requirements](#scoring-requirements). |

**Database Type:** `BOOLEAN`

**Example:**

```json
{
  "type": "checkbox",
  "name": "breakdown",
  "label": "Robot Broke Down?",
  "dbColumn": { "type": "BOOLEAN", "default": false }
}
```

**Renders as:** A checkbox with a label. When checked, stores `true`. When unchecked, stores `false`.

---

### counter

A numeric counter with increment (+) and decrement (-) buttons. The value cannot go below 0.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"counter"` |
| `name` | string | Yes | Database column name |
| `label` | string | No | Display label (if not in a table) |
| `subHeader` | string | No | Small header above the counter |
| `variant` | string | No | Visual style: `"Success"`, `"Fail"`, or `"Counter"` |
| `quickButtons` | array | No | Optional quick-action buttons for larger increments/decrements |
| `dbColumn` | object | Yes | Database column configuration |

**Database Type:** `INTEGER`

**Example (standalone):**

```json
{
  "type": "counter",
  "name": "algaeremoved",
  "subHeader": "Algae Removed",
  "variant": "Counter",
  "dbColumn": { "type": "INTEGER", "default": 0 }
}
```

**Example (in a table):**

```json
{
  "type": "counter",
  "name": "autol4success",
  "variant": "Success",
  "dbColumn": { "type": "INTEGER", "default": 0 }
}
```

**Variants explained:**
- `"Success"` - Green styling, typically for successful actions
- `"Fail"` - Red styling, typically for failed attempts
- `"Counter"` - Neutral styling

**Renders as:** A number display with - and + buttons on either side. Starts at 0.

#### Quick Buttons (Optional)

Counters support optional `quickButtons` for rapid data entry with larger increments or decrements. This is useful during fast-paced matches where scouts need to add values like +5 or +10 quickly.

**Quick Button Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | integer | Yes | Amount to add (positive) or subtract (negative) |
| `label` | string | Yes | Display text on the button (e.g., "+5", "-10") |
| `position` | string | Yes | `"left"` or `"right"` of the main counter controls |
| `style` | string | No | Optional CSS class name for custom styling |

**Example with quick buttons:**

```json
{
  "type": "counter",
  "name": "autoscore",
  "label": "Auto Scores",
  "variant": "Success",
  "quickButtons": [
    { "value": -5, "label": "-5", "position": "left" },
    { "value": 5, "label": "+5", "position": "right" },
    { "value": 10, "label": "+10", "position": "right" }
  ],
  "dbColumn": { "type": "INTEGER", "default": 0 }
}
```

**Layout:** Left-positioned buttons appear before the main -/+1 controls; right-positioned buttons appear after. The counter value is clamped to min/max bounds. Buttons are touch-friendly (minimum 44px touch targets) and responsive on smaller screens.

**Note:** Counters without `quickButtons` continue to work exactly as before with just the standard -1/+1 buttons.

---

### number

A numeric input field where users type a number directly.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"number"` |
| `name` | string | Yes | Database column name |
| `label` | string | Yes | Display label |
| `min` | number | No | Minimum allowed value |
| `max` | number | No | Maximum allowed value |
| `step` | number | No | Increment step (default: 1) |
| `dbColumn` | object | Yes | Database column configuration |

**Database Type:** `INTEGER` or `NUMERIC`

**Example:**

```json
{
  "type": "number",
  "name": "startingposition",
  "label": "Starting Position (1-3)",
  "min": 1,
  "max": 3,
  "dbColumn": { "type": "INTEGER", "default": 1 }
}
```

**Renders as:** A standard number input field with optional up/down arrows.

---

### holdTimer

A press-and-hold timer field designed for mobile scouting. Scouts hold a button while an action is happening; elapsed time accumulates in seconds.

This field also powers the `/scout-leads` workflow: every `holdTimer` creates a matching rate column in `scoutleads_<game>` so scout leads can enter a configurable "something per second" value.

Important behavior:
- Timer seconds are stored in the scouting table.
- Scoring/display APIs convert those seconds into scored amounts using scout-leads average balls/sec for that exact team+match+matchtype.
- Scoring pages should not display raw timer-seconds as scoring output.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"holdTimer"` |
| `name` | string | Yes | Database column name for stored seconds |
| `label` | string | Yes | Display label on the scouting form |
| `buttonLabel` | string | No | Custom text for the hold button |
| `buttonColor` | string | No | CSS color for the idle hold button (e.g. `"#2da44e"`). Defaults to blue (`#1f6feb`). Does not affect the active/holding red state. |
| `inline` | boolean | No | When `true`, consecutive `inline` holdTimers in the same section render side-by-side in a flex row instead of stacking. See [Side-by-Side Layout](#hold-timer-side-by-side-layout). |
| `precision` | integer | No | Decimal places shown on form (0-4, default 2) |
| `min` | number | No | Minimum allowed seconds (default 0) |
| `max` | number | No | Maximum allowed seconds |
| `dbColumn` | object | Yes | Scouting table column config (recommended `NUMERIC`) |
| `scoutLeads` | object | No | Config for `/scout-leads` per-second input |

**`scoutLeads` object:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `rateLabel` | string | No | Label shown on the rate input on `/scout-leads` |
| `placeholder` | string | No | Placeholder text shown on `/scout-leads` input |
| `defaultRate` | number | No | Optional UI default/prefill for scout-leads entry |
| `dbColumn` | object | No | DB config for the scout-leads rate column |
| `group` | string | No | Group key — fields sharing the same `group` value are combined into a single rate card on `/scout-leads` |
| `groupLabel` | string | No | Human-readable title for the combined group card (defaults to the `group` key value if omitted) |

**Database Types:**
- Scouting table column: recommended `NUMERIC(10,3)`
- Scout-leads table column: recommended `NUMERIC(10,4)`

**Example (ungrouped):**

```json
{
  "type": "holdTimer",
  "name": "defensetime",
  "label": "Defense Time",
  "buttonLabel": "Hold While Defending",
  "precision": 2,
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 },
  "scoutLeads": {
    "rateLabel": "Stops per second",
    "placeholder": "e.g. 0.75",
    "defaultRate": 0,
    "dbColumn": { "type": "NUMERIC(10,4)", "default": 0 }
  }
}
```

**Example (grouped — two fields share one rate card):**

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
},
{
  "type": "holdTimer",
  "name": "telefuelsuccess",
  "label": "Tele Fuel (s)",
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 },
  "scoutLeads": {
    "rateLabel": "Balls / Second",
    "group": "Fuel",
    "groupLabel": "Fuel Scoring",
    "dbColumn": { "type": "NUMERIC(10,4)", "default": 0 }
  }
}
```

**Renders as:** A live seconds display, hold button, and clear button. Releasing the button commits elapsed time.

**Example (custom button color):**

```json
{
  "type": "holdTimer",
  "name": "defensetime",
  "label": "Defense Time",
  "buttonLabel": "Hold While Defending",
  "buttonColor": "#8250df",
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 }
}
```

#### Hold Timer Side-by-Side Layout

When `"inline": true` is set on consecutive holdTimer fields within the same section, they render in a flex row side-by-side instead of stacking vertically. Their recording lists also appear side-by-side below each timer. On narrow screens the row wraps to a single column automatically.

```json
{
  "type": "holdTimer",
  "name": "autofuel",
  "label": "Auto Fuel (s)",
  "buttonLabel": "Hold While Shooting",
  "buttonColor": "#1f6feb",
  "inline": true,
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 }
},
{
  "type": "holdTimer",
  "name": "autopass",
  "label": "Auto Pass (s)",
  "buttonLabel": "Hold While Passing",
  "buttonColor": "#2da44e",
  "inline": true,
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 }
}
```

Notes:
- Only consecutive `holdTimer` fields with `inline: true` are grouped — other field types between them break the group.
- A single `inline: true` field with no inline neighbors just renders full-width.
- `inline` has no effect on the database schema or `/scout-leads` display.

---

### text

A single-line text input field.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"text"` |
| `name` | string | Yes | Database column name |
| `label` | string | Yes | Display label |
| `placeholder` | string | No | Placeholder text |
| `maxLength` | number | No | Maximum character length |
| `dbColumn` | object | Yes | Database column configuration |

**Database Type:** `VARCHAR(255)` or `TEXT`

**Example:**

```json
{
  "type": "text",
  "name": "robotname",
  "label": "Robot Nickname",
  "placeholder": "Enter nickname...",
  "maxLength": 50,
  "dbColumn": { "type": "VARCHAR(50)", "default": null }
}
```

**Renders as:** A single-line text input.

---

### comment

A multi-line text area for longer comments.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"comment"` |
| `name` | string | Yes | Database column name |
| `label` | string | Yes | Display label |
| `placeholder` | string | No | Placeholder text |
| `rows` | number | No | Number of visible text rows |
| `dbColumn` | object | Yes | Database column configuration |

**Database Type:** `TEXT`

**Example:**

```json
{
  "type": "comment",
  "name": "generalcomments",
  "label": "General Comments",
  "placeholder": "Any observations about the robot's performance...",
  "dbColumn": { "type": "TEXT", "default": null }
}
```

**Renders as:** A multi-line text area that can expand.

---

### singleSelect

A dropdown or radio button group where only ONE option can be selected.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"singleSelect"` |
| `name` | string | Yes | Database column name |
| `label` | string | Yes | Display label |
| `formName` | string | No | Alternative form field name |
| `options` | array | Yes | Array of option objects |
| `dbColumn` | object | Yes | Database column configuration |

**Option Object Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | number/string | Yes | Value stored in database |
| `label` | string | Yes | Display text |
| `default` | boolean | No | If true, this is the default selection |

**Database Type:** `INTEGER` (recommended for option values)

**Example:**

```json
{
  "type": "singleSelect",
  "name": "endlocation",
  "label": "Endgame Position",
  "dbColumn": { "type": "INTEGER", "default": 0 },
  "options": [
    { "value": 0, "label": "None", "default": true },
    { "value": 1, "label": "Parked" },
    { "value": 2, "label": "Failed Climb" },
    { "value": 3, "label": "Shallow Climb" },
    { "value": 4, "label": "Deep Climb" }
  ]
}
```

**Renders as:** A set of radio buttons or a dropdown menu. Exactly one option is always selected.

**Important:** Always include a default option (usually the first one with `"default": true`).

---

### multiSelect

A group of checkboxes where MULTIPLE options can be selected. **Each option becomes its own database column.**

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"multiSelect"` |
| `name` | string | No | Group identifier (not a column) |
| `subHeader` | string | No | Header text above the options |
| `options` | array | Yes | Array of option objects |

**Option Object Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Database column name for this option |
| `label` | string | Yes | Display text next to checkbox |
| `dbColumn` | object | Yes | Database column configuration |

**Database Type:** Each option creates a `BOOLEAN` column

**Example:**

```json
{
  "type": "multiSelect",
  "subHeader": "Intake Capabilities",
  "name": "intakeOptions",
  "options": [
    { "name": "coralgrndintake", "label": "Coral Ground", "dbColumn": { "type": "BOOLEAN", "default": false } },
    { "name": "coralstationintake", "label": "Coral Station", "dbColumn": { "type": "BOOLEAN", "default": false } },
    { "name": "algaegrndintake", "label": "Algae Ground", "dbColumn": { "type": "BOOLEAN", "default": false } },
    { "name": "algaereefintake", "label": "Algae Reef", "dbColumn": { "type": "BOOLEAN", "default": false } }
  ]
}
```

**Renders as:** Multiple checkboxes. Each checkbox is independent.

**Database columns created:** `coralgrndintake`, `coralstationintake`, `algaegrndintake`, `algaereefintake` (all BOOLEAN)

---

### starRating

A star-based rating system (1-N stars).

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"starRating"` |
| `name` | string | Yes | Database column name |
| `label` | string | Yes | Display label |
| `description` | string | No | Tooltip or helper text |
| `minWhenVisible` | number | No | Minimum rating required when visible |
| `inverted` | boolean | No | If true, lower is better (affects display coloring) |
| `isConfidenceRating` | boolean | No | Marks this field as the primary color controller for the `/scout-leads` entries section background. Supported on `starRating`/`qualitative` (red→green gradient) and `checkbox` (boolean ratio, see `invertColor`). At most one field per config. |
| `dbColumn` | object | Yes | Database column configuration |

> **Star ratings are always out of 6.** The `Qualitative` component renders exactly 6 stars for both `starRating` and `qualitative` field types. Do not add a `max` property — it is not used by the component, the form, or any display/calculation logic.

**Database Type:** `INTEGER`

**Example:**

```json
{
  "type": "starRating",
  "name": "driverskill",
  "label": "Driver Skill",
  "description": "How well the driver controlled the robot",
  "max": 6,
  "dbColumn": { "type": "INTEGER", "default": null }
}
```

**Example (inverted rating - lower is better):**

```json
{
  "type": "starRating",
  "name": "aggression",
  "label": "Aggression",
  "description": "How aggressive/dangerous the robot is (lower is safer)",
  "max": 6,
  "inverted": true,
  "dbColumn": { "type": "INTEGER", "default": null }
}
```

**Renders as:** Clickable stars. User clicks to select rating (1 to max).

**About `minWhenVisible`:** Use this inside collapsible sections to require a rating when the section is expanded. Example: If defense is checked, require a defense rating.


---

### qualitative

Identical to `starRating` - an alias for the same component. Use whichever name is more descriptive for your use case.

---

### table

A structured table layout for organizing counters in rows and columns. Ideal for scoring grids (like coral levels with success/fail columns).

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"table"` |
| `id` | string | No | Identifier for the table |
| `subHeader` | string | No | Header text above the table |
| `columns` | array | No | Column header labels |
| `rows` | array | Yes | Array of row definitions |

**Row Object Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `label` | string | Yes | Row label (displayed in first column) |
| `fields` | array | Yes | Array of field definitions for this row |

**Example:**

```json
{
  "type": "table",
  "id": "autoCoralTable",
  "subHeader": "Coral Scoring",
  "columns": ["", "Success", "Fail", ""],
  "rows": [
    {
      "label": "L4",
      "fields": [
        { "type": "counter", "name": "autol4success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
        { "type": "counter", "name": "autol4fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
      ]
    },
    {
      "label": "L3",
      "fields": [
        { "type": "counter", "name": "autol3success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
        { "type": "counter", "name": "autol3fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
      ]
    },
    {
      "label": "L2",
      "fields": [
        { "type": "counter", "name": "autol2success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
        { "type": "counter", "name": "autol2fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
      ]
    },
    {
      "label": "L1",
      "fields": [
        { "type": "counter", "name": "autol1success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
        { "type": "counter", "name": "autol1fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
      ]
    }
  ]
}
```

**Renders as:** A table with row labels on the left and counter buttons in each cell. The `columns` array provides header text.

**Why empty strings in columns?** The columns array `["", "Success", "Fail", ""]` creates: empty column (for row label), "Success" header, "Fail" header, empty column (for spacing). Adjust based on your needs.

---

### collapsible

A section that expands/collapses based on a trigger field (usually a checkbox). Perfect for optional sections like "Defense" or "Breakdown" that only need details when applicable.

**Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Must be `"collapsible"` |
| `id` | string | No | Identifier for the collapsible |
| `trigger` | object | Yes | Field definition that controls visibility |
| `content` | array | Yes | Array of fields shown when expanded |

**Example:**

```json
{
  "type": "collapsible",
  "id": "defenseSection",
  "trigger": {
    "type": "checkbox",
    "name": "defense",
    "label": "Playing Defense?",
    "dbColumn": { "type": "BOOLEAN", "default": false }
  },
  "content": [
    {
      "type": "comment",
      "name": "defensecomments",
      "label": "Defense Details",
      "dbColumn": { "type": "TEXT", "default": null }
    },
    {
      "type": "starRating",
      "name": "defensequality",
      "label": "Defense Quality",
      "max": 6,
      "minWhenVisible": 1,
      "dbColumn": { "type": "INTEGER", "default": null }
    }
  ]
}
```

**Renders as:**
- Initially: Just the checkbox "Playing Defense?"
- When checked: The checkbox plus all content fields appear below it

**Use `minWhenVisible`:** Add `"minWhenVisible": 1` to star ratings inside collapsibles to require a rating when the section is visible.

---

## Database Column Definitions

Every field that stores data needs a `dbColumn` property that defines how it's stored in the database.

### dbColumn Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | PostgreSQL data type |
| `default` | any | Yes | Default value for the column |

### Common Database Types

| Type | Use For | Example Default |
|------|---------|-----------------|
| `BOOLEAN` | Checkboxes, true/false | `false` |
| `INTEGER` | Counters, ratings, numeric selections | `0` or `null` |
| `TEXT` | Comments, long text | `null` |
| `VARCHAR(n)` | Short text with max length | `null` |
| `NUMERIC` | Decimal numbers (timer seconds, per-second rates) | `0` |

### Examples

```json
// Boolean (checkbox)
"dbColumn": { "type": "BOOLEAN", "default": false }

// Integer with 0 default (counters)
"dbColumn": { "type": "INTEGER", "default": 0 }

// Integer with null default (optional ratings)
"dbColumn": { "type": "INTEGER", "default": null }

// Text (comments)
"dbColumn": { "type": "TEXT", "default": null }

// Limited text
"dbColumn": { "type": "VARCHAR(255)", "default": null }
```

### When to Use `null` vs a Value

- **Use `0` for counters:** They should start at 0
- **Use `false` for checkboxes:** They should start unchecked
- **Use `null` for optional fields:** Comments and ratings that may not be filled
- **Use `0` for singleSelect:** The first option (usually "None") typically has value 0

---

## Conditional Visibility (showWhen)

The `showWhen` property lets you show or hide sections based on another field's value. This is essential for the "No Show" functionality.

### Structure

```json
{
  "showWhen": {
    "field": "fieldname",
    "equals": value
  }
}
```

### Example: Hide Everything When No-Show

```json
// In basics section:
{
  "type": "checkbox",
  "name": "noshow",
  "label": "No Show",
  "hidesForm": true,
  "dbColumn": { "type": "BOOLEAN", "default": false }
}

// Each section references this:
{
  "id": "auto",
  "header": "Auto",
  "showWhen": { "field": "noshow", "equals": false },
  "fields": [ ... ]
}
```

**How it works:**
- When `noshow` is `false` (unchecked), sections with `showWhen.equals: false` are **shown**
- When `noshow` is `true` (checked), those sections are **hidden**

### Other Use Cases

You could use `showWhen` for other conditional logic:

```json
// Show advanced options only when a checkbox is checked
{
  "id": "advancedSection",
  "header": "Advanced Metrics",
  "showWhen": { "field": "showadvanced", "equals": true },
  "fields": [ ... ]
}
```

---

## Calculations

The `calculations` object defines how EPA (Expected Points Added) scores are computed. These calculations are used in team views and analytics.

### Calculation Types

There are two types of calculations:

1. **Formula-based:** Mathematical expression using field values
2. **Mapping-based:** Lookup table that maps field values to point values

### Formula-Based Calculations

```json
{
  "calculations": {
    "auto": {
      "formula": "autol1success*3 + autol2success*4 + autol3success*6 + autol4success*7 + (leave?3:0)",
      "fields": ["autol1success", "autol2success", "autol3success", "autol4success", "leave"]
    }
  }
}
```

**Formula Syntax:**
- `fieldname` - References the field value
- `+`, `-`, `*`, `/` - Basic math operations
- `(condition?trueValue:falseValue)` - Ternary operator for booleans
- Parentheses for grouping

**The `fields` Array:** Lists all fields used in the formula. This helps the system know which database columns to query.

**Examples of Formulas:**

```json
// Simple scoring
"formula": "autoscore*5"

// Multiple levels with different point values
"formula": "l1success*2 + l2success*3 + l3success*4 + l4success*5"

// Boolean bonus (ternary)
"formula": "(leave?3:0)"

// Combined
"formula": "autol4success*7 + autol3success*6 + autol2success*4 + autol1success*3 + (leave?3:0)"
```

### Mapping-Based Calculations

For single-select fields where each option has a specific point value:

```json
{
  "calculations": {
    "end": {
      "type": "mapping",
      "field": "endlocation",
      "mapping": {
        "0": 0,
        "1": 2,
        "2": 2,
        "3": 6,
        "4": 12
      }
    }
  }
}
```

**Mapping Explanation:**
- `"0": 0` - If endlocation is 0 (None), award 0 points
- `"1": 2` - If endlocation is 1 (Park), award 2 points
- `"2": 2` - If endlocation is 2 (Fail + Park), award 2 points
- `"3": 6` - If endlocation is 3 (Shallow Cage), award 6 points
- `"4": 12` - If endlocation is 4 (Deep Cage), award 12 points

### Standard Calculation Names

The system expects these calculation names for EPA breakdown:
- `auto` - Autonomous period points
- `tele` - Teleop period points
- `end` - Endgame points

Total EPA is computed as: `auto + tele + end`

### Full Calculations Example

```json
{
  "calculations": {
    "auto": {
      "formula": "autol1success*3 + autol2success*4 + autol3success*6 + autol4success*7 + autoprocessorsuccess*6 + autonetsuccess*4 + (leave?3:0)",
      "fields": ["autol1success", "autol2success", "autol3success", "autol4success", "autoprocessorsuccess", "autonetsuccess", "leave"]
    },
    "tele": {
      "formula": "telel1success*2 + telel2success*3 + telel3success*4 + telel4success*5 + teleprocessorsuccess*6 + telenetsuccess*4 + hpsuccess*2",
      "fields": ["telel1success", "telel2success", "telel3success", "telel4success", "teleprocessorsuccess", "telenetsuccess", "hpsuccess"]
    },
    "end": {
      "type": "mapping",
      "field": "endlocation",
      "mapping": {
        "0": 0,
        "1": 2,
        "2": 2,
        "3": 6,
        "4": 12
      }
    }
  }
}
```

---

## Display Configuration

The `display` object controls all non-form pages (`team-view`, `match-view`, `picklist`, `compare`) and the backend aggregation those pages consume.

### Display Quick Start

Use this top-level shape:

```json
{
  "display": {
    "teamView": { ... },
    "matchView": { ... },
    "picklist": { ... },
    "compare": { ... },
    "apiAggregation": { ... }
  }
}
```

### Required Display Keys

These keys are runtime-validated. If they are missing or mismatched, display pages show a config error panel with exact paths instead of rendering incorrect data.

- `display.teamView.piecePlacement.bars` (non-empty array)
- `display.teamView.endgamePie.labels` and `display.teamView.endgamePie.values` (same length)
- `display.apiAggregation.endgameConfig.valueMapping` (must include every team-view endgame value)
- `display.matchView.piecePlacement.bars` (non-empty array)
- `display.apiAggregation.alliancePiecePlacement` (non-empty array)
- Every `display.matchView.piecePlacement.bars[*].key` must exist in `display.apiAggregation.alliancePiecePlacement[*].key`
- `display.matchView.endgamePie.labels` and `display.matchView.endgamePie.keys` (same length)
- Every `display.matchView.endgamePie.keys[*]` must exist in `display.apiAggregation.endgameConfig.valueMapping` values

### Team View Configuration

Key responsibilities:
- EPA summary breakdown and thresholds
- Per-team piece placement bars
- Endgame distribution chart
- Comments, intake capability display, qualitative metrics

```json
{
  "teamView": {
    "epaBreakdown": ["auto", "tele", "end"],
    "epaThresholds": { "overall": 12, "auto": 6, "tele": 10, "end": 6 },
    "piecePlacement": {
      "bars": [
        { "label": "L4", "autoField": "autol4success", "teleField": "telel4success" },
        { "label": "Fuel", "autoField": "auto.avgFuel", "teleField": "tele.avgFuel" }
      ]
    },
    "endgamePie": {
      "labels": ["None", "Park", "Shallow", "Deep"],
      "values": [0, 1, 3, 4]
    },
    "commentFields": [
      { "field": "generalcomments", "dataKey": "generalComments", "title": "General Comments" }
    ],
    "intakeDisplay": [
      { "category": "Intake", "fields": ["coralgrndintake"], "labels": ["Ground"] }
    ],
    "qualitativeDisplay": [
      { "name": "coralspeed", "label": "Coral Speed" }
    ]
  }
}
```

Notes:
- `piecePlacement.bars[*].autoField` and `teleField` can be:
  - raw form fields (for example `autol4success`)
  - computed dotted paths from aggregated output (for example `auto.avgFuel`)
- Use `commentFields` instead of legacy `comments` when possible.

#### `autoPie` — singleSelect outcome distribution chart

You can display a pie chart for any `singleSelect` field in the auto section by adding an `autoPie` key to `teamView`. The engine supports **any number of such pie charts** for singleSelect fields using the same pattern.

```json
"autoPie": {
  "field": "autoclimb",
  "labels": ["None", "L1", "Failed"],
  "values": [0, 1, 2]
}
```

- `field`: the singleSelect form field name (must match a field in `sections`)
- `labels`: display labels for the pie slices (same order as `values`)
- `values`: the numeric option values from the singleSelect field
- The corresponding `apiAggregation.autoclimbConfig` entry (same structure as `endgameConfig`) must be provided to map numeric values to canonical string keys used by the chart

#### `sections[phase].charts` — chart types

The `sections.auto.charts` and `sections.tele.charts` arrays support these chart `type` values:

| `type` | Description |
|--------|-------------|
| `epaLine` | EPA/score over time line chart. `dataKey` is the API response field (e.g. `autoOverTime`); `label` is derived automatically. |
| `passLine` | Balls-passed-over-time line chart for holdTimer pass fields. Requires `dataKey` (API response key, e.g. `autoPassOverTime`) and `valueKey` (the DB column name, e.g. `autopasssuccess`). |
| `coralLine` / `groupLine` | Stacked line chart for coral/groupLevel fields. Requires `coralConfig` in `piecePlacement`. |

Example `passLine` chart entry:
```json
{
  "type": "passLine",
  "label": "Auto Passes Over Time",
  "dataKey": "autoPassOverTime",
  "valueKey": "autopasssuccess"
}
```

### Match View Configuration

Key responsibilities:
- Alliance-level piece placement bars
- Alliance endgame breakdown
- Qualitative radar/bar inputs
- Ranking point color blocks

```json
{
  "matchView": {
    "epaBreakdown": ["auto", "tele", "end"],
    "piecePlacement": {
      "bars": [
        { "label": "L4", "key": "L4" },
        { "label": "HP", "key": "HP" }
      ]
    },
    "endgamePie": {
      "labels": ["None", "Fail", "Park", "Shallow", "Deep"],
      "keys": ["none", "fail", "park", "shallow", "deep"]
    },
    "qualitativeFields": ["defenseplayed", "maneuverability"],
    "defenseBarField": "defenseplayed",
    "rankingPoints": [
      {
        "label": "Auto",
        "type": "allLeaveAndCoral",
        "leaveField": "leave",
        "coralFields": ["autol1success", "autol2success"],
        "minCoral": 1
      },
      {
        "label": "Coral",
        "type": "levelThreshold",
        "levels": [
          { "key": "L1", "threshold": 2 },
          { "key": "L2", "threshold": 2 }
        ],
        "greenCount": 2,
        "yellowCount": 1
      }
    ]
  }
}
```

Supported ranking point `type` values:
- `allLeaveAndCoral`
- `allFieldsAndThreshold`
- `levelThreshold`
- `endgameThreshold`

### Picklist Configuration

Key responsibilities:
- Weight sliders
- Display table columns
- Optional computed metrics
- Scatter plot axes

```json
{
  "picklist": {
    "weights": [
      { "key": "epa", "label": "EPA", "default": 1.0 },
      { "key": "consistency", "label": "Cnstcy", "default": 0.8 }
    ],
    "tableColumns": [
      { "key": "realEpa", "label": "EPA", "colorScale": "epa", "format": "one" },
      { "key": "breakdown", "label": "Break %", "colorScale": "inverse", "format": "breakdownPercent" }
    ],
    "computedMetrics": [
      {
        "key": "fuelAccuracy",
        "type": "successRate",
        "successFields": ["autofuelsuccess", "telefuelsuccess"],
        "failFields": ["autofuelfail", "telefuelfail"]
      }
    ],
    "scatterPlot": {
      "xAxis": { "label": "Fuel", "fields": ["autofuelsuccess", "telefuelsuccess"] },
      "yAxis": { "label": "Attempts", "fields": ["autofuelsuccess", "autofuelfail", "telefuelsuccess", "telefuelfail"] }
    },
    "defenseField": "defenseplayed"
  }
}
```

### Compare Configuration

Key responsibilities:
- Multi-team bar comparisons
- Scoring expression chart
- Endgame comparison chart

```json
{
  "compare": {
    "metricsChart": [
      { "key": "avgEpa", "label": "EPA" },
      { "key": "avgAuto", "label": "Auto" }
    ],
    "scoringChart": [
      { "key": "coral", "label": "Coral", "compute": "auto.coral.total + tele.coral.total" }
    ],
    "endgameChart": {
      "metrics": ["None", "Park", "Deep"],
      "keys": ["none", "park", "deep"],
      "endgameSource": "endPlacement",
      "fallbackSource": "endgame"
    },
    "defenseField": "defenseplayed"
  }
}
```

### API Aggregation Configuration

This section drives backend aggregation for team, alliance, picklist, and compare pages.

```json
{
  "apiAggregation": {
    "breakdownField": "breakdown",
    "defenseField": "defense",
    "leaveField": "leave",
    "successFailPairs": [
      { "phase": "tele", "key": "Hp", "successField": "hpsuccess", "failField": "hpfail" }
    ],
    "booleanFields": ["noshow", "leave", "breakdown"],
    "textFields": ["scoutname", "generalcomments"],
    "qualitativeFields": ["maneuverability", "defenseplayed"],
    "booleanIntakeFields": ["coralgrndintake"],
    "endgameConfig": {
      "field": "endlocation",
      "valueMapping": { "0": "none", "1": "park", "2": "fail", "3": "shallow", "4": "deep" }
    },
    "alliancePiecePlacement": [
      { "key": "L4", "fields": ["autol4success", "telel4success"] },
      { "key": "HP", "fields": ["hpsuccess"] }
    ]
  }
}
```

Field notes:
- `breakdownField`: field used by consistency and breakdown calculations
- `defenseField`: field used for defense participation rates
- `endgameConfig.valueMapping`: canonical names used by endgame charts — same structure can be used for any singleSelect field distribution chart
- `autoclimbConfig`: optional — same structure as `endgameConfig`, drives `autoPie` distribution in team-view for any auto singleSelect field. For example: `{ "field": "autoclimb", "valueMapping": { "0": "none", "1": "l1", "2": "failed" } }`
- `alliancePiecePlacement`: source mapping for `matchView.piecePlacement.bars[*].key`
- `successFailPairs[*].failField`: can be `null` for fields with no corresponding fail counter (e.g. passing timers); success rate will show 100% when the field has data

### Display Troubleshooting

If form submission works but display pages are wrong, check in this order:

1. Verify every display field reference exists in `sections` or is a valid computed dotted path where supported.
2. Verify `teamView.endgamePie.values` codes map to `apiAggregation.endgameConfig.valueMapping` keys.
3. Verify `matchView.piecePlacement.bars[*].key` values match `apiAggregation.alliancePiecePlacement[*].key`.
4. Verify `matchView.endgamePie.keys` values match `apiAggregation.endgameConfig.valueMapping` values.
5. Confirm `apiAggregation` field names match the actual stored DB column names (spelling/casing).

---


## Reserved Field Names

The following field names are **reserved** and cannot be used in your configuration:

| Reserved Name | Reason |
|---------------|--------|
| `id` | Auto-generated primary key |
| `scoutname` | Scout's name (system field) |
| `scoutteam` | Scout's team number (system field) |
| `team` | Team being scouted (system field) |
| `match` | Match number (system field) |
| `matchtype` | Type of match (system field) |
| `timestamp` | When the record was created |

**These are automatically added to every table** - you don't need to define them.

If you try to use a reserved name, validation will fail with an error.

---

## Validation & Common Errors

When you upload a configuration, it goes through validation. Here are common errors and how to fix them:

### Error: "gameName is required"
**Fix:** Add a `gameName` property to your top-level object.

### Error: "gameName can only contain letters, numbers, underscores, hyphens, and spaces"
**Fix:** Remove special characters from gameName. Use only: `a-z`, `A-Z`, `0-9`, `_`, `-`, spaces.

### Error: "Field name 'X' is reserved"
**Fix:** Choose a different name. Avoid: id, scoutname, scoutteam, team, match, matchtype, timestamp.

### Error: "Duplicate field name: X"
**Fix:** Each field name must be unique across the entire configuration. Rename one of the duplicates.

### Error: "Invalid field type: X"
**Fix:** Use one of the valid types: `checkbox`, `counter`, `number`, `holdTimer`, `text`, `comment`, `singleSelect`, `multiSelect`, `starRating`, `qualitative`, `table`, `collapsible`.

### Error: "holdTimer scoutLeads must be an object"
**Fix:** If you include `scoutLeads`, define it as an object:
```json
"scoutLeads": { "rateLabel": "Something per second", "defaultRate": 0 }
```

### Warning: "holdTimer dbColumn.type should be NUMERIC, DECIMAL, or INTEGER"
**Fix:** Use a numeric DB type for timer seconds, e.g.:
```json
"dbColumn": { "type": "NUMERIC(10,3)", "default": 0 }
```

### Warning: "holdTimer scoutLeads.group should be a string"
**Fix:** `group` must be a plain string key shared between the fields you want to combine:
```json
"scoutLeads": { "group": "Fuel", "groupLabel": "Fuel Scoring" }
```

### Warning: "holdTimer scoutLeads.groupLabel should be a string"
**Fix:** `groupLabel` is the display title shown on the combined group card. Use a plain string:
```json
"scoutLeads": { "group": "Fuel", "groupLabel": "Fuel Scoring" }
```

### Error: "Table field requires rows"
**Fix:** Add a `rows` array to your table field.

### Error: "Collapsible field requires a trigger"
**Fix:** Add a `trigger` object (usually a checkbox) to your collapsible field.

### Error: "SingleSelect field requires options"
**Fix:** Add an `options` array with at least one option.

### Warning: "SingleSelect has no default option"
**Fix:** Add `"default": true` to one of your options (usually the first one).

### Error: "MultiSelect option X is missing a name"
**Fix:** Each option in a multiSelect needs its own `name` property.

### Error: "showWhen.field is required"
**Fix:** The `showWhen` object needs a `field` property specifying which field to check.

---

## Complete Example

Here is a **complete, working configuration** for reference (REEFSCAPE 2025):

```json
{
  "gameName": "reefscape_2025",
  "displayName": "REEFSCAPE 2025",
  "formTitle": "5895 SKOUTER",
  "version": "1.0",

  "basics": {
    "description": "Pre-match fields displayed at the top of the form",
    "fields": [
      {
        "type": "checkbox",
        "name": "noshow",
        "label": "No Show",
        "hidesForm": true,
        "dbColumn": { "type": "BOOLEAN", "default": false }
      }
    ]
  },

  "sections": [
    {
      "id": "auto",
      "header": "Auto",
      "showWhen": { "field": "noshow", "equals": false },
      "fields": [
        {
          "type": "checkbox",
          "name": "leave",
          "label": "Leave",
          "dbColumn": { "type": "BOOLEAN", "default": false }
        },
        {
          "type": "table",
          "id": "autoCoralTable",
          "subHeader": "Coral",
          "columns": ["", "Success", "Fail", ""],
          "rows": [
            {
              "label": "L4",
              "fields": [
                { "type": "counter", "name": "autol4success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "autol4fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            },
            {
              "label": "L3",
              "fields": [
                { "type": "counter", "name": "autol3success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "autol3fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            },
            {
              "label": "L2",
              "fields": [
                { "type": "counter", "name": "autol2success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "autol2fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            },
            {
              "label": "L1",
              "fields": [
                { "type": "counter", "name": "autol1success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "autol1fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            }
          ]
        },
        {
          "type": "counter",
          "name": "autoalgaeremoved",
          "subHeader": "Algae Removed",
          "variant": "Counter",
          "dbColumn": { "type": "INTEGER", "default": 0 }
        }
      ]
    },
    {
      "id": "tele",
      "header": "Tele",
      "showWhen": { "field": "noshow", "equals": false },
      "fields": [
        {
          "type": "table",
          "id": "teleCoralTable",
          "subHeader": "Coral",
          "columns": ["", "Success", "Fail", ""],
          "rows": [
            {
              "label": "L4",
              "fields": [
                { "type": "counter", "name": "telel4success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "telel4fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            },
            {
              "label": "L3",
              "fields": [
                { "type": "counter", "name": "telel3success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "telel3fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            },
            {
              "label": "L2",
              "fields": [
                { "type": "counter", "name": "telel2success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "telel2fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            },
            {
              "label": "L1",
              "fields": [
                { "type": "counter", "name": "telel1success", "variant": "Success", "dbColumn": { "type": "INTEGER", "default": 0 } },
                { "type": "counter", "name": "telel1fail", "variant": "Fail", "dbColumn": { "type": "INTEGER", "default": 0 } }
              ]
            }
          ]
        },
        {
          "type": "comment",
          "name": "generalcomments",
          "label": "General Comments",
          "dbColumn": { "type": "TEXT", "default": null }
        },
        {
          "type": "collapsible",
          "id": "defenseSection",
          "trigger": {
            "type": "checkbox",
            "name": "defense",
            "label": "Playing Defense?",
            "dbColumn": { "type": "BOOLEAN", "default": false }
          },
          "content": [
            {
              "type": "comment",
              "name": "defensecomments",
              "label": "Defense Elaboration",
              "dbColumn": { "type": "TEXT", "default": null }
            },
            {
              "type": "starRating",
              "name": "defenseplayed",
              "label": "Defense Played",
              "description": "Ability to Play Defense",
              "max": 6,
              "minWhenVisible": 1,
              "dbColumn": { "type": "INTEGER", "default": null }
            }
          ]
        }
      ]
    },
    {
      "id": "endgame",
      "header": "Endgame",
      "showWhen": { "field": "noshow", "equals": false },
      "fields": [
        {
          "type": "singleSelect",
          "name": "endlocation",
          "label": "Stage Placement",
          "dbColumn": { "type": "INTEGER", "default": 0 },
          "options": [
            { "value": 0, "label": "None", "default": true },
            { "value": 1, "label": "Park" },
            { "value": 2, "label": "Fail + Park" },
            { "value": 3, "label": "Shallow Cage" },
            { "value": 4, "label": "Deep Cage" }
          ]
        }
      ]
    },
    {
      "id": "postMatch",
      "header": "Post-Match",
      "showWhen": { "field": "noshow", "equals": false },
      "fields": [
        {
          "type": "multiSelect",
          "subHeader": "Intake",
          "name": "intakeOptions",
          "options": [
            { "name": "coralgrndintake", "label": "Coral Ground", "dbColumn": { "type": "BOOLEAN", "default": false } },
            { "name": "coralstationintake", "label": "Coral Station", "dbColumn": { "type": "BOOLEAN", "default": false } },
            { "name": "algaegrndintake", "label": "Algae Ground", "dbColumn": { "type": "BOOLEAN", "default": false } },
            { "name": "algaehighreefintake", "label": "Algae High Reef", "dbColumn": { "type": "BOOLEAN", "default": false } },
            { "name": "algaelowreefintake", "label": "Algae Low Reef", "dbColumn": { "type": "BOOLEAN", "default": false } }
          ]
        },
        {
          "type": "collapsible",
          "id": "breakdownSection",
          "trigger": {
            "type": "checkbox",
            "name": "breakdown",
            "label": "Broke down?",
            "dbColumn": { "type": "BOOLEAN", "default": false }
          },
          "content": [
            {
              "type": "comment",
              "name": "breakdowncomments",
              "label": "Breakdown Elaboration",
              "dbColumn": { "type": "TEXT", "default": null }
            }
          ]
        }
      ]
    }
  ],

  "calculations": {
    "auto": {
      "formula": "autol1success*3 + autol2success*4 + autol3success*6 + autol4success*7 + (leave?3:0)",
      "fields": ["autol1success", "autol2success", "autol3success", "autol4success", "leave"]
    },
    "tele": {
      "formula": "telel1success*2 + telel2success*3 + telel3success*4 + telel4success*5",
      "fields": ["telel1success", "telel2success", "telel3success", "telel4success"]
    },
    "end": {
      "type": "mapping",
      "field": "endlocation",
      "mapping": {
        "0": 0,
        "1": 2,
        "2": 2,
        "3": 6,
        "4": 12
      }
    }
  }
}
```

---

## Best Practices

### Naming Conventions

1. **gameName:** Use lowercase with underscores: `reefscape_2025`, `crescendo_2024`
2. **Field names:** Use lowercase, no spaces: `autol4success`, `coralgrndintake`
3. **Be consistent:** If you use `l4` for level 4, don't switch to `level4` elsewhere

### Organization

1. **Follow the match flow:** Auto → Tele → Endgame → Post-Match
2. **Group related fields:** Put all coral scoring together, all algae together
3. **Use tables for repetitive patterns:** Scoring levels, success/fail pairs
4. **Use collapsibles for optional sections:** Defense, breakdowns

### Point Values

1. **Match the official game manual:** Verify point values against FRC rules
2. **Include all scoring opportunities:** Don't forget bonuses like leaving in auto
3. **Test your formulas:** Create a spreadsheet to verify calculations

### User Experience

1. **Minimize taps:** Use counters instead of number inputs
2. **Default to common values:** "None" as default for endgame
3. **Make required fields obvious:** Use descriptive labels
4. **Add comments strategically:** Don't require comments for every section

### Data Quality

1. **Track failures:** Success/Fail counters help measure accuracy
2. **Include qualitative ratings:** Speed, skill, etc. for deeper analysis
3. **Always have a "No Show" option:** Robots don't always appear
4. **Include breakdown tracking:** Robot reliability matters

---

## Scout Leads Timer Workflow

`holdTimer` fields enable a second workflow for scout leads:

1. Scouts collect time-in-seconds on the main form by holding timer buttons.
2. Scout leads open `/scout-leads`, enter team + match, and load match data for timer-derived metrics.
3. For each timer field (or timer group), scout leads enter a configurable per-second rate.
4. The app stores those rates in a game-specific `scoutleads_*` table.

### Table Creation Rules

When a game is imported:
- Scouting table: `scouting_<gameName>`
- Scout-leads table: `scoutleads_<gameName>`

The scout-leads table always includes:
- `scoutname`
- `scoutteam`
- `team`
- `match`
- `matchtype`
- `timestamp`
- one extra numeric column per `holdTimer` field (same column name as the timer field)

The scout-leads table allows multiple entries for the same `(team, match, matchtype)`. When multiple scout-lead rates are saved, the app uses the **average rate** for that match when converting timer-seconds into scoring values.
- Blank or `0` rates are treated as missing and are excluded from the average.

### Configuring the Per-Second Input

Use the `scoutLeads` object inside each `holdTimer`:

```json
{
  "type": "holdTimer",
  "name": "defensetime",
  "label": "Defense Time",
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 },
  "scoutLeads": {
    "rateLabel": "Stops per second",
    "placeholder": "e.g. 0.75",
    "defaultRate": 0,
    "dbColumn": { "type": "NUMERIC(10,4)", "default": 0 }
  }
}
```

If `scoutLeads` is omitted:
- the input label defaults to `"<field label> per second"`
- rate default falls back to `0`
- rate column defaults to `NUMERIC(10,4)`

### Grouping Timer Fields on Scout-Leads

When multiple `holdTimer` fields represent the same physical action (e.g. Auto Fuel and Tele Fuel both use the same shooting rate), they can be **grouped** into a single card on the `/scout-leads` page. The scout lead enters one rate that is applied identically to all fields in the group.

**How to configure a group:**
Add `group` (required) and optionally `groupLabel` to the `scoutLeads` object of each timer field that should be combined:

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
},
{
  "type": "holdTimer",
  "name": "telefuelsuccess",
  "label": "Tele Fuel (s)",
  "dbColumn": { "type": "NUMERIC(10,3)", "default": 0 },
  "scoutLeads": {
    "rateLabel": "Balls / Second",
    "group": "Fuel",
    "groupLabel": "Fuel Scoring",
    "dbColumn": { "type": "NUMERIC(10,4)", "default": 0 }
  }
}
```

**What the scout-leads UI shows for a grouped card:**
- The `groupLabel` (or `group` key) as the card title
- A breakdown list of each member field's label and average seconds
- Combined average seconds across all fields in the group
- The saved average rate (from prior entries for that match)
- A single rate input — changing it updates the rate for **all** fields in the group simultaneously
- Estimated combined output (combined average seconds × entered rate)

**Important notes on grouping:**
- The `group` value is purely a UI-level key — it does not change the database schema. Each `holdTimer` field still gets its own dedicated column in `scoutleads_<gameName>`.
- When saving, the same entered rate is written to every field in the group. Rate processing (`applyScoutLeadRatesToRows`) remains per-field, which is correct since all fields in a group have the same rate.
- Fields in different sections of the form (e.g. Auto section and Tele section) can be part of the same group as long as they share the same `group` string.
- The card order on `/scout-leads` follows the order of first appearance of each group key in the config.
- The rate input label shown on the grouped card uses the `rateLabel` of the first field in the group. Set it to a generic label (e.g. `"Balls / Second"`) for all fields in the group to keep it readable.
- `groupLabel` defaults to the `group` key value if omitted.

### Scouting Entry Display

`/scout-leads` also displays the full scouting form data for the loaded team+match below the timer rate cards. All submitted entries (including No Show) are shown.

**Features:**
- **Edit button** appears on an entry if the logged-in team submitted it, or if admin editing is unlocked.
- **Admin unlock:** Enter the master admin password below the Save button and click "Unlock Editing" to enable editing of all entries regardless of which team submitted them.
- **Section background color:** If exactly one field in the config carries `isConfidenceRating: true`, the entire entries section changes color based on the scouted values. Supported field types are `starRating`/`qualitative` (red→green gradient) and `checkbox` (white→green when checked, or white→red when `invertColor: true` is also set). The background is white when no color-controlling field is configured.

**Configuring confidence color — qualitative field (1–6 gradient):**
```json
{
  "type": "starRating",
  "name": "scoutconfidence",
  "label": "Scouting Confidence",
  "isConfidenceRating": true,
  "dbColumn": { "type": "INTEGER", "default": null }
}
```
The section background interpolates from red (avg = 1) to green (avg = 6) across all scouting entries.

**Configuring confidence color — boolean field (checkbox):**
```json
{
  "type": "checkbox",
  "name": "notconfident",
  "label": "Not confident?",
  "isConfidenceRating": true,
  "invertColor": true,
  "dbColumn": { "type": "BOOLEAN", "default": false }
}
```
- Without `invertColor`: a higher proportion of checked entries → greener background.
- With `invertColor: true`: a higher proportion of checked entries → redder background (useful for a "Not confident?" flag where checked = concern).
- The background interpolates from white (0% checked) to the target hue (100% checked).

A `collapsible` field is a natural pairing — use the checkbox as the `trigger` and include a `comment` field in `content` for details:
```json
{
  "type": "collapsible",
  "trigger": {
    "type": "checkbox",
    "name": "notconfident",
    "label": "Not confident?",
    "isConfidenceRating": true,
    "invertColor": true,
    "dbColumn": { "type": "BOOLEAN", "default": false }
  },
  "content": [
    {
      "type": "comment",
      "name": "confidenceconcerns",
      "label": "Concerns",
      "dbColumn": { "type": "TEXT", "default": null }
    }
  ]
}
```

At most one field per config may carry `isConfidenceRating: true` — having more than one is a validation **error**. Placing it on any unsupported field type is a validation **warning** and is ignored at runtime.

**Edit flow:**
1. Click "Edit" on an entry card.
2. All fields become editable inputs (matching their original types).
3. `scoutname` and `noshow` are also editable in the edit header row.
4. Click "Save" to PATCH the row via `/api/edit-match-entry`. The entries section refreshes automatically.
5. Click "Cancel" to discard changes.

**Authorization model for edits:**
- Own entries (same `scoutteam` as the logged-in user's team) are always editable without admin password.
- Other teams' entries require the admin password to be unlocked first.
- Server-side: `PATCH /api/edit-match-entry` re-checks both conditions and returns 403 if neither is satisfied.

---

### Missing Rate Handling (Critical)

For any `holdTimer` field (grouped or ungrouped):
- If scouting recorded timer seconds for a team/match but no valid scout-leads rate exists for that same team/match/matchtype, that match is **excluded from scoring calculations**.
- The system first looks for a match-specific rate, then falls back to the team's average rate across all matches.
- Team view, match view, and picklist show a **red error box** listing which matches were skipped and why.
- This prevents raw timer seconds from being treated as scored piece counts.

---

## Scoring Requirements

Any `checkbox` field can be tagged with a `scoringRequirement` object to gate whether a scouting row is included in scoring calculations.

### How It Works

When `scoringRequirement` is set on a checkbox field, every scouting row is checked before aggregation:
- If the row's boolean value **does not match** `requiredValue`, the row is **excluded from scoring**.
- Excluded rows appear in the red warning box on team view, match view, and picklist — the same box that shows missing timer-rate warnings.

This is the boolean equivalent of the holdTimer rate requirement: just as a match without a scout-leads rate is excluded, a match whose boolean flag doesn't meet the requirement is also excluded.

### Configuration

Add `scoringRequirement` to any `checkbox` field:

```json
{
  "type": "checkbox",
  "name": "dataverified",
  "label": "Data Verified",
  "dbColumn": { "type": "BOOLEAN", "default": false },
  "scoringRequirement": {
    "requiredValue": true
  }
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `requiredValue` | boolean | Yes | `true` = only score rows where the field is checked; `false` = only score rows where the field is unchecked |

### The `requiredValue` Polar Field

`requiredValue` is the "polar" control:

| `requiredValue` | Behaviour |
|-----------------|-----------|
| `true` | Rows are **scored** only when the checkbox is **checked**. Rows where it is unchecked are excluded. Use this when the checkbox means "this data is good / verified". |
| `false` | Rows are **scored** only when the checkbox is **unchecked**. Rows where it is checked are excluded. Use this when the checkbox means "something went wrong / exclude me" (e.g. a "Breakdown" flag). |

### Examples

**Only score matches where a scout marked data as verified:**
```json
{
  "type": "checkbox",
  "name": "dataverified",
  "label": "Data Verified",
  "dbColumn": { "type": "BOOLEAN", "default": false },
  "scoringRequirement": { "requiredValue": true }
}
```

**Exclude matches where the robot broke down:**
```json
{
  "type": "checkbox",
  "name": "breakdown",
  "label": "Robot Broke Down",
  "dbColumn": { "type": "BOOLEAN", "default": false },
  "scoringRequirement": { "requiredValue": false }
}
```

### Combining with Timer Requirements

Both requirement types operate independently. A scouting row must satisfy **all** active requirements to be scored:
- If it fails a boolean requirement **and** is missing a timer rate, both reasons appear in the warning message.

### Validation Notes

- `scoringRequirement` on a non-checkbox field type is a **warning** and is ignored.
- `scoringRequirement.requiredValue` must be a boolean — a string, number, or missing value is a validation **error**.

---

### Scoring Validation Notes

- `holdTimer` is a first-class validated field type.
- `holdTimer.scoutLeads` (if provided) must be an object.
- `scoutLeads.rateLabel` must be a string when present.
- `scoutLeads.defaultRate` must be numeric when present.
- `scoutLeads.group` must be a string when present.
- `scoutLeads.groupLabel` must be a string when present.
- `holdTimer.dbColumn.type` should be numeric (`NUMERIC`, `DECIMAL`, or `INTEGER`).
- At most **one** field per config may have `isConfidenceRating: true`. Having more than one is an **error** (not a warning): `"Only one starRating, qualitative, or checkbox field may have isConfidenceRating: true (found N)"`. Fix: remove the flag from all but one field.
- `isConfidenceRating` on an unsupported field type produces a **warning** and is ignored by `/scout-leads`. Supported types: `starRating`, `qualitative`, `checkbox`.
- `invertColor` is only meaningful on `checkbox` fields with `isConfidenceRating: true`. Using it on any other field type produces a **warning** and is ignored.
- `scoringRequirement` is only supported on `checkbox` fields. Using it on any other type is a **warning** and is ignored.
- `scoringRequirement.requiredValue` must be a boolean. Any other type is a validation **error**.

---

## Step-by-Step: Creating a New Game Config

1. **Start with the template** at the top of this guide
2. **Set your game info:** `gameName`, `displayName`, `formTitle`
3. **Define your basics section** with the No Show checkbox
4. **Create your Auto section:**
   - What actions can robots do autonomously?
   - What are the point values?
   - Build tables for repetitive scoring
5. **Create your Tele section:**
   - Usually similar to Auto but different point values
   - Add human player scoring if applicable
   - Add general comments
   - Add defense collapsible if tracking defense
6. **Create your Endgame section:**
   - Use singleSelect for mutually exclusive positions
   - List all possible end states
7. **Create your Post-Match section:**
   - Use multiSelect for capabilities (intake options)
   - Add breakdown collapsible
8. **Define your calculations:**
   - Write formulas for auto, tele, end
   - Verify against official point values
9. **Configure display settings** (optional but recommended)
10. **Validate:** Upload to admin page and check for errors
11. **Test:** Activate the game and submit test entries

---

## Frequently Asked Questions

**Q: Can I edit a configuration after creating it?**
A: Yes, but changes won't affect the existing database table. For major changes, create a new game.

**Q: What if I need to add a field after the season starts?**
A: You'll need to manually alter the database table or create a new game config.

**Q: Can I have multiple games active?**
A: No, only one game can be active at a time. The active game determines which form scouts see.

**Q: How do I test my configuration?**
A: Create the game, activate it, and fill out the form on the main page. Check that all fields work correctly.

**Q: What happens to data when I switch games?**
A: Each game has its own database table. Switching games just changes which table the form writes to. Old data remains.

**Q: Where are scout-lead per-second timer rates stored?**
A: In `scoutleads_<gameName>`, with one numeric column per `holdTimer` field.

**Q: Can I reuse field names across different games?**
A: Yes! Field names only need to be unique within a single configuration. Different games can have the same field names.

---

## OPR Rankings Sidebar

When `usePPR: true` is set in the game config, the `/scout-leads` page shows an **OPR Rankings** sidebar to the right of the main content column.

### Setup

1. Set `"tbaEventCode"` to your event code (e.g. `"2026njski"`) in your game config JSON.
2. Set `"usePPR": true` in the game config JSON.
3. Set the `TBA_AUTH_KEY` environment variable to your TBA API key (obtain from https://www.thebluealliance.com/account).

### How It Works

- On page load, the sidebar fetches all **played** matches for the configured event from The Blue Alliance API.
- Click **"▼ Show Matches"** to expand the match list. Each row shows the match identifier, and the red and blue alliance scores.
- Each match has a **✓/✗ toggle** to include or exclude it from the OPR calculation.
- Click **Recalculate** to run OPR computation client-side using the currently enabled matches.
- The results appear as a ranked list of teams with their OPR values (higher = better).

### Algorithm

OPR is solved as a least-squares system: **X = (Mᵀ·M)⁻¹ · Mᵀ · s**

- **M** — match participation matrix (2 rows per match, one per alliance; column j = 1 if team j played)
- **s** — score vector (one entry per alliance per match)
- **X** — OPR value per team

The system is solved using Gaussian elimination with partial pivoting (no external dependencies). If the matrix is singular (too few matches relative to teams), the sidebar shows a message to include more matches.

### Config Example

```json
{
  "gameName": "my_game_2026",
  "displayName": "MY GAME 2026",
  "tbaEventCode": "2026njski",
  "usePPR": true,
  ...
}
```

---

## Acknowledgements

This project is based on the scouting system originally developed by **FRC Team 2485 - Overclocked**. Their work served as the foundation for this app, and we're grateful for the open-source culture in the FRC community that makes projects like this possible.

- GitHub: [https://github.com/team2485/](https://github.com/team2485/)

The OPR viewer tool included in this repository was originally created by **Jayden Li (glolichen)**, used under the MIT License.

- GitHub: [https://github.com/glolichen/frc-opr-viewer](https://github.com/glolichen/frc-opr-viewer)

---
