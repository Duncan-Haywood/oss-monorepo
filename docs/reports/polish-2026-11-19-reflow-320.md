---
kind: polish
topics: [design, accessibility]
date: 2026-11-19
---
# Polish, 2026-11-19: no tool page scrolls sideways at 320 px (auto-fit grid minimums)

Track: polish/0. PR #17795 (draft opened before the sweep, to claim the item). Post:
`docs/posts/2026-11-19-twenty-one-tools-scrolled-sideways-on-a-small-phone.md`.

## How it was picked

I built the site (main at 7d9ff8be2) and screenshotted the hub, wall-framing-takeoff, /research/,
/stories/, /writing/ and a post at 390 and 1280. None had a visible defect. The hub's count-up
tiles read 640/641 at 300 ms. That is the animation, already noted in `cta-row-phone`, and the
HTML says 1,080. I took item 3 of `polish-2026-11-19-cta-row-phone.md` (hero button rows under
other class names) and wrote a Playwright sweep over all 1,414 built venture pages at 390, 360 and
320. A row counts as a button row when it has 2+ children that are all buttons or links with
padding and a background or border, and it sits in the top 1,600 px, outside site chrome, forms,
tables and nav. The sweep also recorded each page's `scrollWidth`. Runtime 4 min with 8 tabs.

## What the sweep found

1. **21 pages scrolled sideways at 320 px** (0 at 360 and 390). 19 used
   `repeat(auto-fit|auto-fill, minmax(Npx, 1fr))` with N from 260 to 300. Most measured exactly
   339 px. A 300 px track can't fit in a card inside 16 px gutters. This is a WCAG 1.4.10 (Reflow)
   failure, so I chose it over the button rows.
2. **~200 ragged button rows at 390** (196 pages). 180 are the check tools' bare `<p>` with
   "Check / Load worked example / Clear", where "Clear" wraps alone. The rest are 6 `div.row`,
   5 `div.actions`, and singles. **Not changed, by judgment:** the cta-row fix (flex-grow on phone)
   would make "Clear" a full-width button, the largest target on the screen, for the destructive
   action. A short trailing button is ordinary for a form action row. The raw rows are reproducible
   with the sweep below.

## What changed

- **Codemod, 62 grids in 56 files:** every `repeat(auto-fit|auto-fill, minmax(Npx` with N ≥ 260
  becomes `minmax(min(Npx, 100%)`. That covers 54 venture files, 4 grids in
  `research/marriage-divorce-evidence/app/style.css`, and `.cards` in `platform/devlog/render.mjs`.
  `min(N, 100%)` equals N whenever the box is at least N wide.
- **listen-and-learn-audio** (353 px): the story `<select>` sits in an inline-flex label, and a flex
  item's `min-width:auto` kept it at the longest title's width. Added `label{max-width:100%;flex-wrap:wrap} select{min-width:0}`.
- **Check:** `platform/pages/grid-min-reflow.test.mjs` (0.5 s, picked up by the
  `platform/pages/*.test.mjs` glob). It reads tracked html/css/mjs/js under ventures, research and
  platform, and fails on an auto-fit/auto-fill minimum ≥ 260 px that isn't wrapped in `min()`. The
  threshold comes from the data: no minimum under 260 overflowed in the sweep, and 759 files use
  200 to 259, so a lower bar would have meant a much larger diff for no measured gain.

## Measured (Chromium; before = full build of main, after = `--only` preview of the 44 touched tool pages)

| width | sideways before (of 44) | after | grid tracks identical before/after |
|---|---|---|---|
| 320 | 21 | 0 | — |
| 360 | 0 | 0 | — |
| 390 | 0 | 0 | — |
| 768 | 0 | 0 | 44 of 44 pages |
| 1280 | 0 | 0 | 44 of 44 pages |

Page heights differ by ±23 to 60 px at every width, including 1280 where the tracks are
identical. That comes from content the `--only` preview renders differently (related-tool lists),
not from this change. Screenshots at 320 px:
`img/polish-2026-11-19-reflow-320-fix-and-flip-deal-analyzer-{before,after}.jpg`.

Not fixed: **pairwise-ranking** at 321 px. A label in `main` overhangs by 1 px (main
scrollWidth 305, clientWidth 288, card right edge 304).

## Still weakest, and what I would do next

1. **Register a 320 px sideways-scroll browser check.** The sweep is ~40 lines (`scrollWidth >
   innerWidth` over every `dist/<slug>/`) and takes ~80 s per width. `fold-check.mjs` is the
   pattern. It would catch causes the static test can't see (fixed-width tables outside
   `.pf-table-scroll`, long selects, inline SVG with a width).
2. **pairwise-ranking's 1 px.** Find the label (probably a fixed-width input plus text) and let it
   wrap.
3. **Form action rows (180 check tools).** If they're worth touching, the gentler option is
   `justify-content:flex-start` with Check and Load-example sharing line 1 at equal width and
   Clear left as is. Look at a screenshot before deciding. The data says it's a wrap, not a break.
4. Carried over: `cta-row-phone` items 1 and 2 (one flagship hero order; the "Save bids" row),
   `pinned-row-names` item 2 (`/engineering/` tables), and registering the pending browser checks
   (control plane).

## Reproduce

The sweep, measure and screenshot scripts were throwaway (in the session). The sweep's rule is
under "How it was picked". `--only` preview:
`node platform/pages/build.mjs --only=<44 slugs> --out=DIR` (25 s).
