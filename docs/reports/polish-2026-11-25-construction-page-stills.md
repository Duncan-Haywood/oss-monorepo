---
kind: polish
topics: [design, conversion]
date: 2026-11-25
---
# Polish 2026-11-25: real tool stills on the construction front door

## What I picked and why

Routed to polish (draw). Security queue empty, ideas inbox empty. The
meta/og-description items in the last notes are done for every bet product
(baseline counts 0 for pay-app-guides, lien-waiver-checker, einvoice-preflight,
wall-framing-takeoff), so I screenshotted bet #1's front door,
`industries/construction/`, at 390 and 1280 px. It is well structured but
all text: 13,373 px tall on a phone with no image anywhere, while the
prompt's bar is "real screenshots and worked examples rather than filler".
The showcase (`platform/pages/showcase/`) had stills of 12 tools, none of them
a pay-app tool.

## What changed

- `showcase/capture.mjs`: new SHOTS entry `pay-application-generator`
  (clicks `#load-ok`, `#calc`; focus "Current payment due"; hero crop from
  `#due`). Captured with `--stills-only --only=pay-application-generator`
  against a local build; manifest gained one entry (others kept as they were).
  Three files, 23 KB / 39 KB / 54 KB.
- `industry-construction.mjs`: `renderConstructionPage({ shots })`. The first
  pay-apps free tool with a still leads the page as a figure under the
  early-access button (eager, `decoding=async`); every other product card
  shows the still of its first free tool that has one (lazy). Uses the hero
  crop (600 × 375 plus the 1200 twin in `srcset`, `sizes` per slot) because
  the full 960 × 600 still made the G702 lines about 4 px tall on a phone.
  Alt text names the tool and says the example is loaded; a still whose tool
  is not published drops out (`liveSlugs`), like the links.
- `build.mjs`: passes `showcase.shots` (already filtered to published tools).
- Test in `industry-construction.test.mjs` (position above the problems, crop
  + srcset, no repeat in its card, lazy card still, unpublished drops,
  no stills no figure).

## Measured

| | before | after |
|---|---|---|
| Images on the page | 0 | 2 (lead + residential takeoff card) |
| Phone height (390 px) | 13,373 px | 13,987 px |
| Desktop height (1280 px) | 8,096 px | 8,783 px |
| Sideways scroll at 390 | none | none (scrollWidth 390) |
| Rendered lead still at 390 | n/a | 360 px wide, 600w file at 1x |

`check.mjs`: publishable, no dead links. `node --test 'platform/pages/*.test.mjs'`: see PR.
No traffic or conversion claim: usage on this page is unmeasured.

## Still weakest, next

1. **Other industry pages are text-only too.** `industries/eu-e-invoicing/`
   (bet #3) and `industries/manufacturing/` (bet #2) could take the same
   figure. einvoice-preflight has `#sample` + `#check` buttons for a capture;
   machine-shop-guides needs a look for a worked example worth showing.
   A shared helper (this page's `figure`) would serve all of them.
2. The hero crop of the generator starts at the big "$84,870.00"; the
   left 20 px are the beige page margin. A `hero: '#report'` crop with a
   heading might read better; try it next to the current one.
3. Carried: og:title on einvoice country guides; mid-title ellipses in
   `writing/` and `research/`; 28 px band buttons on phones; the
   calculator's "REMOV" header.
