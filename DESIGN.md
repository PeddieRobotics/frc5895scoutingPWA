# Design System — FRC 5895 Scouting PWA

This document captures the visual design language used throughout the app. Apply these principles consistently when building or updating any page or component.

> **Modes at a glance**
> - **Dark mode** — used on the scouting form (`/`). Arena-ready: high contrast, minimal glare, gold on navy.
> - **Light mode** — intended for data/display pages (`/team-view`, `/match-view`, `/picklist`, `/compare`, etc.). Easier to read in daylight, still consistent with the brand.

---

## Core Aesthetic

**Dark navy glass** — deep navy backgrounds with translucent glass-card surfaces, gold accent color throughout, warm off-white text. Optimized for mobile use in a loud, dim arena environment.

---

## Color Palette

| Role | Value | Usage |
|---|---|---|
| **Page background** | `#0b1929` | Body/page background |
| **Surface (cards, inputs)** | `rgba(255, 255, 255, 0.05)` | Cards, tiles, input fields |
| **Surface hover** | `rgba(255, 255, 255, 0.09)` | Hover state on interactive surfaces |
| **Gold accent** | `#bd9748` | Labels, borders, dividers, key UI chrome |
| **Gold border default** | `rgba(189, 151, 72, 0.22)` | Default card/input borders |
| **Gold border hover** | `rgba(189, 151, 72, 0.5)` | Hover state borders |
| **Gold border strong** | `rgba(189, 151, 72, 0.7)` | Active/focused borders, focus rings |
| **Gold tinted fill** | `rgba(189, 151, 72, 0.1–0.18)` | Selected state backgrounds (e.g., multiselect) |
| **Warm text** | `#e8d5a3` | Primary body/label text |
| **Warm text dim** | `rgba(232, 213, 163, 0.6–0.8)` | Secondary/description text |
| **Green (success/checked)** | `rgba(60, 180, 90, 0.15)` fill / `rgba(60, 180, 90, 0.5)` border | Selected radio, checkboxes, success counters |
| **Green text** | `#9de387` | Labels inside a selected/confirmed state |
| **Red (danger)** | `rgba(255, 80, 80, 0.12)` fill / `rgba(255, 120, 120, 0.55)` border | Destructive actions (clear, delete) |
| **Red text** | `#ffaaaa` | Text on destructive buttons |
| **Amber (warning)** | `rgba(255, 160, 0, 0.18)` fill | Armed / confirm-required state |

---

## Typography

- **Font family**: `'Montserrat', sans-serif` — everywhere, no exceptions
- **Section headers**: `font-size: 20–22px`, `font-weight: 800`, ALL-CAPS, `letter-spacing: 0.08–0.1em`, color `#bd9748`
- **Sub-headers**: `font-size: 16–19px`, `font-weight: 700`, color `rgba(189, 151, 72, 0.8–0.9)`
- **Field labels**: `font-size: 20px`, `font-weight: 800`, color `#bd9748`
- **Body / option labels**: `font-size: 15px`, `font-weight: 600`, color `#e8d5a3`
- **Descriptions / hints**: `font-size: 12px`, `font-weight: 500`, `font-style: italic`, color `rgba(232, 213, 163, 0.6)`
- **Numeric values (counters, timers)**: `font-size: 24px+`, `font-weight: 700`, `font-variant-numeric: tabular-nums`
- **Button labels**: `font-size: 13–16px`, `font-weight: 600–700`, `letter-spacing: 0.02–0.03em`

---

## Surfaces & Cards

```css
/* Standard glass card */
background: rgba(255, 255, 255, 0.05);
border: 1.5px solid rgba(189, 151, 72, 0.22);
border-radius: 10–12px;
padding: 10–16px;
box-sizing: border-box;
```

- Always use `box-sizing: border-box` so padding doesn't break `width: 100%` layouts.
- Containers that hold grouped options (SingleSelect, MultiSelect, collapsible sections) get a slightly darker, more padded card: `border-radius: 12px`, `padding: 10px`.
- Modal/overlay dialogs get a solid background (`#0b233b`) with a 2px gold border and `border-radius: 10px`.

