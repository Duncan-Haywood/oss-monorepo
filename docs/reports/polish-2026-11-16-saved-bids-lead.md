---
kind: polish
topics: [design]
date: 2026-11-16
---
# Polish 2026-11-16: the Saved bids band opens with a sentence

Track: polish/0. Picked from `polish-2026-11-16-hero-crops.md`, "Still weakest" item 3: Wall
Framing Takeoff at 1,280 px shows "Saved bids" and "Copy link to this bid" as small grey buttons
with nothing explaining them. The band is shared (`platform/pages/jobs.mjs`), so the fix reaches
every page that has it. Open PRs checked (60 listed): none touch `jobs.mjs` or the band.

## What was wrong

`#pf-jobs-status` was empty until the visitor had a saved bid (`start()` only called `say()` when
`saved > 0`). In band mode `build.mjs` hides an empty status (`.pf-jobs-status:empty{display:none}`),
so a first visit showed a bare button. The shop-rates bar right above it has always had a
first-visit sentence (`RATES_FIRST_VISIT_STATUS`, in the markup and in the script).

## What changed (`platform/pages/jobs.mjs`)

- `JOBS_FIRST_VISIT_STATUS = 'Save bids, mark them won or lost.'`, exported. It goes in the built
  markup (from first paint, and crawlable), and `start()` writes it when there are no saved bids
  (otherwise the count, as before). Same pattern as rates.
- `JOBS_CSS`: under 600 px, when the row also holds `#pf-link-copy`, the status takes the full row
  (`flex-basis:100%`), so the two buttons stay together instead of the second being pushed onto a
  row by itself.
- `jobs.test.mjs`: the markup carries the sentence, the module writes the same string, the count
  still wins when bids exist, and the sentence is at most 34 characters.

## Measured (production build, Playwright, every page with the band, JS on)

"Before" is the same page with the status emptied by script, which is what the old build shipped.

| | 390 px | 1,280 px |
|---|---|---|
| pages with the band | 168 | 168 |
| sentence on the button's row | 145 | 168 |
| band height median, before → after | 36.4 → 36.4 px | 36.4 → 36.4 px |
| band grew | 33 (all `#pf-link-copy` pages, +26/27 px) | 0 |
| sideways scroll | 0 | 0 |

Wording fit test (band no taller than with an empty status, 168 pages):

| text | 360 px | 390 px |
|---|---|---|
| Keep this bid by name, then mark it won or lost. (first draft) | — | 0 |
| Save a bid, then mark it won or lost. | 0 | 125 |
| Keep this bid, mark it won or lost. | 124 | 135 |
| **Save bids, mark them won or lost.** | 124 | 135 |
| Save it, mark it won or lost. | 135 | 135 |

135 is the ceiling: on the 33 copy-link pages, no sentence fits beside two buttons at phone
width. I took clarity ("Save bids") over the last 11 pages at 360 px ("Save it" is vague next to a
button). Screenshots: `img/polish-saved-bids-lead-390.png` (Painting Bid Calculator) and
`img/polish-saved-bids-lead-1280.png` (Wall Framing Takeoff).

These numbers came from the full build of the first draft, with `pf-jobs.css`, `pf-jobs.js` and the
status text then regenerated in `dist/` from the final `jobs.mjs` (same render functions the build
calls), not from a second full build.

## Still weakest, and what I would do next

1. **Two stacked bars on the 118 pages that carry both (counted in `dist/`), at 390 px**: "Save your rates once — every calculator
   here uses them." wraps to two lines and its button gets a third row, then the saved-bids row:
   about 110 px between the lede and the form on Painting Bid Calculator (not measured site-wide). Merging the two into one band ("Your shop rates ·
   Saved bids") on a phone, or shortening the rates sentence to fit beside its button (same fit
   test as above; the script is `measure`/`fit` style, about 2 minutes for 168 pages), would give
   the form back most of that height.
2. The 33 copy-link pages could carry the link button inside the saved-bids panel on a phone
   instead of on the row; then the sentence would fit beside one button everywhere.
3. Carried over: other tool heroes with 90+ word ledes (`polish-2026-11-16-einvoice-lede.md`,
   item 1); the reel still from 2026-10-20; the hub's 980 to 1,180 px empty margin.
