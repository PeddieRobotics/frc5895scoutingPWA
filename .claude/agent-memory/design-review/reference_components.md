---
name: Good Reference Components
description: CSS classes and JSX patterns that are textbook-correct implementations of DESIGN.md — use as models
type: project
---

## .editButton (match-view and team-view page.module.css)

Textbook Light Mode Primary/Action button:
- `background: #a07c30`, `color: #ffffff`, `border: none`, `border-radius: 8px`
- `font-weight: 700`, `font-family: 'Montserrat'`
- hover: `background: #8a6a28`
- active: `transform: scale(0.97)`
- `min-height: 44px` (touch target)
- `transition: background 0.15s ease, transform 0.1s ease`

## .errorCard (both pages)

Correct Light Mode error/danger card:
- `background: #ffffff`, `border: 1.5px solid rgba(192, 57, 43, 0.35)`, `border-radius: 12px`
- `box-shadow: 0 2px 8px rgba(13, 31, 53, 0.08)` — shadow for elevation, not heavier borders
- All on-token values, no inline styles

## Error state JSX pattern

```jsx
<div className={styles.errorContainer}>
  <div className={styles.errorCard}>
    <h2 className={styles.errorTitle}>...</h2>
    <p className={styles.errorMessage}>...</p>
    <button className={styles.editButton} onClick={...}>Edit</button>
  </div>
</div>
```
Clean semantic HTML, no inline styles, correct element hierarchy.

## .teamChip / .teamChipActive (both pages)

Correct Navigation Team Chip implementation:
- Inactive: `background: transparent`, `border: 1.5px solid rgba(160, 124, 48, 0.35)`, `color: rgba(13, 31, 53, 0.65)`
- Active: `background: #a07c30`, `border-color: #a07c30`, `color: #ffffff`, `font-weight: 800`
- Active hover: `opacity: 0.88`
- `min-height: 44px`, `border-radius: 8px`, `font-size: 15px`, `font-weight: 700`

## prescout.module.css — .authBtn (admin/prescout/prescout.module.css)

Textbook Primary/Action button for light mode admin pages:
- `background: #a07c30`, `color: #fff`, `border: none`, `border-radius: 10px`
- `font-weight: 700`, `font-family: 'Montserrat'`, `font-size: 14px`
- Hover: `background: #8a6a28`
- Disabled: `opacity: 0.55`
- `transition: background 0.15s`
Note: missing `min-height: 44px` in current implementation — add when using as reference.

## prescout.module.css — .card

Correct standard light mode card for admin pages:
- `background: #fff`, `border: 1.5px solid rgba(160, 124, 48, 0.15)`, `border-radius: 14px`
- `box-shadow: 0 2px 12px rgba(13, 31, 53, 0.06)` — shadow for elevation
- `padding: 20px 22px`, `box-sizing: border-box` not declared but Next global reset covers it
Note: border opacity `0.15` is slightly lighter than spec `0.25` — use `0.25` in new components.

## LightboxModal.module.css — overlay backdrop

`.overlay` is a textbook-correct dark overlay backdrop for the light mode context:
- `background: rgba(13, 31, 53, 0.93)` — uses navy family, not pure black (fixes prior PhotoGallery violation)
- `position: fixed; inset: 0; z-index: 1100` — correct overlay stacking
- `box-shadow: 0 8px 48px rgba(13, 31, 53, 0.55)` on the image — navy shadow family

## TaggedPhotoGrid.module.css — wrapping thumbnail grid

Textbook light mode interactive tile in thumbnail form (changed from horizontal scroll to flex-wrap in 2026-04-02 review):
- `border: 1.5px solid rgba(160, 124, 48, 0.25)` — correct gold border default
- `border-radius: 8px`, `background: #faf8f4` — correct alt surface
- Hover: `border-color: rgba(160, 124, 48, 0.55); box-shadow: 0 2px 8px rgba(13, 31, 53, 0.1)` — correct hover
- `transition: border-color 0.15s ease, box-shadow 0.15s ease` — correct timing
- Spinner uses `border: 2px solid rgba(160, 124, 48, 0.2); border-top-color: #a07c30` — on-token loading indicator
- `.scrollRow`: `flex-wrap: wrap; justify-content: center; gap: 8px` — DESIGN.md does not mandate horizontal scroll for grids; wrapping is compliant

## scout-leads gallery — `.gallerySection` card and `.galleryUploadBtn` / `.galleryEnterBtn`

`.gallerySection` is a textbook standard light mode card:
- `background: #fff; border: 1.5px solid rgba(160, 124, 48, 0.25); border-radius: 12px; box-shadow: 0 2px 8px rgba(13, 31, 53, 0.08)`

`.galleryUploadBtn` and `.galleryEnterBtn` are textbook Primary/Action buttons:
- `background: #a07c30; color: #fff; border: none; border-radius: 8px; min-height: 44px`
- Hover: `background: #8a6a28`
- Active: `transform: scale(0.97)`

`.galleryDropZone` correctly uses dashed gold border and `#faf8f4` alt surface background.

## BettingSection.module.css — dark mode button trio and Primary/Confirm button

As of 2026-04-06, `.redButton` / `.blueButton` / `.abstainButton` and `.placeBetButton` / `.skipButton` are textbook-correct dark mode button implementations:
- `.redButton` default/hover: exact Destructive button tokens; `.abstainButton`: exact Muted/Cancel tokens
- `.placeBetButton`: exact Primary/Confirm tokens (fill, border, hover, active scale, focus ring)
- `.skipButton`: exact Muted/Cancel tokens with correct hover and focus ring
- All three alliance buttons: `min-height: 44px`, `border-radius: 12px`, `transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease`
- `.stakeAmount strong`: textbook inline numeric callout pattern — `font-size: 24px; font-weight: 800; color: #bd9748; font-variant-numeric: tabular-nums`

