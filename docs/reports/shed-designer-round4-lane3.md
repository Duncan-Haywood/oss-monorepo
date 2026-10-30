# Shed designer, round 4, lane 3: search, budget and gallery (2026-10-30)

The brief came from the "Open" and "Next step" sections of the round 3 lane 1, 2, 3, 6 and 8 reports, the round 3b lane 5 report and the round 2 lane 2 report. Below is what landed against each item, and what is still open.

## Landed

| PR | What |
|---|---|
| #11853 | **Gallery picks audited.** Every gallery card is in `paretoaudit.test.mjs`'s `under100`, held to the gallery's 90% limit and its own size. The barn card was $236 dear (2x6 joists where 2x4s pass). `polishCard` now takes cost-only framing and subfloor changes before a card is shown, and 7 of 11 cards got cheaper. `make-renders.mjs --only=<prefix>` redraws just one set of pictures. **Gallery freshness:** the deploy workflow runs `make-gallery.mjs` before the build, so each deploy's cards are searched with its prices (see #11915 for why it is not a build generator). `GENERATED_PAGES` accepts a list per venture. |
| #11858 | **Visitor prices.** `buildShed(design, prices?)`: the automatic overhang weighs each eave at the page's prices. Every caller that has prices passes them. The build cache keys on prices only for auto-overhang designs. |
| #11868 | **Gallery presentation.** Each card shows its looks score with the two terms it loses most on, and its materials cost against the open design. The detail lists every looks term with its reason, the cost change by assembly and a bridge (`bridgeHtml`). It also fixes a 5 px sideways scroll at 1366 px from the siding colour swatch row. |
| #11869 | **Default design.** A first-time visitor opens on the gallery's balanced card, which passes every check with no "Check these" list. Before, they opened on the 8x12, which misses its own 8 ft height limit by 2 ft. A guard keeps the first design no dearer than the 8x12: the most room per dollar card, then the cheapest card, stand in. The editing browser tests start from the 8x12, saved in storage. |
| #11876 | **The $2,000 gap.** `budgetpath.mjs` puts a budget box beside "Find a cheaper build". It shows the running total after each step and opt-in savings that give something up (no gable vents, no spare boards). It also shows the largest size of the same design that fits. |
| #11879 | **Margin report moves.** `marginMoves` turns oversized members into cheaper-build moves, which adds the ridge beam's depth. The Structure tab's margin table gains a Saves column. Gallery pictures redrawn (stale on `main`). |
| #11915 | **Fix for `main`.** `make-gallery.mjs` left `GENERATED_PAGES`. It rewrote the committed `gallery-data.mjs` while parallel test files built the site, so `build.test.mjs`'s "identical build, identical cache name" went red. A generator must now write only gitignored files. |
| #11897 | **Attic storage** is a search knob on truss gables. The gallery searches and ranks on usable storage (lane 2's `usableCuFt`): no card wins on space over bare rafter ties, and 8 of 11 cards became lean-tos. The barn card has no loft: no lofted barn the search tried beat it on usable storage per dollar. The gallery wording "before it in the strip", not "above", was asked for by lane 7. This report is in the same PR. |

`LEVER_KNOBS` (24" joists, piers, gravel options) were already wired into `designsearch.mjs` when this lane started.

## Addendum: saltboxes in the gallery (after lane 2's #11920)

The gallery's searches now include the saltbox. About 100 saltboxes pass in each search, but none reaches the Pareto front on cost, usable storage and looks. A saltbox's roof is tied, so its roof space counts nothing until it is decked, and the lean-tos beat it on room per dollar. Its best looks score (100) ties the looks card, which takes the cheaper design. No card changed style. Lane 2's clerestory layout was already among the gallery's layouts.

## Findings worth knowing

- **$2,000 does not buy a lap-and-shingle shed of useful size** at today's prices.
  - The cheapest lap-sided 7x12 is $2,878. The cheaper build's steps bring it to $2,731, and the opt-in savings to $2,647.
  - It fits $2,000 only at 6x7 ($1,976).
  - A lap-fixed search down to 48 sq ft agrees: a 6x6 lean-to is $1,925 and an 8x8 is $2,473.
  - About $860 of the 7x12 is wall finish: planks, OSB, wrap and paint.
- **Counting only space you can load moves the gallery to lean-tos.** A ridge-board gable's undecked roof triangle was most of its storage edge.

## Open, and the next step

1. **Decking a ridge-board gable's ties.** Ties as a storage floor (2x6 at 16", say) would give gables usable roof space. It needs a structural check of ties as floor joists under a light storage load, with a cited live load (lane 1). Then add a knob beside `atticStorage`.
2. **Lap siding straight on studs.** This would save the $140 of OSB on the lap 7x12. It needs a bracing method (let-in or metal T-bracing, IRC R602.10.4) and its price from a dated listing.
3. **Gallery variety.** With honest storage, lean-tos win most cards. If gables should be shown, give them their own search as the barn has. Don't loosen the storage rule.
4. **The first design** is now the most-room-per-dollar card whenever the balanced card costs more than the 8x12. Check the first view after the gallery changes.
5. **Pictures go stale when other lanes change geometry.** `picker.browser`'s "drawn picture" test fails until someone runs `make-renders.mjs --only=gallery-`. The Pages build redraws the pictures for the deploy, but the committed copy needs a redraw in the PR that changes geometry.

## Verification

- After merging `main`, each PR passed the venture's full `node --test *.test.mjs`: #11853 401/0, #11858 391/0, #11879 465/0. The others' counts are in their PR comments.
- `typecheck.mjs shed-designer` reported 0 diagnostics on each.
- `run_workflow_locally.py portfolio-validate.yml` passed 106/106 steps.
- Every UI change was screenshotted at 1366 or 1280 px and at 390 px.
- **Mistake:** I merged #11853 and #11858 believing no check runs had registered, because the MCP `get_check_runs` call returned none. In fact CI had run, and it was red on their early heads. After that, I read the job logs before every merge.
