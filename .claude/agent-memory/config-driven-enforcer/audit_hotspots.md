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
