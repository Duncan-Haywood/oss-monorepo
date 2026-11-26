---
kind: polish
topics: [design]
date: 2026-11-26
---

# Polish 2026-11-26: no zoom on focus, on every venture page

Track: polish/0. Picked from item 2 of "Still weakest" in
`polish-2026-11-26-construction-front-doors-phone.md` (a check over every bet
front door for inputs under 16 px; "the input-size half is static"). Item 1
there (retainage phone cards) is taken by open PR #19369.

## What the measurement changed

The note asked for a check. The static scan (`platform/pages/input-zoom.mjs`)
showed a check would only have listed the problem: **1,209 venture pages** set
a text field, select or textarea under 16 px in their own CSS (93 of the
front-door pages' files; 1,138 of the 1,415 tool index pages with a field).
Fixing 1,209 pages one by one, or holding them in a baseline, is the wrong
shape. So the fix went where the reflow guard went: one rule in the shared
`pf-chrome.css` that every venture page links after its own styles.

```css
@media (hover:none) and (pointer:coarse),(max-width:700px){
  input:not([type=checkbox],…,[type=hidden]),select,textarea{font-size:max(16px,1em)!important}
}
```

- Only where iOS zooms: a touch screen (landscape included) or a window
  700 px wide or less. Desktop is untouched.
- Only fields a visitor types into; checkboxes, radios, ranges and buttons keep
  their size.
- Only raises: `max(16px,1em)` keeps a field that inherits a larger size.
- `!important` because ventures set sizes at every specificity
  (`#feeders input`, inline `style=`); the browser test pins both.

## Measured (Chromium, every front-door index page in `front-doors.json`)

Each page served from its folder with the chrome stylesheet as rendered by
`renderChromeStyle()`, without the floor ("before", today's live chrome) and
with it. Script kept out of the tree (it was a one-off); the browser test
holds the behaviour.

| 202 front-door pages | before | after |
|---|---|---|
| visible typing fields under 16 px at 390 × 844 (touch) | **6,016 of 6,145** | 0 |
| pages with at least one such field | 190 | 0 |
| pages wider than 390 px | 0 | 0 |
| pages whose page width grew | — | 0 |
| pages whose field sizes changed at 1280 × 900 (no touch) | — | 0 |

Chromium does not reproduce Safari's zoom itself, so this measures the cause
(computed font size), not the zoom. No screenshots: at 390 px the change is
one pixel of type per field, and the visible defect only exists on an iPhone.

## What changed

- `platform/pages/input-zoom.mjs`: `INPUT_ZOOM_CSS` and the scanner
  (`node platform/pages/input-zoom.mjs` lists front doors, `--all` every page).
- `build.mjs`: `renderChromeStyle()` ends with `INPUT_ZOOM_CSS`.
- `input-zoom.test.mjs`: the floor closes the chrome; scanner parsing; and in a
  real browser, a page with 15 px, `#id`-scoped 14 px, 13 px textarea and
  inline 12 px fields renders all at 16 px on a phone and in touch landscape,
  keeps a 20 px inherited field at 20 and a checkbox at its size, and is
  unchanged on desktop.
- `stack-labels.test.mjs`: allows the floor after the card layout.
- Site-build tests: 2,116, all pass after the stack-labels fix.

## Still weakest, next

1. Site-owned pages (`pf-site.css`: hub search, category filters) do not get
   the floor; measure the hub's search box at 390 px and add it there if small.
2. Carried: retainage rate-table phone cards (PR #19369 open); two-column
   amount grid for pay-application-generator's phone cards; `sumview.mjs`
   shared asset if a third venture needs it; einvoice-preflight index FAQ has
   no `<section id="faq">`.
3. Ventures that fixed this by hand under `max-width` (lien-waiver-checker,
   mechanics-lien-deadline-calculator) can drop their copies when next
   touched; the scanner still lists the base rule, which is expected.
