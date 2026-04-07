---
name: Audit Patterns: Hotspots
description: Recurring violation risk areas and patterns that warrant extra scrutiny in audits
type: feedback
---

## High-Risk Areas (watch on every audit)

- `src/app/team-view/page.js` — large file with many config-driven rendering paths; risk area for accidental hardcoded field names or labels in new section renderers
- `src/app/scout-leads/page.js` — complex component with entry editing; risk area for hardcoded field allowlists or game-specific labels
- `src/lib/display-engine.js` — aggregation logic; risk area for hardcoded field name references in aggregation pipelines
- `src/app/api/get-team-data/route.js` and `get-alliance-data/route.js` — risk area for hardcoded field keys in response shaping

## Validator Must-Validate Pattern

When a new config key introduces a finite set of valid string values that the renderer checks by equality (like placement slot names), the validator in `config-validator.js` should ideally warn when an unrecognized value is used. Currently `photoSections[].placement` is only checked for presence/type — not against the known slot vocabulary. This is a LOW concern (no game-specific data leaks) but good practice to add a `VALID_PLACEMENTS` constant to the validator so config authors get warned about typos.

## JSDoc Example Strings

Component JSDoc comments sometimes include example game-specific values (e.g., `tag - tag name string (e.g., "Featured")`). These are not runtime literals and are not violations, but they age out of date across seasons. Acceptable as documentation.

## NavBar Conditional Feature Links Pattern (new hotspot — betting audit 2026-04-03)

`NavBar.js` uses a static `SITE_PAGES` array. When a new feature is added with a config flag (e.g., `enableBetting`), there is a HIGH-severity risk that the nav link is added statically to the array rather than conditionally on the config flag. The NavBar does not currently load game config, so showing/hiding the Betting link based on `config.enableBetting` requires either:
- Adding `useGameConfig()` to NavBar and filtering `SITE_PAGES` on `config?.enableBetting`, OR
- Adding a `configOnly: true` guard property to the page entry and a config check in the filter.

The `/betting` page itself already guards with `if (!config?.enableBetting)` — but the nav link is always visible regardless. This is a HIGH violation pattern to watch on any future feature-flagged page additions.

## Betting Table Creation Duplication Pattern (new finding — betting audit 2026-04-03)

The betting table DDL is defined in TWO places: `src/lib/game-config.js` (in `createGame()`) and `src/lib/betting.js` (in `ensureBettingTable()`). This is structural duplication that risks schema drift. Not a config-driven violation per se, but a maintainability concern to flag whenever new per-game tables are added.

## display-engine.js `leave` Field Hardcoded in `aggregateTeamData` (found picklist audit 2026-04-06)

In `aggregateTeamData` (line ~257), the `leave` field is referenced as a literal `e.leave` without going through `apiConfig.leaveField`. The `aggregateAllianceData` function in the same file correctly uses `apiConfig.leaveField || 'leave'` (line 530). This asymmetry means if a game doesn't use a field named `leave`, the team-data aggregation silently returns the wrong value. LOW severity since `'leave'` acts as a generic structural fallback, but the pattern is inconsistent with how the same field is handled elsewhere in the file.

Fix: change line 257 to use `const leaveFieldName = apiConfig.leaveField || 'leave';` and reference `e[leaveFieldName]`.

## display-engine.js `noshow` Used as Literal String in Multiple Places (structural exception — picklist audit 2026-04-06)

`noshow`, `scoutname`, `match`, `matchtype`, `team` are the structural DB columns defined by the schema (not game-specific fields). Their direct literal use in display-engine.js is acceptable — they are part of the framework schema, not game config. This is the same category as `id`, `timestamp`, etc.

## display-engine.js `computedMetrics` `calcFn` String Must Reference Valid `calcFns` Keys (new risk — picklist audit 2026-04-06)

The new `maxField`/`minField` metric types in `computePicklistMetrics` take a `calcFn` string from the config (`metric.calcFn`) and look it up as `calcFns[metric.calcFn]`. If the config spells the function name wrong (e.g., `"calcEpa"` instead of `"calcEPA"`), it silently returns `NaN`. No validation exists for this. Config authors must use exactly: `"calcEPA"`, `"calcAuto"`, `"calcTele"`, `"calcEnd"`. Consider adding a validation warning in `config-validator.js` when a `computedMetrics` entry of type `maxField`/`minField` has a `calcFn` value not in that set.

## Picklist `page.js` Rewrite — Confirmed Clean (picklist audit 2026-04-06)

The new `src/app/picklist/page.js` is fully config-driven:
- All column definitions, scatter fields, weights, and defaultSort come from `picklistConfig.tableColumns`, `picklistConfig.scatterFields`, `picklistConfig.weights`, `picklistConfig.defaultSort`
- K/S list stat display uses `usePPR` flag correctly for PPR/EPA label toggle
- No game-specific field names, labels, or thresholds hardcoded anywhere in the file
- `page.module.css` contains no game-specific references

## Inline Mini-Renderers Risk Pattern (prescout audit 2026-04-07)

When a new page builds its own mini field renderer (like `PrescoutField` in `prescout/page.js`) instead of reusing the existing `DynamicFormRenderer`, it is a HIGH-risk area for inconsistency with established defaults. Specific pitfalls observed:
- `starRating` default `max` differs: existing codebase uses `field.max || 6` (per CLAUDE.md); the prescout renderer used `field.max || 5` — a MEDIUM violation.
- `comment` field `maxLength` used as a hardcoded literal (`500`) rather than reading `field.maxLength` from config — MEDIUM violation. The existing `CommentBox.js` uses a named constant `MAX_CHARS = 255`; the prescout form used a raw `500` literal with no config hook.
- Both issues arise from the renderer being written in isolation from the established form component library.

## Team Number Placeholder Hardcode (prescout audit 2026-04-07)

`src/app/scout-leads/prescout/page.js` line 233: `placeholder="e.g. 5895"` is a hardcoded team number. This is a LOW severity violation — it's just a UX hint, not a functional value — but it still violates the spirit of the no-hardcode rule. Fix: use a generic placeholder like `"e.g. 1234"` or `"Enter team number"`.
