---
name: Betting System Removed / MatchPrediction Added
description: Betting system fully removed April 2026; replaced by read-only MatchPrediction Statbotics card on scouting form
type: project
---

The betting system (`enableBetting`, `BettingSection`, `src/lib/betting.js`, `src/app/betting/`, `src/app/api/betting/`, `betting_<gameName>` table, `/betting` NavBar link) was fully removed in April 2026.

Replaced with `MatchPrediction` — a passive read-only card:
- Component: `src/app/form-components/MatchPrediction.js` + `MatchPrediction.module.css`
- Activates when `tbaEventCode` is set in the game config (no new config flag needed).
- Fetches directly from Statbotics API client-side: `https://api.statbotics.io/v3/match/{tbaEventCode}_qm{matchNumber}`
- No buttons, no DB writes, no form locking, no NavBar link.
- Appears between basics and the dynamic form sections.

**Why:** Betting added friction to scouting; MatchPrediction preserves the Statbotics integration without the UX overhead.

**How to apply:** `enableBetting` is gone entirely — do not reference it in config-validator.js, schema-generator.js, or page.js. The `betting_<gameName>` table no longer exists in the schema lifecycle. `tbaEventCode` now drives: TBA rank, OPR/PPR, and MatchPrediction (three uses, no betting).
