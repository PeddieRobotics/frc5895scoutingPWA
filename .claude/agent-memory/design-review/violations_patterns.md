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

## Touch targets in responsive breakpoints — min-height must not shrink below 44px

Mobile breakpoint overrides (`@media (max-width: 480px)` and `@media (max-width: 320px)`) sometimes reduce `min-height` / `min-width` below 44px to shrink visually crowded UI. Discovered in ImageSelect.module.css (38px at 480px, 32px at 320px).

**Why:** DESIGN.md Mobile-First Rules — 44px minimum touch target applies at ALL supported widths including 320px (the minimum supported width). Reducing touch targets at smaller viewports contradicts the rule.

**How to apply:** In any responsive breakpoint, if a `min-height` or `min-width` on an interactive element is being lowered from 44px, flag it as a violation. Only padding and font-size can scale down.

---

## Non-Montserrat font-family in dark mode admin sections

Admin page CSS occasionally uses `font-family: monospace` for code/tag display (e.g., imageTagName in games.module.css). DESIGN.md specifies Montserrat everywhere with "no exceptions."

**Why:** The design system is single-font. Monospace fonts for tag names break the uniform typographic voice. Discovered 2026-04-01 in games.module.css `.imageTagName`.

**How to apply:** Any `font-family` that is not `'Montserrat', sans-serif` (outside of a `<code>/<pre>` validation/config preview block) is a violation. Replace with Montserrat and adjust weight to distinguish code-like text visually.

**Fixed in:** Image Assets section (2026-04-02) — `.imageTagName` and `.imageUploadButton` now explicitly declare Montserrat. Monospace still appears in `.textarea`, `.jsonParseError`, `.diffItem` which are intentional code-display contexts.

---

## Solid border-top on section dividers — must use gradient

New sections within dark-mode cards sometimes add `border-top: 1px solid rgba(...)` as a visual separator. DESIGN.md requires gradient `hr` rules. Discovered 2026-04-01 in `.imageAssetsSection` in games.module.css.

**Why:** DESIGN.md Dividers section — "Use gradient hr rules rather than solid lines." This applies to any horizontal rule or section separator, not just literal `<hr>` elements. A CSS `::before` pseudo-element with the gradient background is the correct approach when an `<hr>` element is not used.

**How to apply:** Replace any `border-top: 1px solid` used as a section divider with a gradient `::before` pseudo-element or an `<hr>` with the gradient rule.

---

## Off-token white-opacity for secondary text in dark mode

Dark mode secondary/hint text is sometimes written as `rgba(255,255,255,0.5)` instead of the palette token `rgba(232,213,163,0.6)` (warm text dim). Seen in `.imageFieldLabel` in game-detail.module.css (2026-04-02).

**Why:** Pure white-opacity reads cooler and breaks the warm gold-on-navy aesthetic. DESIGN.md defines "Warm text dim" as `rgba(232,213,163,0.6–0.8)` for secondary text; there is no pure-white secondary text token in dark mode.

**How to apply:** Any `rgba(255,255,255,0.X)` used as body/label text color in a dark mode component is a violation. Replace with the warm text dim token at appropriate opacity.

---

## Button 1px border — should be 1.5px

Admin page buttons (`.uploadButton`, `.formatButton`, `.imageUploadButton`) use `border: 1px solid` instead of the spec's `border: 1.5px solid`. Systemic in game-detail.module.css (discovered 2026-04-02).

**Why:** DESIGN.md Buttons and Surfaces both specify 1.5px borders throughout. The 1px value makes borders visually lighter/weaker than the design system intends.

**How to apply:** Any new dark mode button should use `border: 1.5px solid`. When modifying existing admin page buttons, correct to 1.5px at the same time.

---

## Button border-radius below 10px in dark mode

Admin page buttons in game-detail.module.css use `border-radius: 5–6px`. DESIGN.md specifies 10–18px for all buttons.

**Why:** Lower radius creates a squarer appearance inconsistent with the rounded design language. Discovered 2026-04-02 in `.imageUploadButton` (6px) and toolbar buttons (5px).

**How to apply:** All dark mode buttons must use `border-radius: 10px` minimum. Flag any value below 10px on a button class.

---

## imageUploadButton touch target under-sizing in games.module.css

`padding: 6px 12px` on `.imageUploadButton` produced ~30px height — well below the 44px minimum. Admin dark-mode upload controls are a repeated site of this violation.

**Why:** DESIGN.md Mobile-First — 44px minimum applies to all interactive targets including `<label>` elements used as custom file inputs.