---

## Dividers

Use gradient `hr` rules rather than solid lines:

```css
hr {
    border: none;
    height: 1.5px;
    background: linear-gradient(to right, transparent, rgba(189, 151, 72, 0.5), transparent);
    width: 75%;
    margin: 4px auto 6px;
}
```

---

## Buttons

All buttons use `font-family: 'Montserrat', sans-serif`, `font-weight: 600–700`, `border-radius: 10–18px`, and `cursor: pointer`.

### Primary / Confirm
```css
border: 1.5px solid rgba(189, 151, 72, 0.55);
background: rgba(189, 151, 72, 0.12);
color: #e8d5a3;
/* hover */
background: rgba(189, 151, 72, 0.2);
border-color: rgba(189, 151, 72, 0.8);
color: #f5e6b8;
```

### Destructive / Clear
```css
border: 1.5px solid rgba(255, 120, 120, 0.55);
background: rgba(255, 80, 80, 0.12);
color: #ffaaaa;
/* hover */
background: rgba(255, 80, 80, 0.22);
border-color: rgba(255, 120, 120, 0.8);
color: #ffcccc;
```

### Armed / Confirm-Required (two-tap pattern)
```css
background: rgba(255, 160, 0, 0.18);
border-color: rgba(255, 180, 0, 0.7);
color: #ffd966;
animation: pulse 0.6s ease-in-out infinite alternate;
@keyframes pulse {
    from { box-shadow: 0 0 0px rgba(255, 180, 0, 0); }
    to   { box-shadow: 0 0 8px rgba(255, 180, 0, 0.45); }
}
```

### Muted / Cancel
```css
border: 1.5px solid rgba(255, 255, 255, 0.15);
background: rgba(255, 255, 255, 0.05);
color: rgba(232, 213, 163, 0.6);
```

### Active press
```css
:active { transform: scale(0.96); }
```

---

## Focus Rings

Always gold, never the default blue:

```css
:focus-visible {
    outline: 2px solid rgba(189, 151, 72, 0.7);
    outline-offset: 2px;
}
```

---

## Interactive Tiles (options, checkboxes, radio buttons)

```css
/* Base tile */
background: rgba(255, 255, 255, 0.05);
border: 1.5px solid rgba(189, 151, 72, 0.2);
border-radius: 10px;
padding: 11px 16px;
transition: background 0.15s ease, border-color 0.15s ease;

/* Hover */
background: rgba(255, 255, 255, 0.09);
border-color: rgba(189, 151, 72, 0.5);

/* Checked (radio — green) */
background: rgba(60, 180, 90, 0.15);
border-color: rgba(60, 180, 90, 0.5);

/* Checked (multi / toggle — gold) */
background: rgba(189, 151, 72, 0.14);
border-color: rgba(189, 151, 72, 0.55);
```

Use `accent-color: #4ab868` for radio inputs and `accent-color: #bd9748` for checkboxes to style the native control.

---

## Collapsible Sections

The trigger checkbox and its expanded content live inside a single containing box — they are never separated:

```css
.collapsibleBox {
    border: 1.5px solid rgba(189, 151, 72, 0.25);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    padding: 10px 8px 12px;
    gap: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
}
```

The trigger is always the first child. Content renders below it when expanded.

---

## Overlay / Modal Dialogs

```css
/* Backdrop */
position: fixed; inset: 0;
background: rgba(11, 35, 59, 0.95);
z-index: 1000;

/* Dialog box */
background: #0b233b;
border: 2px solid #bd9748;
border-radius: 10px;
padding: 28px 24px;
max-width: 360px;
width: 90%;
```

---

## Transitions

- Color/border/background changes: `0.15s ease`
- Transform (press): `0.1s ease`
- Do not animate layout properties (height, width) on mobile — prefer opacity or transform.

