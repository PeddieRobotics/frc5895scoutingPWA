---
name: DESIGN.md Ambiguities and Interpretations
description: Sections of DESIGN.md that required interpretation or are ambiguous — record rulings made
type: project
---

## Red text color on white — contrast floor

`#c0392b` on `#ffffff` is ~4.56:1 contrast. DESIGN.md flags `#bd9748` bright gold explicitly as failing WCAG AA on white for small text, but does not call out the same caveat for `#c0392b`. At 20px/800 weight (bold) WCAG AA requires only 3:1, so errorTitle usage passes. No violation, but there is almost no headroom.

**Ruling:** Use `#c0392b` for error/danger text freely at 18px+ bold. At smaller sizes, verify contrast if accessibility is audited.

---

## box-sizing: border-box — explicit vs. global reset

DESIGN.md says "Always use `box-sizing: border-box`." This is interpreted as: if a global CSS reset covers it (Next.js default `* { box-sizing: border-box }`), individual component classes do not need to repeat it unless they have `width: 100%` + padding where overflow would be visually obvious. Cards and form elements with `width: 100%` should still declare it explicitly as a safety measure.

---

## :focus-visible gold ring — global vs. per-component

DESIGN.md requires gold focus rings everywhere. Interpreted as: this should be in a global stylesheet. Per-component overrides are only necessary if the component has an opaque background that would hide a global outline. Not flagging absence of per-button :focus-visible as a violation if a global rule exists — flag it as a Warning instead.

---

## Icon-only button font-size exception (unresolved)

DESIGN.md button label spec is 13–16px. No exception is made for single-character icon buttons (e.g., ‹ › × for lightbox nav/close). In practice, `font-size: 28px` is used on LightboxModal navBtn chevrons for legibility inside a 48px circle — this appears intentional. Flagging as a warning, not a hard violation, until the spec explicitly adds an icon-button exception. If no exception is added, 18–20px is the suggested compromise range. Discovered 2026-04-02.

---

## Blue alliance button tokens — not in dark mode palette (unresolved)

BettingSection needs visually distinct red/blue alliance buttons but DESIGN.md dark mode has no blue color family. Current implementation borrows from Light Mode Navigation Chip colors (`#1e40af` / `rgba(30, 64, 175, ...)`) which is not an explicit cross-mode reference. Text colors `#93b5ff` / `#bbccff` are entirely invented. Discovered 2026-04-06.

**Ruling:** Flag `.blueButton` text colors as off-palette violations until an explicit blue alliance token entry is added to the dark mode Color Palette table in DESIGN.md. The `rgba(30, 64, 175, ...)` fill/border values are defensible as borrowed from Light Mode chips, but document this exception in DESIGN.md. Recommended spec addition: add a "Blue alliance (betting)" row to the dark mode palette with fill `rgba(30, 64, 175, 0.15)`, border `rgba(30, 64, 175, 0.5)`, text `#e8d5a3` (warm text primary, not invented cool-blue text).

---

## `.predictionLabel` 12px/700/uppercase — no dark mode spec role

BettingSection `.predictionLabel` uses 12px/700/uppercase — this resembles the Light Mode Metric label pattern (12px/700/uppercase/letter-spacing) but is in a dark mode component. Dark mode Typography does not define a 12px non-hint label role. Discovered 2026-04-06.

**Ruling:** Treat as a warning (not violation) — the values are all on-token and legible. Recommend adding a "card sub-label" row to DESIGN.md dark mode Typography (12px/700/uppercase/`rgba(232,213,163,0.6)`) to formally document this pattern.

---

## Section gap vs. compact card margin (unresolved)

DESIGN.md Page Layout says "Section gap: 24px between major sections." BettingSection uses `margin: 8px auto 4px` — far below the 24px gap. This may be intentional as the betting card is visually part of the form flow rather than a separate major section. No explicit exception for compact form-section spacing exists. Flagging as a warning pending design lead input on whether the betting card is classified as a "major section."