**How to apply:** File-input labels (`<label>` acting as a button) must also have `min-height: 44px`. Use `padding: 0 Xpx` + `min-height: 44px` + `align-items: center` to keep the visual size controlled while meeting the touch target floor. Fixed in games.module.css (2026-04-02).

---

## Pure black (`rgba(0,0,0,...)`) in overlays and shadows

PhotoGallery.module.css lightbox uses `rgba(0, 0, 0, 0.88)` backdrop and `rgba(0, 0, 0, 0.5)` box-shadow. DESIGN.md "What NOT to do" forbids `#000000` backgrounds on interactive elements; shadow token is `rgba(13, 31, 53, ...)`.

**Why:** All shadows and overlay backdrops must use the navy color family to stay within the design language. Discovered 2026-03-31.

**How to apply:** Replace any `rgba(0, 0, 0, ...)` in shadows or backdrops with `rgba(13, 31, 53, ...)` at equivalent opacity.

---

## `outline: none` without `:focus-visible` — recurs on form inputs

`page.module.css` for scout-leads uses `outline: none` on many inputs/selects (`.scatterAxisSelect`, `.weightSelect`, `.field input`, `.field select`, `.fsPart input`, `.adminPasswordInput`, `.entryInput`, `.commentTextarea`) all paired with a `:focus` border-color change. `:focus` fires on mouse click; `:focus-visible` is for keyboard. Gold ring must use `:focus-visible` not just `:focus`.

**Why:** DESIGN.md requires `outline: 2px solid rgba(160, 124, 48, 0.75)` via `:focus-visible`. Using only `:focus` border-color as the visual indicator is insufficient for keyboard accessibility. Discovered 2026-04-02.

**How to apply:** Keep the `:focus` border change for mouse users if desired, but add a `:focus-visible` rule with the gold outline on every element that sets `outline: none`.

---

## `galleryTagPillSelected` — selected state has no color/border change

`.galleryTagPillSelected` in page.module.css (scout-leads gallery) only sets `font-weight: 700`. DESIGN.md Light Mode Interactive Tiles selected state requires `background: rgba(189, 151, 72, 0.12); border-color: rgba(160, 124, 48, 0.6)`. The pill is visually indistinguishable from hover state on selection.

**Why:** The selected state must be visually distinct from unselected. Discovered 2026-04-02.

**How to apply:** Add `background: rgba(189, 151, 72, 0.12); border-color: rgba(160, 124, 48, 0.6); color: #a07c30;` to `.galleryTagPillSelected`.

---

## `.galleryDeleteBtn` — touch target below 44px minimum

`.galleryDeleteBtn` in page.module.css uses `padding: 4px` with no `min-height`/`min-width`. The rendered size will be well under 44px. Systemic pattern for small icon/utility delete buttons. Discovered 2026-04-02.

**Why:** DESIGN.md Mobile-First — 44px minimum touch target at all widths.

**How to apply:** Add `min-width: 44px; min-height: 44px` to `.galleryDeleteBtn` even if the visible icon is smaller.

---

## LightboxModal `closeBtn` — off-token white border and off-token white text

`.closeBtn` in LightboxModal.module.css uses `border: 1.5px solid rgba(255, 255, 255, 0.4)` and `color: #fff`. The modal spec does not define a white-border close button. The correct treatment for a close button on a dark overlay is to follow the dark mode Muted/Cancel button style: `rgba(255,255,255,0.15)` bg / `rgba(255,255,255,0.15)` border, or a gold outlined button. Also missing `:focus-visible`. Discovered 2026-04-02.

**Why:** DESIGN.md button tokens are finite. No white-border close button variant is defined. The "What NOT to do" forbids `#ffffff` (pure white) backgrounds on interactive elements — `color: #fff` on text is not that rule, but border and background tokens should match the palette.

**How to apply:** Style `.closeBtn` as a dark-mode Muted/Cancel button (`border: 1.5px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: rgba(232,213,163,0.6)`) or go with gold outlined (`border: 1.5px solid rgba(189,151,72,0.55); color: #bd9748`). Add `:focus-visible`.

---

## Off-token surface color `#faf8f3` (one digit off from spec)

`.scatterAxisSelect` in scout-leads/page.module.css uses `background: #faf8f3` — one digit off from the spec token `#faf8f4` (Surface alt). Causes a barely-visible but technically off-spec warm tint. Discovered 2026-04-02.

**Why:** Palette tokens must be exact. `#faf8f3` has a cooler/grayer tone than the intended `#faf8f4`.

**How to apply:** Replace `#faf8f3` with `#faf8f4`.
