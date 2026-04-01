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
