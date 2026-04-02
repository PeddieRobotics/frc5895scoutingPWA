---
name: Audit Patterns: Clean Areas
description: Components and patterns confirmed to be correctly config-driven across audits
type: feedback
---

## Photo Tagging System (audited 2026-04-02)

The entire photo tagging feature is correctly config-driven:

- `config.photoTags[]` — tag name, emoji, color all read from config; no defaults hardcoded in source
- `config.display.teamView.photoSections[]` — placement and tag references from config only
- `GallerySection` in `scout-leads/page.js` — reads `config?.photoTags || []`; all tag rendering (name, emoji, color) uses config properties
- `TaggedPhotoGrid.js` — purely prop-driven (`tag`, `tagConfig`); no internal knowledge of tag names or colors
- `GET /api/prescout/photos` — tag parameter is a pass-through string; no hardcoded tag names anywhere in the API route
- `config-validator.js` — photoTags/photoSections validation is generic (checks structural constraints: required fields, string types, duplicate names, cross-reference between photoSections.tag and photoTags); never references specific tag names

## Placement Slot Pattern

`team-view/page.js` hardcodes placement slot names (`'aboveEpaChart'`, `'sections.auto.afterImageSelect'`) as filter predicates. This is the CORRECT pattern — identical to how chart type constants like `'epaLine'`, `'coralLine'`, `'passLine'` work. The renderer owns the vocabulary of valid slot names; the config picks which tags occupy those slots. Not a violation.

**Why acceptable:** The placement identifiers name structural insertion points in the UI, not game concepts. A new game could use the same slots for completely different tags.

## Config Files (`src/configs/`)

`rebuilt_2026.json` photoTags (`"Featured"`, `"Auto Routes"`) and photoSections are correctly placed in the config file, not in source code.
