---
name: Betting System Architecture
description: Game-specific betting table pattern, service layer design, and known warnings for the betting feature
type: project
---

Betting feature added to the codebase. Uses `betting_<gameName>` per-game tables following the same sanitizeTableName pattern as all other game-specific tables.

**Why:** Feature was audited and confirmed correct. Recording for future validation context.

**How to apply:** When auditing betting-related code, the baseline is that the system is correctly implemented. Focus on the 4 known warnings below.

## Table
- `betting_<gameName>` — per-game table; created in `createGame()`, dropped in `deleteGame()`, lazy-created via `ensureBettingTable()` in `betting.js`
- Schema: `id, scoutname, scoutteam, match, matchtype, alliance, red_win_prob, blue_win_prob, points_wagered, status, points_earned, placed_at, resolved_at`
- UNIQUE constraint on `(scoutname, scoutteam, match, matchtype)`

## API Routes
- `POST /api/betting/place` — place a bet; auth required; `scoutteam` from session (not body)
- `GET /api/betting/my-bet?match=&scoutname=&matchtype=` — get user's bet for a match
- `GET /api/betting/balance?scoutname=` — get user balance/stats
- `GET /api/betting/leaderboard` — leaderboard with auto-resolution of completed bets
- `GET /api/betting/prediction?match=` — Statbotics prediction fetch, no DB

## Known Warnings (non-blocking)
1. `my-bet/route.js` and `place/route.js`: `matchtype` not guarded against `NaN` from `parseInt`
2. `balance/route.js` and `my-bet/route.js`: no `catch` block — DB errors surface as unstructured 500s
3. `resolveCompletedBets()` in `betting.js`: redundant per-bet `SELECT points_wagered` query; should include in initial SELECT
