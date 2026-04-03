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

## PrescoutSection.module.css — table row styling

Correct table alternating row pattern:
- `.row:nth-child(even)` cells use `background: #faf8f4` (spec alt surface)
- `.row:nth-child(odd)` cells implicitly `#ffffff`
- Cell border: `1px solid rgba(160, 124, 48, 0.1)` — exact spec value
- Last row border-bottom: `none` — clean edge handling
- `fieldCell` color: `#a07c30`, `font-weight: 600`, `font-size: 12px` (12px is below spec 13px — use 13px)
- `valueCell` color: `#0d1f35` — correct navy primary