---

## Mobile-First Rules

- All interactive targets: minimum **44px** touch target height
- `max-width` on centered content: `300–320px` for form controls, wider for data tables/cards
- Test at **320px** width (minimum supported)
- Avoid fixed pixel widths — use `width: 100%` + `max-width` + `box-sizing: border-box`
- Font sizes scale down one step at `@media (max-width: 480px)` and again at `@media (max-width: 320px)`

---

## Two-Tap Confirm Pattern

For any destructive or irreversible action:

1. First tap: arm the button (amber/warning state + pulsing glow), set a 3-second auto-revert timeout
2. Second tap within 3s: execute the action
3. Any navigation or external state change cancels the armed state

This prevents accidental data loss during fast-paced match scouting.

---

## What NOT to do

- No hardcoded `#ffffff` or `#000000` backgrounds on interactive elements
- No blue focus rings (`rgb(87,171,254)` etc.) — always gold
- No sans-serif fonts other than Montserrat
- No `font-size: 25px` on labels via global selectors (this was a historical bug — avoid global label size rules entirely)
- No inline `style={{ backgroundColor: ... }}` for theme colors — all colors belong in CSS modules
- No solid borders on `hr` elements — use gradient rules

---

---

# Light Mode Design System

Used on data and display pages (`/team-view`, `/match-view`, `/picklist`, `/compare`, and future analytics pages). Never applied to the scouting form.

## Philosophy

Light mode should feel like a **premium scouting dashboard** — clean, readable in full daylight, and still clearly part of the same app as the dark form. The gold accent carries over; navy shifts from background to text/border; warm cream inverts to serve as a subtle surface tint.

---

## Color Palette (Light Mode)

| Role | Value | Usage |
|---|---|---|
| **Page background** | `#f4f1eb` | Warm off-white — avoids clinical pure white |
| **Surface (cards)** | `#ffffff` | Primary card background |
| **Surface alt** | `#faf8f4` | Slightly warm alternate surface (nested cards, table rows) |
| **Surface hover** | `rgba(189, 151, 72, 0.07)` | Hover on interactive rows/tiles |
| **Gold accent** | `#a07c30` | Darker gold for legibility on light — headers, borders, icons |
| **Gold accent bright** | `#bd9748` | Decorative use only (gradients, large headings) — too low contrast for small text |
| **Gold border default** | `rgba(160, 124, 48, 0.25)` | Card/section borders |
| **Gold border hover** | `rgba(160, 124, 48, 0.55)` | Hover state borders |
| **Gold border strong** | `rgba(160, 124, 48, 0.8)` | Active/focus rings |
| **Gold tinted fill** | `rgba(189, 151, 72, 0.1)` | Selected/highlighted backgrounds |
| **Navy text (primary)** | `#0d1f35` | Headings, labels, values |
| **Navy text (secondary)** | `rgba(13, 31, 53, 0.65)` | Subtext, descriptions, metadata |
| **Navy text (dim)** | `rgba(13, 31, 53, 0.4)` | Placeholders, disabled states |
| **Green (success)** | `#1a7f3c` | Positive stats, good ratings |
| **Green fill** | `rgba(26, 127, 60, 0.1)` | Success card backgrounds |
| **Red (danger/low)** | `#c0392b` | Negative stats, destructive actions, alert/warning banners |
| **Red fill** | `rgba(192, 57, 43, 0.08)` | Danger card backgrounds, alert banners |
| **Amber (warning)** | `#c07000` | Warning states, armed buttons |
| **Divider** | `rgba(160, 124, 48, 0.2)` | Horizontal rules, table lines |
| **Shadow** | `0 2px 8px rgba(13, 31, 53, 0.08)` | Card elevation |
| **Shadow (hover)** | `0 4px 16px rgba(13, 31, 53, 0.13)` | Lifted card on hover |

---

## Typography (Light Mode)

Same font family (`'Montserrat', sans-serif`) as dark mode. Weight and size roles are identical — only colors change.

