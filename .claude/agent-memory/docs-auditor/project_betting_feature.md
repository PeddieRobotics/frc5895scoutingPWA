---
name: Betting System Feature
description: enableBetting config flag, betting_<gameName> DB table, Statbotics integration, BettingSection form component, /betting leaderboard — added April 2026
type: project
---

`enableBetting: true` in game config JSON activates the match betting system. Requires `tbaEventCode`.

**DB table:** `betting_<gameName>` — created in `createGame()`, dropped in `deleteGame()`. Also lazily created via `ensureBettingTable()` in `betting.js` on first bet placement. Key columns: `scoutname`, `scoutteam`, `match`, `matchtype`, `alliance`, `red_win_prob`, `blue_win_prob`, `points_wagered`, `status` (pending/won/lost), `points_earned`, timestamps. UNIQUE on `(scoutname, scoutteam, match, matchtype)`.

**Points formula:** `round((1 - chosenAllianceWinProb) * 100)`. Balance = SUM(points_earned) — not a stored column.

**Statbotics:** `https://api.statbotics.io/v3/match/{eventCode}_qm{matchNumber}` — no auth. 60 s in-memory cache. Bets blocked unless `matchStatus === 'Upcoming'`. Resolution triggered on leaderboard fetch.

**Form locking:** dynamic form dimmed until bet placed or abstained (X). Interacting with form first calls `window.__lockBetting()` which locks betting and unlocks the form.

**NavBar:** `/betting` link always present; page shows "not enabled" message when flag absent.

**Key files:** `src/lib/betting.js`, `src/app/form-components/BettingSection.js`, `src/app/betting/page.js`, `src/lib/schema-generator.js` (`sanitizeBettingTableName`).

**Why:** Added April 2026 as a scout engagement/gamification feature.
**How to apply:** When editing schema-generator.js, game-config.js, or page.js, keep betting table lifecycle in sync with other per-game tables. config-validator.js does NOT yet validate `enableBetting` — it is read directly by the frontend and API routes.
