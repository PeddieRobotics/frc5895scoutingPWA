---
name: Admin API route auth pattern
description: Routes under /api/admin/ use validateAuthToken (any session), not admin password — admin password gates are at the page level only
type: feedback
---

Routes placed under `/api/admin/` do NOT automatically require admin password. They use `validateAuthToken` (any valid user session). The admin password gate exists only at the page level (e.g., `/admin/games` requires admin password to render, then calls these routes with `credentials: 'include'`).

**Why:** Discovered during imageSelect audit — the `/api/admin/field-images` routes show this pattern clearly. The naming convention is organizational, not a security boundary at the API level.

**How to apply:** When documenting any `/api/admin/*` route, specify "session auth (any authenticated user)" not "admin-only" unless the route code explicitly checks `ADMIN_PASSWORD`. Do not assume the route path implies elevated auth.
