# Shed Designer round 2, lane 2: numbers that drift

Session: https://claude.ai/code/session_01XpHqybgbjtZBC1yuM1sWw3 (2026-10-30). Brief: stop stated numbers drifting from the model ("software for the routine"), then the round-1 pricing open items. Mid-run, the parent session relayed the owner's store feedback (drop Menards; Lowe's looked cheaper only because its data was missing), which became the top item.

## What landed

| PR | What | Evidence |
|---|---|---|
| #11524 | The per-size lumber pages are no longer committed. `platform/pages/generated-pages.mjs` (`GENERATED_PAGES`) runs `make-size-pages.mjs` before the site build, the front-door mirror and the `pages.yml` mirror read `ventures/`. The pages are gitignored. | Perturbing lumber prices by up to 5% changed the board count on 188 of 240 size-page builds (pieces: 0), so "print only stable figures" would have left only piece counts. A full site build with the pages deleted from disk passed `check.mjs` (5,575 pages, no dead links). It needed two follow-ups, below. |
| #11641 | Follow-up to #11524: `pages.yml` gained a `setup-node` step for the generator, plus the runner-switch fixes `main` needed. | Local `pages.yml` mirror build and gitops suite passed. |
| #11654 | Follow-up to #11524: `renders.test.mjs` reads the size pages from `generate()` instead of disk, so it no longer fails on a clean checkout. | Shed suite passed on a checkout with no generated pages. |
| #11571 | Closed as superseded. Its four `main` fixes (stale front-door pages, `.webp` renders in the mirror, money formatters, runner switch) landed through a9ba244b, #11640, #11650 and #11641. | `supersede_check.py` before closing. |
| #11528 | `marketing.test.mjs` recomputes every number in the README's worked example and seven more on `shed-plans-with-cut-list.html`. | Its first run found three stale README claims. Every later merge of `main` in this run moved a figure, and the test named each one. |
| #11547 | Home Depot and Lowe's only. Stores are compared like for like, each store's coverage and missing lines are shown, and copies over a year old are counted. Also 7 Lowe's lines and Home Depot's Z-flashing were sourced. | Default 8x12: Lowe's 36 to 43 of 49 lines, Home Depot 48 to 49. Like for like on 43 lines: HD $2,628.69 vs Lowe's $2,497.16. The old summary claimed Lowe's was cheaper by $145. |
| #11590 | Closed unmerged: the spares rule (cheapest length holding the longest piece). Measured on current `main` (12 ft haul limit) it made things worse: spares over 26 designs went from $2,179.81 to $2,399.17, and spare-length changes under 5% price noise from 24 to 78 of 260 runs. | Before the haul limit it traded money for stability (18 designs: spares $1,620.43 to $1,816.50, changes 65 to 39 of 180). On current `main` it costs more and is less stable, so it was dropped. |
| #11595 | Auto overhang: the longest from 6" to 18" whose whole order is within `overhangBudget` (default $25) of the cheapest. The design note says what it chose, what that added and what the next inch would add. | Default: the old rule picked 9", which bought a fifth shingle bundle; the new rule picks 8" at no added cost, and says 9" would add $40.47. $50 gives 10" (+$43.82), $70 gives 12" (+$64.50). |
| #11620 | Fastener and hardware audit (asked for by the parent). Siding nails are bought as the cheapest mix of 1 lb and 5 lb boxes; there is a new connectors-to-birdsmouth swap. 16d count (840) and boxes audited and unchanged. | Default: five 1 lb boxes ($27.85) became one 5 lb box ($18.87): -$8.98 on seven of nine presets, -$3.41 on the 8x8 lean, -$14.55 on the 10x10 barn. The birdsmouth swap saves $121.81 on the default, and every check passes. |

## Merging generated pages (replaces the round-1 guidance)

There is nothing to regenerate. If a branch still has `how-much-lumber-*.html` or `shed-lumber-list-by-size.html` from before #11524, take `main`'s deletion (`git rm --cached` the conflicted files). The README and marketing-page numbers are not generated, but tests pin them. When `marketing.test.mjs` fails after a model change, it names the figure; update the text to what the tool now says.

## Open

- **Gable vents are the largest hardware line** ($91.92 for four on the default). The cheaper Lowe's plastic vent rests only on copies up to 1,790 days old; a browser check would settle it.
- **Prices for a person to check in a browser:** `docs/reports/shed-designer-price-gaps-2026-10-30.md`. That's 6 Lowe's lines with no price and 5 weak leads. The biggest Lowe's advantages (a plastic gable vent from copies up to 1,790 days old; underlayment priced from a reviews page) should be refreshed first.
- **The front-door mirror packs ventures under a byte ceiling at 100% of one shard.** Removing 13 files changed which ventures fit and produced dead links. #11524 sidesteps this by generating the pages first, but any venture that shrinks or grows can trip it. Worth a platform look.
- **The auto overhang uses the starting prices, not the visitor's.** `buildShed` has no access to typed prices. Passing them through would make the choice follow the visitor's store.
- **Other ventures with committed generator output** (for example `einvoice-preflight/build-*.mjs` and `open-house-plans/build-catalogue.mjs`) could join `GENERATED_PAGES` if they drift the same way.

## What the next run should do

1. Work through the price-gap list with a browser and a store selected. Record the store, the date and the item number.
2. Pass visitor prices into the auto overhang (and the auto pitch, if it ever prices).
3. Check whether the front-door mirror's packing can be made stable when a venture's file count changes.

## Verification

CI runners were starved for most of the run, so #11524, #11528, #11547, #11641 and #11654 were merged on local verification (the shed suite, `marketing.test.mjs`, the gitops suite and the site build as each change reached them), with the output posted on each PR and summarised in the run record's `notes`. #11595 and #11620 the same: the full `node --test *.test.mjs` shed suite on each branch after merging `main`.