Note: `.winnerPercent`/`.loserPercent` at 20px and balance number inline at 15px are remaining violations as of this review.

## prescout-form.module.css — `.sectionCard`, `.teamInputCard`, `.photoSection`

Textbook standard Light Mode card implementations (after 2026-04-07 fixes):
- `background: #fff; border: 1.5px solid rgba(160,124,48,0.25); border-radius: 12px; box-shadow: 0 2px 8px rgba(13,31,53,0.08); padding: 16px`
- All on-token values; correct shadow token and border opacity

## prescout-form.module.css — `.selectTile` / `.selectTileSelected`

Textbook Light Mode interactive tile:
- Base: `background: #fff; border: 1.5px solid rgba(160,124,48,0.2); border-radius: 8px; min-height: 44px`
- Hover: `background: rgba(189,151,72,0.07); box-shadow: 0 2px 6px rgba(13,31,53,0.08)`
- Selected: `background: rgba(189,151,72,0.12); border-color: rgba(160,124,48,0.6); font-weight: 700`
- Focus ring: `outline: 2px solid rgba(160,124,48,0.75); outline-offset: 2px`
- `transition: background 0.15s, border-color 0.15s, box-shadow 0.15s`

## prescout-form.module.css — `.teamInput` / `.commentTextarea` / `.otherInput`

Textbook Light Mode form input styling (`.otherInput` confirmed fully compliant 2026-04-07):
- `background: #faf8f4` (alt surface), `border: 1.5px solid rgba(160,124,48,0.3)`, `border-radius: 10px`
- Focus ring via `:focus-visible`: `border-color: #a07c30; outline: 2px solid rgba(160,124,48,0.75); outline-offset: 2px`
- `font-family: 'Montserrat', sans-serif` explicit on all three inputs
- `box-sizing: border-box; width: 100%; transition: border-color 0.15s ease`

## prescout-upload.module.css — `.clearBtnArmed`

Textbook Light Mode Armed/Two-tap confirm state:
- `background: rgba(255,160,0,0.18); border: 1.5px solid rgba(255,180,0,0.7); color: #c07000`
- Amber pulse animation — matches exact DESIGN.md armed pattern
- `min-height: 44px`, `font-weight: 700`

## prescout-form.module.css — `.photoCaptureBtn` (camera capture, post 2026-04-07 fixes)

Textbook Light Mode Primary/Action button after camera feature review:
- `background: #a07c30; color: #fff; border: none; border-radius: 8px`
- `min-height: 44px; font-family: 'Montserrat', sans-serif; font-size: 13px; font-weight: 700`
- Hover: `background: #8a6a28`
- Active: `transform: scale(0.97)` via `:active:not(:disabled)`
- Focus ring: `outline: 2px solid rgba(160,124,48,0.75); outline-offset: 2px` via `:focus-visible`
- Disabled: `opacity: 0.55; cursor: not-allowed`

## prescout-form.module.css — `.stagedRemoveBtn` (hit-area expansion pattern)

Reference for small overlay badge buttons that must meet 44px tap target without visual enlargement:
- Visual: `width: 24px; height: 24px` (circle) plus `padding: 10px; box-sizing: content-box` — effective tap area 44x44px
- Background: `rgba(13, 31, 53, 0.65)` — navy overlay token (never raw black)
- Hover: `rgba(192, 57, 43, 0.85)` — transitions to destructive red on hover
- Focus ring: `outline: 2px solid rgba(160,124,48,0.75); outline-offset: 2px`
- `border-radius: 50%` applies to the content box; padding does not deform the visual circle
- `transition: background 0.15s ease`

## prescout-form.module.css — Prescout Tracker sidebar panel (post 2026-04-07 fixes)

`.trackerPanel` is a textbook Light Mode sticky sidebar card:
- `background: #fff; border: 1.5px solid rgba(160,124,48,0.25); border-radius: 12px; box-shadow: 0 2px 8px rgba(13,31,53,0.08); padding: 16px`
- `position: sticky; top: 60px; max-height: calc(100vh - 100px); overflow-y: auto` — correct sticky sidebar pattern
- Responsive: `width: 100%; position: static; max-height: none` at `max-width: 768px`

`.trackerTitle` (after fix): `font-size: 18px; font-weight: 800; color: #a07c30; text-transform: uppercase; letter-spacing: 0.06em` — textbook Light Mode section header.

`.trackerStatDone` / `.trackerStatTotal`: correct stat value display — `font-size: 22px/16px; font-weight: 800/700; color: #1a7f3c/#0d1f35; font-variant-numeric: tabular-nums`

`.trackerSectionLabel`: correct description/hint role — `font-size: 12px; font-weight: 700; color: rgba(13,31,53,0.55); text-transform: uppercase; letter-spacing: 0.04em`

`.trackerTeamBtn` / `.trackerTeamDone` (after fixes): compact navigation chips. Compliant colors, 1.5px borders, Montserrat, focus rings. min-height: 32px is below 44px spec — acceptable only for compact sidebar navigation chips; document any new use of sub-44px touch targets as explicitly acknowledged.

## PrescoutSection.module.css — table row styling

Correct table alternating row pattern:
- `.row:nth-child(even)` cells use `background: #faf8f4` (spec alt surface)
- `.row:nth-child(odd)` cells implicitly `#ffffff`
- Cell border: `1px solid rgba(160, 124, 48, 0.1)` — exact spec value
- Last row border-bottom: `none` — clean edge handling
- `fieldCell` color: `#a07c30`, `font-weight: 600`, `font-size: 12px` (12px is below spec 13px — use 13px)
- `valueCell` color: `#0d1f35` — correct navy primary