| Role | Size | Weight | Color |
|---|---|---|---|
| Page title | 28–32px | 800 | `#0d1f35` |
| Section header | 18–22px | 700–800 | `#a07c30` |
| Card title / label | 14–16px | 700 | `#0d1f35` |
| Body text | 14–15px | 500–600 | `rgba(13, 31, 53, 0.85)` |
| Description / hint | 12–13px | 500 | `rgba(13, 31, 53, 0.55)` |
| Stat values / numbers | 20–28px | 700 | `#0d1f35` |
| Table header | 13px | 700 | `#a07c30` |
| Table body | 13–14px | 500 | `rgba(13, 31, 53, 0.8)` |

> **Never** use `#bd9748` (bright gold) for text smaller than ~22px on a white background — it fails WCAG AA contrast. Use `#a07c30` instead.

---

## Surfaces & Cards

```css
/* Standard card */
background: #ffffff;
border: 1.5px solid rgba(160, 124, 48, 0.25);
border-radius: 12px;
padding: 16px;
box-shadow: 0 2px 8px rgba(13, 31, 53, 0.08);
box-sizing: border-box;

/* Card hover (if interactive) */
box-shadow: 0 4px 16px rgba(13, 31, 53, 0.13);
border-color: rgba(160, 124, 48, 0.5);
```

- Use `box-shadow` for elevation instead of heavier borders — light mode reads depth through shadow, not background contrast.
- Nested cards or table rows use `background: #faf8f4` to distinguish from their parent.
- Stat highlight cards (e.g., EPA callout, big number) can use `background: rgba(189, 151, 72, 0.08)` with a gold border for emphasis.

---

## Dividers

```css
hr {
    border: none;
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(160, 124, 48, 0.35), transparent);
    margin: 8px auto;
}
```

Solid `1px` lines are also acceptable inside tables at `rgba(160, 124, 48, 0.15)`.

---

## Buttons (Light Mode)

### Primary / Action
```css
background: #a07c30;
color: #ffffff;
border: none;
border-radius: 8px;
font-weight: 700;
/* hover */
background: #8a6a28;
```

### Secondary / Outline
```css
background: transparent;
border: 1.5px solid rgba(160, 124, 48, 0.55);
color: #a07c30;
border-radius: 8px;
font-weight: 600;
/* hover */
background: rgba(160, 124, 48, 0.08);
border-color: rgba(160, 124, 48, 0.8);
```

### Destructive
```css
background: transparent;
border: 1.5px solid rgba(192, 57, 43, 0.5);
color: #c0392b;
/* hover */
background: rgba(192, 57, 43, 0.08);
```

### Active press
```css
:active { transform: scale(0.97); }
```

### Navigation Team Chips (match-view / compare sticky nav bar)

Team number buttons in the sticky nav bar use an outlined style with alliance- or compare-specific accent colors. The **currently-viewed team** is shown in a solid-fill "inverted" state: background becomes the chip's accent color, text becomes white.

```css
/* Inactive chip — outlined */
background: transparent;
border: 1.5px solid <accent-color at 0.35 opacity for gold default, 0.45 for alliance/compare colors>;
color: <accent-color>;
border-radius: 8px;
font-size: 15px;
font-weight: 700;
min-height: 44px;

/* Active chip — inverted/filled */
background: <accent-color>;
border-color: <accent-color>;
color: #ffffff;
font-weight: 800;

/* Hover on active */
opacity: 0.88;
```

Accent colors by role:
- Red alliance: `#c0392b`
- Blue alliance: `#1e40af`
- Compare team 1 (teal): `#0f766e`
- Compare team 2 (cobalt): `#1d4ed8`
- Compare team 3 (purple): `#6d28d9`
- Compare team 4 (pink): `#be185d`
- Gold fallback (no alliance): `#a07c30`

The nav bar box itself is `position: sticky; top: 45px`. When pinned against the navbar, apply `border-radius: 0 0 12px 12px; border-top-color: transparent`. When floating (content above it), use `border-radius: 12px` with side margins for breathing room.

