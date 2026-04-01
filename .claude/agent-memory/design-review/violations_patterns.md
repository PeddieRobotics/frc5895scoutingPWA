---
name: Frequently Violated Design Rules
description: Recurring violations found across design reviews — check these first on any new component
type: feedback
---

## Button font-size out of range

Light Mode button label spec is `font-size: 13–16px`. The `.goButton` (28px) and `.clearButton` (20px) in both `match-view` and `team-view` exceed this. Watch for oversized font-size on any new button class — especially form-level submit/clear buttons where the temptation is to make them "prominent."

**Why:** DESIGN.md Buttons section explicitly states 13–16px. Discovered in match-view/team-view review (2026-03-31).

**How to apply:** Flag any button `font-size` above 16px as a violation in future reviews.

---

## clearButton border-radius mismatch

Light Mode Destructive button spec uses `border-radius: 8px`. The `.clearButton` in both pages used `12px`, inconsistent with sibling `.editButton` (8px) and the spec.

**Why:** Light Mode button section lists 8px for all three button types (Primary, Secondary, Destructive). Discovered 2026-03-31.

**How to apply:** All Light Mode buttons default to `border-radius: 8px`. Flag any value other than 8px unless explicitly justified (e.g., a pill/chip which has its own spec).

---

## Off-token hover colors on buttons

`.clearButton:hover` set `color: #a03020` — an arbitrary hex not in the Light Mode palette. The spec's Destructive hover only modifies background fill and border opacity, not text color.

**Why:** DESIGN.md color palette defines `#c0392b` as the only red danger token for Light Mode. Discovered 2026-03-31.

**How to apply:** On hover states, only adjust opacity/fill of existing palette tokens. Never introduce a new hex value not listed in the palette table.

---

## Inline style for theme colors in JSX

`team-view/page.js` configIssues panel uses `style={{ background: "#2a0e0e", color: "#ffd9d9", ... }}` — arbitrary dark colors inline on a light-mode page.

**Why:** DESIGN.md "What NOT to do" — "No inline `style={{ backgroundColor: ... }}` for theme colors — all colors belong in CSS modules." Also violates "Don't mix light and dark surfaces on the same page." Discovered 2026-03-31.

**How to apply:** Any inline `style` containing background/color/border values is a violation. Move to CSS module class.

---

## Off-token grey: `#8a9aaa` and `#5a6a7a` (invented tokens)

Found in PrescoutSection.module.css, PhotoGallery.module.css, and prescout.module.css (review 2026-03-31). These two hex values are used as "secondary" or "dim" text colors but are not in the DESIGN.md palette. They appear as a recurring shortcut for muted text.

**Why:** DESIGN.md Light Mode defines `rgba(13, 31, 53, 0.4)` for dim/placeholder/disabled states and `rgba(13, 31, 53, 0.65)` for secondary text. No blue-grey tokens exist.

**How to apply:** Flag any `#8a9aaa`, `#5a6a7a`, or similar blue-grey hexes in light-mode CSS as a violation. Replace with `rgba(13, 31, 53, 0.4)` (dim) or `rgba(13, 31, 53, 0.65)` (secondary).

---

## Touch target size — systematic under-sizing of small buttons

Across PrescoutSection (toggle), PhotoGallery (triggerBtn, closeBtn, deleteBtn, cancelBtn, uploadBtn, lightboxClose), and prescout admin (backBtn, clearBtn), small utility buttons are consistently sized at 22–33px height. The spec minimum is 44px.

**Why:** DESIGN.md Mobile-First Rules — "All interactive targets: minimum 44px touch target height." Competition use means one-handed operation on small screens.

**How to apply:** Check every button, anchor-as-button, and interactive element for `min-height: 44px`. Small icon buttons should use `width: 44px; height: 44px` even if the visible icon is smaller.

---

## Armed state must be amber, not red

prescout.module.css `.clearBtnArmed` uses solid red `#c0392b` background with red pulsing glow. DESIGN.md specifies amber (`rgba(255, 160, 0, 0.18)` fill, `rgba(255, 180, 0, 0.7)` border, `color: #ffd966` / `#c07000`) for the armed/confirm-required state. Red is the *destructive action* color, not the *warning* color.

**Why:** Armed state is a warning that the destructive action is about to happen — amber conveys caution without suggesting the action already fired. Discovered 2026-03-31.

**How to apply:** Flag any armed/two-tap-confirm button styled red. Armed = amber. Executed = red (if a visual feedback is shown after action).

---

## Off-token green: `#1e8449`, `rgba(39, 174, 96, ...)` (invented tokens)

prescout.module.css uses `#1e8449` for success text and `rgba(39, 174, 96, 0.05/0.2)` for success fill/border. DESIGN.md specifies `#1a7f3c` (green success) and `rgba(26, 127, 60, 0.1)` (green fill).

**Why:** The 39, 174, 96 RGB values and #1e8449 hex are not palette tokens. Discovered 2026-03-31.

**How to apply:** Flag any green hex/rgb not matching `#1a7f3c` / `rgba(26, 127, 60, ...)` as a token violation.

---

## `outline: none` without focus-visible replacement

prescout.module.css `.authInput` sets `outline: none` without a `:focus-visible` replacement. DESIGN.md requires gold focus rings on all interactive elements.

**Why:** Suppressing the browser focus ring without a gold replacement breaks keyboard accessibility. DESIGN.md: "Always gold, never the default blue."

**How to apply:** Any `outline: none` or `outline: 0` must be accompanied by a `:focus-visible` rule using `outline: 2px solid rgba(160, 124, 48, 0.75); outline-offset: 2px`.

---

## Missing `:focus-visible` on `<Link>`-as-card elements (dark mode)

admin.module.css `.navCard` (a `<Link>` element styled as an interactive card) has no `:focus-visible` rule. Dark mode gold ring: `outline: 2px solid rgba(189, 151, 72, 0.7); outline-offset: 2px`. Discovered 2026-04-01.

**Why:** `<Link>` elements receive keyboard focus and will show the browser-default blue ring if not overridden. DESIGN.md Focus Rings section forbids all non-gold focus indicators.

**How to apply:** Any `<Link>` or `<a>` styled as an interactive card, tile, or button must include an explicit `:focus-visible` rule. Check this whenever a `<Link>` is given a card-style CSS class.

---

## Pure black (`rgba(0,0,0,...)`) in overlays and shadows

PhotoGallery.module.css lightbox uses `rgba(0, 0, 0, 0.88)` backdrop and `rgba(0, 0, 0, 0.5)` box-shadow. DESIGN.md "What NOT to do" forbids `#000000` backgrounds on interactive elements; shadow token is `rgba(13, 31, 53, ...)`.

**Why:** All shadows and overlay backdrops must use the navy color family to stay within the design language. Discovered 2026-03-31.

**How to apply:** Replace any `rgba(0, 0, 0, ...)` in shadows or backdrops with `rgba(13, 31, 53, ...)` at equivalent opacity.
