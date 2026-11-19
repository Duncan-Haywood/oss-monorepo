---
kind: polish
topics: [design, depth]
date: 2026-11-19
---
# Polish: flagship call-to-action pairs fill the line on a phone

Date: 2026-11-19. Track: polish/0. PR #17753. No polish PR was open at the start. The draft was
opened before the preview build to claim the item.

## How it was picked

I built the site and screenshotted, at 390×844, the hub, the five flagships in
`portfolio/flagships.yaml`, the research index, Stories, the Blog index and a post. The hub,
research, Stories and Blog pages had no visible defect. (The hub's stat tiles count up on load. A
screenshot taken at 400 ms shows 726 research projects next to "1,080" in the search label. That is
the animation, not a wrong count: the HTML says 1,080.)

The flagships disagreed with each other. On ai-bookkeeper and sales-agent, the hero's two buttons
("Import a bank file" / "Try the example") sat side by side. On wall-framing-takeoff,
changepoint-detector and einvoice-preflight they wrapped. The second button dropped under the
first at its own width, which left a ragged stack that a visitor sees on the first screen.

## Cause

Ten venture pages have `<p class="cta-row">` with `a.cta` buttons. Eight of them copy the same
`.cta-row{display:flex;flex-wrap:wrap;gap:10px}` with buttons at their natural width. Two
(ids-model-check, xer-schedule-check) use inline-block buttons with a right margin. None had a phone
rule.

## Fix

Each of the ten pages gets one `<style>/* cta-row-phone */` block before `</head>`:

```css
@media (max-width: 560px) {
  .cta-row { display: flex; flex-wrap: wrap; gap: 10px; }
  .cta-row > a.cta { flex: 1 1 auto; text-align: center; margin: 0; }
}
```

A pair that fits shares the line. A pair that wraps becomes two full-width buttons. Each page keeps
its own colours. Desktop is unchanged: wall-framing-takeoff's buttons at 1280 measure 147/213 px
before and after.

The same pass found that open-tennis-robots scrolled sideways at 320 px (scrollWidth 339). Its
`.two` grid used `minmax(300px, 1fr)`, which is wider than the card. It now uses
`minmax(min(300px, 100%), 1fr)`, and scrollWidth is 320. The court SVG is 242 px wide at 320.

## Measured

Playwright, `.cta-row` per page. A row counts as "ragged" when it wraps and a button that is alone on
its line stops short of the row's right edge. Before is the full build of main. After is a
`--only` preview of the ten pages.

| width | ragged before | ragged after | sideways scroll before → after |
|---|---|---|---|
| 390 | 5 of 10 | 0 | none |
| 360 | 9 of 10 | 0 | none |
| 320 | 10 of 10 | 0 | open-tennis-robots 339 → 320 |

The raw before and after rows are in the PR's session. Screenshots:
`img/polish-cta-row-{before,after}-wall-framing-takeoff-390.png` and
`img/polish-cta-row-{before,after}-ai-bookkeeper-360.png`.

## The check

`platform/pages/cta-row-phone.test.mjs` is static and takes about 0.5 s. Any `ventures/` or
`research/` HTML page with `class="cta-row"` must have a `@media (max-width…)` rule whose selector
is `.cta-row … .cta` with `flex: 1…` or `flex-grow: 1`. An unconditional grow does not count,
because it would stretch the pair across a desktop page. On main the test lists all ten pages. With
this PR it passes.

## Still weakest, and what I would do next

1. **The flagship heroes are still five different designs.** ai-bookkeeper and sales-agent have an
   eyebrow line and a headline. wall-framing-takeoff and changepoint-detector put the CTAs above the
   lede. einvoice-preflight has an audience eyebrow. One shared hero partial, or at least one
   agreed order (eyebrow, headline, one-line lede, CTAs, then detail), would make them read as one
   site.
2. **wall-framing-takeoff's "Save bids, mark them won or lost." row** sits alone above the first
   card on a phone, with two grey buttons that look disabled. It belongs inside the card or after the
   result.
3. **Other venture pages hand-roll the same hero buttons under other class names** (`.actions`,
   `.hero-cta`, `.btn-row`). A sweep with the measuring script (wrap and right-edge test) across all
   ventures would find the rest. The check only knows `cta-row`.
4. Carried over: the items in `polish-2026-11-18-fold-check.md` (360×780 audience pages, registering
   the browser checks) and `polish-2026-11-18-research-programme-pages.md` (the open fold label).
