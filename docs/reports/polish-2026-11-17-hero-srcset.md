---
kind: note
topics: [design, performance]
date: 2026-11-17
---
# Polish: 1,200 px twins for the hub's tool crops, in a srcset (2026-11-17)

Date: 2026-11-17. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-17-gallery-crops.md` ("Crops are 600 px wide and a 440 px card on a 2x screen
wants 880"), and item 1 of `polish-2026-11-17-greenhouse-example.md` (recapture the
greenhouse-bench-planner still). Open PRs searched (`list_pull_requests`, open, 50): none touch
`platform/pages/showcase*`; #16792 (polish, tool h1s) is unrelated.

## What I measured first

The premise in the earlier report was off. With Playwright on the built hub, the gallery card
(`.shots li`) is **280 px wide at every width from 840 to 1,600 px**, not 280 to 440: the scrolling
grid (`grid-auto-columns: minmax(280px, 34%)`) settles on the minimum. Under 640 px it is 82% of
the band, about 290 to 320 px. The hero cards are 300 px (304 rendered, rotated).

So on a 2x desktop the 600 px crop is already enough (280 x 2 = 560). It is soft where the
device asks for more than 600 px: phones at 2x (82vw x 2, about 640) and 3x (about 870 to 960),
and 3x desktops (840). Most current phones are 3x.

## What changed

- `showcase/capture.mjs` saves each hero crop twice from the same 1,440 x 900 capture: the
  600 x 375 file as before and a 1,200 x 750 `*-hero-1200.webp` (quality 72), named `heroWide`
  in `manifest.json`.
- `showcase.mjs`: `stillSrc()` writes `srcset="... 600w, ...-hero-1200.webp 1200w"` with a
  `sizes` that matches the measured slot (`(max-width: 640px) 82vw, 280px` for the gallery,
  `300px` for the hero). A missing twin drops out in `loadShowcase` and the `<img>` stays as it
  was; `copyShowcase` publishes the twins.
- All nine stills were recaptured (`--stills-only`, reel kept). Only Greenhouse Bench Planner's
  still and crop changed, as expected after the same day's example fix
  (`polish-2026-11-17-greenhouse-example.md`): the other eight came out byte-identical.
- Two tests in `showcase.test.mjs`: the srcset and fallback, and every crop in the manifest has
  its twin on disk.

## Before and after (Playwright, hub at http.server, which file the browser chose)

| Screen | Before | After |
|---|---|---|
| 390 px, 1x | 600 px crop | 600 px crop |
| 390 px, 2x | 600 px crop | 1,200 px crop |
| 390 px, 3x | 600 px crop | 1,200 px crop |
| 1,280 px, 1x / 2x | 600 px crop | 600 px crop |
| 1,280 px, 3x | 600 px crop | 1,200 px crop |

Side by side at 390 px, 3x (left before, right after; the first card's top-left, enlarged):
`docs/reports/img/polish-2026-11-17-hero-srcset.webp`. The stud lines, dashed rough openings
and the legend text are visibly crisper.

Weight: the nine twins are 30 to 61 KB (379 KB together) against 13 to 28 KB for the 600 px
crops, so a device that takes them pays about 25 KB more per card it scrolls to; images are lazy,
so a phone loads the first one or two. 1x and 2x desktops download nothing new.

## Still weakest, and what I would do next

1. **The desktop gallery never uses its 34% maximum.** Cards are 280 px in a 1,088 px band at
   1,280 and 1,600 px, about 3.7 visible with a peek. If wider cards read better, set
   `grid-auto-columns: calc((100% - 32px) / 3)` above 900 px; the srcset already covers 2x there
   (363 x 2 = 726 > 600). Look at it before changing it: the peek tells people the row scrolls.
2. **The reel still dates from 2026-10-20** and leaves out Wall Framing Takeoff
   (`polish-2026-11-17-gallery-crops.md`, item 1). Rerun `capture.mjs` without `--stills-only`.
3. Carried over from `polish-2026-11-17-greenhouse-example.md`: item 2 (`today` only warns) and
   item 3 (the space-sweep note).
