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
