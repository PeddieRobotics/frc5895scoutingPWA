---
name: Betting System Removed
description: The entire betting system was removed; no betting_ tables, betting.js, or API routes exist anymore
type: project
---

The betting system (`betting_<gameName>` tables, `src/lib/betting.js`, `src/app/api/betting/*`, `src/app/betting/`) was fully removed.

**Why:** System was intentionally deleted by the developer.

**How to apply:** Do not reference any betting-related files, tables, or functions. They do not exist. The `MatchPrediction` component (`src/app/form-components/MatchPrediction.js`) still fetches from Statbotics directly client-side but has no DB interaction.
