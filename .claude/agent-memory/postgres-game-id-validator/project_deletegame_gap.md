---
name: deleteGame opr_settings gap
description: deleteGame() in game-config.js does not drop opr_settings_<gameName>; pre-existing gap not introduced by betting removal
type: project
---

`deleteGame()` in `src/lib/game-config.js` drops `scouting_`, `scoutleads_`, `prescout_`, `photos_`, `fieldimages_`, `prescoutform_` tables but NOT `opr_settings_<gameName>`.

**Why:** This was a pre-existing omission — the betting system removal audit confirmed it was not introduced by that change. The `ensureOprSettingsTableForGame()` function creates the table lazily, so it may not exist for all games, but for games using `usePPR: true` it will be orphaned after deletion.

**How to apply:** If a user asks about table cleanup or deleteGame completeness, flag that `opr_settings_<gameName>` is not dropped. Fix: add `sanitizeOprSettingsTableName` to the drop block around line 449 in `src/lib/game-config.js`.
