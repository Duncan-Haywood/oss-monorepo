# Polish, 2026-11-13: the last two pages over Google's CLS line

**Why.** Item 1 of "Still weakest" in `polish-2026-11-13-rows-reserve.md`: seven tools were skipped by
the rows reservation because "their shift comes from something else", led by
retainage-cashflow-calculator (0.201 at 1,280 px) and shed-designer (0.194; 0.088 at 390 px). They were
the only two built pages from that list over Google's 0.1 "good" line.

## Traced causes (buffered `layout-shift` observer, sources' node and rects)

- **retainage-cashflow-calculator.** `main` is a two-column grid. At first paint only the form and the
  "Payment milestones" section are visible, so milestones sit beside the form. The module then runs
  `calculate()` on load and unhides five result sections; milestones fall to the end of the grid, out of
  view. Source: `#milestoneSection 414 -> off-screen, 486 px tall`.
- **shed-designer.** The ready-design strip `<ul class="pick-list">` ships empty and `app.mjs` fills it at
  module top level (`mountPicker`). Filled it is 641 px tall at every width from 320 to 1,600 px (cards are
  fixed-width columns in a horizontal scroller), so `.bar-top` and `#workspace` drop by 641 px.

## What changed

Both pages get a `<!-- late-reveal:start -->` block before `</head>`, the same gating the rows reservation
uses (`pf-rows-ready` added on `DOMContentLoaded`, by which point module scripts have run; only under
`@media (scripting:enabled)`, so a no-JS visitor sees the page as before; if the module fails,
DOMContentLoaded still fires and the page shows as before):

- retainage: `html:not(.pf-rows-ready) main>section:not(:first-child){display:none}`. First paint is the
  form alone; the rest appears in one go. Content that appears is not a shift; content that moves is.
- shed-designer: `html:not(.pf-rows-ready) #starts .pick-list:empty{min-height:620px}`, 21 px under the
  641 measured, so other platforms' font metrics leave at most a small upward settle, never a gap.

Each venture's `page.test.mjs` pins its block. Retainage's "swallowed document" fixture now deletes the last
`</style>` (the block's), the same trap and fix as janitorial in the rows-reserve run.

## Numbers

Full local build of main served from `dist/`, pre-installed Chromium, third-party requests blocked,
viewport x 900, three loads per page, CLS read 500 ms after `load`. "After" is the same `dist/` with the
block spliced into the head exactly as it is in source. All three loads agreed to 3 decimals.

| page | 1,280 before | after | 390 before | after |
|---|---|---|---|---|
| retainage-cashflow-calculator | **0.201** | **0.000** | 0.000 | 0.000 |
| shed-designer | **0.194** | **0.002** | 0.088 | 0.005 |

Shed-designer's residual is `#gallery-count`'s text being rewritten (the count of designs), 37 px tall
either way. Tests: both ventures' full suites via `run_venture_tests.py` pass (shed-designer 170 s);
`node --test 'platform/pages/*.test.mjs'` (see the run record).

## Still weakest, and what I would do next

1. **The other skipped tools, measured on this build at 1,280 px:** delivery-app-margin-calculator 0.068
   (`tbody#rows` fills from JS and `#spread` / `#monthly` notes fill: 73 -> 196 px scroller, actions
   +88 px), hvac-load-calc 0.046 (`#sizingNote` 14 -> 135 px, tiles 78 -> 110 px), proposal-maker 0.033
   (0.053 at 390: a card shrinks 337 -> 220 px), str-host-payout-calculator 0.022 (table `th` wraps 34 ->
   49 px), portable-restroom-event-quote 0.002. All under 0.1; each is its own small fix, delivery-app
   first (render its rows' placeholder count in HTML, or `min-height` the scroller under the same gate).
2. **A generic late-reveal check.** Both fixes are hand-written. A `platform/pages/` sweep that loads every
   tool with a buffered observer and fails above 0.1 would keep this fixed; the scripts in the rows-reserve
   and this run are the starting point (one Chromium, six tabs, ~1,350 pages: too slow for every PR, fine
   for a nightly job if the owner wants one).
3. Carried over: result `dt` rows growing on attic-insulation; topic-page titles four lines on phones;
   `.pager` defined twice in the writing STYLE; the ticker's third line at 320 px.