---

## Focus Rings

Same rule as dark mode — always gold, never browser default blue:

```css
:focus-visible {
    outline: 2px solid rgba(160, 124, 48, 0.75);
    outline-offset: 2px;
}
```

---

## Interactive Rows / Tiles

```css
/* Base */
background: #ffffff;
border: 1px solid rgba(160, 124, 48, 0.2);
border-radius: 8px;
padding: 10px 14px;
transition: background 0.15s ease, box-shadow 0.15s ease;

/* Hover */
background: rgba(189, 151, 72, 0.07);
box-shadow: 0 2px 6px rgba(13, 31, 53, 0.08);

/* Selected */
background: rgba(189, 151, 72, 0.12);
border-color: rgba(160, 124, 48, 0.6);
```

---

## Data Tables

```css
/* Table container */
background: #ffffff;
border: 1.5px solid rgba(160, 124, 48, 0.25);
border-radius: 12px;
overflow: hidden; /* clips row backgrounds to rounded corners */

/* Header row */
background: rgba(189, 151, 72, 0.1);
color: #a07c30;
font-weight: 700;
font-size: 13px;
letter-spacing: 0.04em;
text-transform: uppercase;

/* Body rows — alternate */
background: #ffffff;          /* odd */
background: #faf8f4;          /* even */

/* Row hover */
background: rgba(189, 151, 72, 0.07);

/* Cell borders */
border-bottom: 1px solid rgba(160, 124, 48, 0.1);
```

---

## Stat / Metric Cards

For callout numbers (EPA, PPR, win rate, etc.):

```css
/* Container */
background: #ffffff;
border: 1.5px solid rgba(160, 124, 48, 0.22);
border-radius: 12px;
padding: 14px 16px;
box-shadow: 0 2px 8px rgba(13, 31, 53, 0.07);

/* Metric label */
font-size: 12px;
font-weight: 700;
color: #a07c30;
text-transform: uppercase;
letter-spacing: 0.06em;

/* Metric value */
font-size: 26–32px;
font-weight: 800;
color: #0d1f35;
font-variant-numeric: tabular-nums;
```

Color-code stat values contextually:
- Good/high: `#1a7f3c`
- Neutral: `#0d1f35`
- Low/bad: `#c0392b`

---

## Charts & Graphs

- Background: `transparent` or `#ffffff` — never dark navy
- Grid lines: `rgba(160, 124, 48, 0.12)`
- Axis labels: `rgba(13, 31, 53, 0.55)`, 11–12px, Montserrat
- Primary data line/bar: `#a07c30` or `#2563eb` (blue for multi-series where gold is already used)
- Tooltip background: `#0d1f35` with white text — a dark tooltip on a light page reads cleanly and creates contrast
- Tooltip border: `rgba(189, 151, 72, 0.6)`

---

## Page Layout

- Max content width: `900–1100px`, centered with `margin: 0 auto`
- Side padding: `16px` on mobile, `24–32px` on desktop
- Section gap: `24px` between major sections
- Card grid: CSS Grid, `repeat(auto-fit, minmax(160px, 1fr))` for stat card rows
- Always `box-sizing: border-box`

---

## Transitions

Same timing as dark mode:
- Color/border/background: `0.15s ease`
- Box-shadow: `0.15s ease`
- Transform: `0.1s ease`

---

## What NOT to do (Light Mode)

- Don't use `#bd9748` bright gold for small text — contrast fails on white
- Don't use dark navy (`#0b1929`) as a background — light mode pages stay light
- Don't mix light and dark surfaces on the same page (e.g., a dark card inside a light page)
- Don't remove `box-shadow` from cards — shadow is what creates depth in light mode
- Don't use pure `#000000` for text — use `#0d1f35` for the slight warmth
- Don't use pure `#ffffff` as the page background — `#f4f1eb` prevents the sterile pure-white look
