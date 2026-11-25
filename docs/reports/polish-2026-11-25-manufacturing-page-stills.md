---
kind: polish
topics: [design, money]
date: 2026-11-25
---
# Polish 2026-11-25: real tool stills on the manufacturing front door

## What I picked and why

Routed to polish (draw). Security queue empty, ideas inbox empty. Took item 1
of "Still weakest" in `polish-2026-11-25-construction-page-stills.md`: the
other industry pages are text-only. Picked `industries/manufacturing/`, the
front door to bet #2 (Job Shop Quote) and bet #4 (CMMC), which had no image
anywhere: 4,585 px of text on a phone.

## What changed

- `showcase/capture.mjs`: two SHOTS entries.
  `cnc-machining-quote-calculator` (click `#example`, focus "This job", hero
  `#results .headline`) and `dxf-nesting` (click `#load-example` then `#nest`,
  focus "3. Nested sheets", hero `#sheets`). Captured with
  `--stills-only --only=...` against `ventures/` served directly
  (`python3 -m http.server` in `ventures/`, run with `run_in_background`; no
  full site build needed, since stills scroll to the tool's result and never
  show the site chrome). Six files, 17 to 45 KB. Both also join the hub's
  showcase gallery (the hero picks a fixed list, so the hero is unchanged).
- `industry-manufacturing.mjs`: `renderManufacturingPage({ shots })`.
  `LEAD_STILL = 'dxf-nesting'` leads the page under the opening paragraph
  (eager, hero crop + 1200 w srcset); a product's `still` field puts a lazy
  still in its card (the quoting card shows the CNC quote calculator). Only
  tools the page lists and the build publishes; alt text names the tool and
  says the example is loaded; the caption says it is the free tool.
- `build.mjs`: passes `showcase.shots` to `buildManufacturingPage`.
- Tests (`industry-manufacturing.test.mjs`): lead above the problems, eager,
  srcset; card still lazy; unlisted and unpublished stills drop; no stills no
  figure; every still the page names exists in `showcase/manifest.json`.
- Post: extended `docs/posts/2026-11-24-one-page-for-machine-shops.md`
  (consolidated, no new post).

## Measured

| | before | after |
|---|---|---|
| Images on the page | 0 | 2 |
| Phone height (390 px) | 4,585 px | 5,181 px |
| Desktop height (1280 px) | 2,663 px | 3,611 px |
| Sideways scroll at 390 | none | none (scrollWidth 390) |
| Rendered lead still | n/a | 344 px at 390 (600w file), 722 px at 1280 (1200w file) |

Measured with the page rendered by `buildManufacturingPage` and opened from
`file://`, so without the site stylesheet; heights with the stylesheet will
differ a little. Screenshots: `img/polish-2026-11-25-manufacturing-before-390.webp`,
`img/polish-2026-11-25-manufacturing-after-390.webp`.
No traffic or conversion claim: usage on this page is unmeasured.

## Still weakest, next

1. **`industries/eu-e-invoicing/`** (bet #3) is still text-only.
   einvoice-preflight has `#sample` + `#check` buttons for a capture. The
   construction and manufacturing pages now each carry their own `figure`
   helper (same markup); a third copy is the time to move it into a shared
   module.
2. The DXF nesting hero crop is laid out at 720 px, so the sheet drawing sits
   inside the tool's card with grey margins; a `hero: '#sheets svg'` crop
   might fill the frame better. Try it beside the current one.
3. An SPRS score still for the CMMC card (`machine-shop-guides`) once its
   calculator has a worked-example button.
4. Carried: og:title on einvoice country guides; mid-title ellipses in
   `writing/` and `research/`; 28 px band buttons on phones.
