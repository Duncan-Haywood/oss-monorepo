---
kind: polish
topics: [design, performance]
date: 2026-11-17
---
# Polish: the "See it working" gallery shows close crops

Date: 2026-11-17. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-16-hero-crops.md` ("The 'See it working' gallery shows the other six stills at
about 360 px"). Open PRs searched (`polish in:title`): #11730, #14012, #12397, #16759; none touch
`showcase.mjs` or `showcase/`. I built the site, served `dist/` and screenshotted the hub gallery at
390 and 1,280 px before and after.

## What was wrong

The hub's gallery cards are 280 to 440 px wide. Each showed a full 1,280 px page still, so body text
came out about 3 px tall: the cards read as "a page with a table" and nothing more. Only the three
hero tools had a close crop (`hero` in `capture.mjs` SHOTS), and the gallery ignored it.

## What changed

- `platform/pages/showcase.mjs`: `renderShowcaseSection` uses a shot's `hero` crop (600 x 375) when
  there is one and falls back to the full still (960 x 600). Same 16:10 box, so no layout shift.
- `platform/pages/showcase/capture.mjs`:
  - `hero` selectors for the other six tools, each picked by looking at the tool at 720 px:
    Band Tour `#big` (headline numbers, then the per-show verdicts), League Schedule
    `#rounds-table`, Seating `#tables`, Invoice Maker `#dash` (Receivables), Postmortem
    `#report-card` (Response metrics), Greenhouse `h3:has(+ .scroll #weeks)` (Space by week; the
    Sowing plan table opened on three rows of 0 sown, which reads as broken at a glance).
  - The crop is cut from the viewport after scrolling, not from a full-page shot, and the top is
    measured again after the 300 ms settle. A full-page capture lays the page out again at its
    whole height; on League Schedule that moved the table about 20 px and the note above it
    showed at the top of the crop.
  - The "element before" for the 12 px top pad is now the nearest visible earlier sibling of the
    element or of any parent (a table inside a `.scroll` wrapper had none of its own).
- All nine stills and crops retaken (`--stills-only`; the reel is unchanged). Two full stills
  (invoice-maker, incident-postmortem-timeline) changed because the tools had changed.
- `platform/pages/showcase.test.mjs`: the gallery test now expects the crop with a full-still
  fallback, and a new test fails when any manifest shot lacks a crop on disk, so a new SHOTS entry
  needs a `hero` selector.

## Measured

| | before | after |
|---|---|---|
| gallery image bytes (9 cards) | 277,514 (full stills) | 165,952 (crops), -40% |
| text scale in a 280 px card | 1,280 px page, about 0.22x | 720 px layout, about 0.39x (1.8x larger) |
| sideways scroll at 390 / 1,280 | none / none | none / none |

Screenshots: `docs/reports/img/polish-2026-11-17-gallery-crops/` (`before-1280.webp`,
`after-1280.webp`, `after-390.webp`). Tests: `node --test 'platform/pages/*.test.mjs'`, see the PR.

## Still weakest, and what I would do next

1. **The reel still dates from 2026-10-20** and leaves out Wall Framing Takeoff. Rerun
   `capture.mjs` without `--stills-only` and check the ffmpeg output stays about 1 MB.
2. **Crops are 600 px wide** and a 440 px card on a 2x screen wants 880. A `srcset` with a 1,200 px
   crop would sharpen both the hero and the gallery for about 15 KB more per card.
3. **Greenhouse Bench Planner's example** sows 0 of three crops on its own worked example (Sowing
   plan rows 1 to 3). Worth a look in the tool: either the example or the plan is off.
4. Carried over: Wall Framing Takeoff's grey "Saved bids" buttons (shared saved-bids band); the
   blog post header's lone "Source" link; tools topic chips without a lede.
