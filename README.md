## Getting Started

First, install the dependencies:

```bash
npm install
```

Next, configure the game collection JSON configuration file at /admin/games

Please note that the PostgreSQL database keys, as well as ADMIN_PASSWORD must be defined in environment variables.

---

# JSON Game Configuration Guide

This is a **comprehensive, in-depth guide** for creating JSON configuration files that define scouting forms for FRC games. After reading this guide, you will understand every aspect of the configuration system and be able to create custom scouting forms for any FRC game.

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
11. [Reserved Field Names](#reserved-field-names)
12. [Validation & Common Errors](#validation--common-errors)
13. [Complete Example](#complete-example)
14. [Best Practices](#best-practices)

---

## Overview

The JSON configuration system allows you to define scouting forms without writing any code. Each JSON file describes:

- **What fields appear on the form** (checkboxes, counters, dropdowns, etc.)
- **How fields are organized** (sections like Auto, Tele, Endgame)
- **What database columns are created** (automatic table generation)
- **How points are calculated** (EPA formulas for auto, tele, endgame)
- **How data is displayed** (team view, match view, charts)

When you create a new game configuration and activate it, the system automatically:
1. Validates your JSON for errors
2. Creates a new database table with all the columns your fields need
3. Renders the scouting form based on your configuration
4. Calculates EPA scores using your formulas

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
| `basics` | object | Pre-match fields (like "No Show") | None |
| `sections` | array | Main form sections (Auto, Tele, etc.) | Required for form |
| `calculations` | object | EPA point calculation formulas | None |
| `display` | object | Configuration for team/match views | None |

### Example

```json
{
  "gameName": "reefscape_2025",
  "displayName": "REEFSCAPE 2025",
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
| `max` | number | No | Maximum stars (default: 5, max: 10) |
| `minWhenVisible` | number | No | Minimum rating required when visible |
| `inverted` | boolean | No | If true, lower is better (affects display coloring) |
| `dbColumn` | object | Yes | Database column configuration |

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
| `NUMERIC` | Decimal numbers | `0` |

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

The `display` object configures how data is shown across all display pages. **All display pages render entirely from this config** — if a section is missing, the page shows a "not configured" fallback.

### Structure

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

### Team View Configuration

```json
{
  "teamView": {
    "epaBreakdown": ["auto", "tele", "end"],
    "piecePlacement": {
      "bars": [
        { "label": "L4", "autoField": "autol4success", "teleField": "telel4success" },
        { "label": "HP", "teleField": "hpsuccess" }
      ],
      "coral": {
        "levels": ["L1", "L2", "L3", "L4"],
        "autoFields": [...], "teleFields": [...],
        "autoFailFields": [...], "teleFailFields": [...]
      },
      "algae": {
        "autoFields": [...], "teleFields": [...],
        "autoFailFields": [...], "teleFailFields": [...],
        "metrics": [
          { "key": "Processor", "type": "successFail", "fieldIndex": 0, "failIndex": 0 },
          { "key": "Net", "type": "successFail", "fieldIndex": 1, "failIndex": 1 },
          { "key": "removed", "type": "count", "fieldIndex": 2 }
        ]
      }
    },
    "endgamePie": {
      "field": "endlocation",
      "labels": ["None", "Park", "Shallow", "Deep"],
      "values": [0, 1, 2, 3]
    },
    "comments": ["generalcomments", "breakdowncomments"],
    "commentFields": [
      { "field": "generalcomments", "dataKey": "generalComments", "title": "General Comments" },
      { "field": "breakdowncomments", "dataKey": "breakdownComments", "title": "Breakdown Comments" }
    ],
    "intakeDisplay": [
      { "category": "Coral Intake", "fields": ["coralgrndintake"], "labels": ["Ground"] }
    ],
    "qualitativeDisplay": [
      { "name": "coralspeed", "label": "Coral Speed" },
      { "name": "aggression", "label": "Aggression", "inverted": true }
    ]
  }
}
```

**Properties:**

| Property | Description |
|----------|-------------|
| `epaBreakdown` | Which calculations to show in EPA charts |
| `piecePlacement.bars` | Bar chart entries, each with `label`, `autoField`, and/or `teleField`. `autoField` / `teleField` may be a raw form field (`autol4success`) or a computed dotted path (`auto.avgFuel`). |
| `piecePlacement.{group}.metrics` | Explicit metric definitions for secondary stat groups (avoids string matching) |
| `endgamePie` | Configure endgame pie chart |
| `comments` | Which comment fields to display (legacy) |
| `commentFields` | Explicit comment field mapping with `field`, `dataKey`, and `title` |
| `intakeDisplay` | How to group and display intake capabilities |
| `qualitativeDisplay` | Which qualitative ratings to show |

**Metrics types:**
- `successFail` — Computes `avg{Key}` and `success{Key}` from success/fail field pairs
- `count` — Computes a simple average count as `{key}`

### Match View Configuration

```json
{
  "matchView": {
    "allianceMetrics": ["auto", "tele", "end"],
    "keyStats": [
      { "label": "Auto Climb", "field": "autoclimb", "type": "percentage" },
      { "label": "Avg Fuel", "type": "sum", "fields": ["autofuelsuccess", "telefuelsuccess"] }
    ],
    "rankingPoints": [
      { "label": "RP", "type": "allFieldsAndThreshold", "minCoral": 15, "leaveField": "leave", "coralField": "autoCoral" }
    ]
  }
}
```

### Required Display Keys (Runtime Validated)

If these keys are missing or mismatched, `team-view` / `match-view` now stop rendering partial data and show a config error list with exact paths.

- `display.teamView.piecePlacement.bars` must be a non-empty array.
- `display.teamView.endgamePie.labels` and `display.teamView.endgamePie.values` must both exist and be the same length.
- `display.apiAggregation.endgameConfig.valueMapping` must include every `teamView.endgamePie.values` entry.
- `display.matchView.piecePlacement.bars` must be a non-empty array.
- `display.apiAggregation.alliancePiecePlacement` must be a non-empty array, and every `matchView.piecePlacement.bars[*].key` must exist there.
- `display.matchView.endgamePie.labels` and `display.matchView.endgamePie.keys` must both exist and be the same length.
- `display.matchView.endgamePie.keys` must match values from `display.apiAggregation.endgameConfig.valueMapping`.

### Match-View Mapping Rule

`match-view` piece bars are keyed by `display.matchView.piecePlacement.bars[*].key`, and those keys are populated from `display.apiAggregation.alliancePiecePlacement[*].key`. If these do not match exactly, the page will show a config error instead of guessing.

### Picklist Configuration

```json
{
  "picklist": {
    "weights": [
      { "key": "avgEpa", "label": "EPA", "default": 1.0 },
      { "key": "avgAuto", "label": "Auto", "default": 0.5 }
    ],
    "tableColumns": [
      { "key": "avgEpa", "label": "EPA" },
      { "key": "consistency", "label": "Cnstcy" }
    ],
    "scatterPlot": {
      "xAxis": { "label": "Auto", "fields": ["avgAuto"] },
      "yAxis": { "label": "Tele", "fields": ["avgTele"] }
    },
    "consistencyMetricKey": "mainCycleMetric" // Optional: key to use for consistency calc
  }
}
```

### Compare Configuration

```json
{
  "compare": {
    "metrics": [
      { "key": "avgEpa", "label": "EPA", "format": "decimal" }
    ],
    "scorePrediction": {
      "auto": ["avgAuto"],
      "tele": ["avgTele"],
      "end": ["avgEnd"]
    },
    "endgameChart": { ... },
    "coralLevelChart": { ... }
  }
}
```

### API Aggregation Configuration

This section controls how raw data is processed into team stats.

```json
{
  "apiAggregation": {
    "breakdownField": "breakdown",
    "defenseField": "defenseplayed",
    "leaveField": "leave",
    "successFailPairs": [
      { "key": "Fuel", "phase": "tele", "successField": "telefuelsuccess", "failField": "telefuelfail" }
    ],
    "customSumFields": [
      { "key": "totalGamePieces", "fields": ["autopieces", "telepieces"] }
    ],
    "endgameConfig": {
      "field": "endlocation",
      "valueMapping": { "0": "None", "1": "Park", ... }
    },
    "qualitativeFields": ["speed", "accuracy"]
  }
}
```
    "allianceMetrics": ["auto", "tele", "end"],
    "epaBreakdown": ["auto", "tele", "end"],
    "piecePlacement": {
      "bars": [{ "label": "L4", "key": "L4" }]
    },
    "endgamePie": { "field": "endlocation", "labels": [...], "keys": [...] },
    "qualitativeFields": ["coralspeed", "maneuverability"],
    "defenseBarField": "defenseplayed",
    "rankingPoints": [
      { "label": "Auto", "type": "allLeaveAndCoral", "leaveField": "leave", "coralFields": [...] }
    ]
  }
}
```

### Picklist Configuration

```json
{
  "picklist": {
    "weights": [
      { "key": "epa", "label": "EPA" },
      { "key": "consistency", "label": "Cnstcy" },
      { "key": "breakdown", "label": "Break %", "inverted": true }
    ],
    "tableColumns": [
      { "key": "epa", "label": "Norm EPA", "colorScale": "normal", "format": "three" },
      { "key": "realEpa", "label": "Real EPA", "colorScale": "epa", "format": "one" }
    ],
    "scatterPlot": {
      "xAxis": { "label": "Total Coral", "fields": ["autol1success", "telel1success"] },
      "yAxis": { "label": "Total Algae", "fields": ["autoprocessorsuccess"] }
    },
    "defenseField": "defenseplayed"
  }
}
```

### Compare Configuration

```json
{
  "compare": {
    "metricsChart": [{ "key": "avgEpa", "label": "EPA" }],
    "scoringChart": [{ "key": "coral", "label": "Coral", "compute": "auto.coral.total + tele.coral.total" }],
    "coralLevelChart": { "levels": ["L1"], "autoPrefix": "auto.coral.avg", "telePrefix": "tele.coral.avg" },
    "endgameChart": { "metrics": ["None", "Park"], "keys": ["none", "park"] },
    "defenseField": "defenseplayed"
  }
}
```

### API Aggregation Configuration

Controls how raw scouting data is aggregated by the display engine.

```json
{
  "apiAggregation": {
    "breakdownField": "breakdown",
    "defenseField": "defense",
    "successFailPairs": [
      { "phase": "tele", "key": "Hp", "successField": "hpsuccess", "failField": "hpfail" }
    ],
    "booleanFields": ["noshow", "leave", "breakdown"],
    "textFields": ["scoutname", "generalcomments"],
    "qualitativeFields": ["coralspeed", "maneuverability"],
    "booleanIntakeFields": ["coralgrndintake"]
  }
}
```

| Property | Description |
|----------|-------------|
| `breakdownField` | Boolean field used to detect breakdown matches (for consistency calc) |
| `defenseField` | Boolean field used to detect defense matches (for defense % calc) |
| `successFailPairs` | Generic success/fail metric pairs to aggregate, each with `phase`, `key`, `successField`, `failField` |
| `booleanFields` | Fields to aggregate as boolean percentages |
| `textFields` | Text fields not aggregated numerically |
| `qualitativeFields` | Fields aggregated as qualitative ratings |

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
**Fix:** Use one of the valid types: `checkbox`, `counter`, `number`, `text`, `comment`, `singleSelect`, `multiSelect`, `starRating`, `qualitative`, `table`, `collapsible`.

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

**Q: Can I reuse field names across different games?**
A: Yes! Field names only need to be unique within a single configuration. Different games can have the same field names.

---

**You're now ready to create custom scouting configurations!** Start with the template, refer to this guide for field types and syntax, and don't hesitate to look at the REEFSCAPE 2025 example for patterns to follow.
