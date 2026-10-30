# Shed designer round 3b, lane 5: are the defaults optimal, and are they a good deal?

Session: https://claude.ai/code/session_01XpHqydkF4sUA1mkqDAyNmJ, 2026-10-30.

## What landed

| PR | What |
|---|---|
| #11566 | **`paretoaudit.mjs`**, an independent check of the starting designs. It shares only the model, the estimate and the checks with the design search. It brute-forces about 3,500 designs per preset under 100 sq ft (footprint, walls, pitch, spacings, 2x4 or 2x6 rafters and joists, foundation) and adds random restarts with local search on a finer grid. Each preset is compared only with designs that look like it: same siding, roof covering and roof type, pitch within one step, walls and eaves no lower, every check passing with no warning. |
| #11566 | Every preset was within 2.5% of the cheapest look-alike holding as much: 8x12 2.4%, 8x12 classic 0.5%, 8x10 0.3%, 8x8 1.0%. Almost all of each gap comes from 2x4 floor joists. |
| #11566 | The **8x8 garden-shed preset** warned of a birdsmouth deeper than a third of its 2x6 rafter at 8/12. It is now 6/12: $144 cheaper, 2% less storage. |
| #11566 | `paretoaudit.test.mjs` fails if any preset is more than 3% off its best one-step neighbour (about 1 s). `AUDIT_FULL=1` runs the full brute force (about 2 min). |
| #11566 | **`value.mjs`**: 17 Home Depot and Lowe's wood shed listings at or under 100 sq ft (13 kits, 4 installed). Each has its URL and model number. Every price is a search-result copy seen 2026-10-30, because both stores return 403 to automated reads. Nothing is estimated, and quote-only listings are left out. The summary panel shows sq ft and cu ft per $1,000 and the three nearest kits, with each DIY kit's figure recomputed with the design's own roofing and paint added. Post: `docs/posts/2026-10-30-is-a-designed-shed-a-better-deal-than-a-kit.md`. |
| #11605 | **Design search audit.** On #11569's search, all 67 of 67 front designs (default budget) were beaten by one change the search offered, mostly joists at 24" (median 1.7%). I prototyped a polish phase, which cut that to 1 of 51. Lane 1's new search order (#11573) landed meanwhile and does better: 5 of 45 beaten, cheapest design $2,268 against the polish's $2,414. The polish on top of #11573 was worse, so it was dropped. The test pins the result: it fails on #11569 and passes on `main`. Post: `docs/posts/2026-10-30-auditing-the-shed-design-search.md`. |
| this PR | **The kit benchmark on the picker's detail panel** (`kitLineHtml` in `value.mjs`). It gives this design's floor and floor × wall height per $100, measured outside like the kits, beside the three nearest kits. Each DIY kit's figure is also shown with the design's roofing and paint added. A kit whose listing does not say whether it has a floor says "floor not stated". |

## Findings worth knowing

- **Value against store kits.**
  - On floor area per dollar, the default 8x12 ($3,026 in materials) is about even with a DIY kit once the kit's missing roofing and paint are added: 31.7 against 31 to 36 sq ft per $1,000.
  - On floor × wall height it wins by 4% to 17%, because its walls are about a foot taller (7'2" against 6'0" to 6'4").
  - Installed sheds cost 10% to 55% more per sq ft.
  - Nothing reaches $2,000 with a roof on it.
- **Kits use 2x4 floor joists.** Little Cottage, for one, uses PT 2x4 at 16" on centre, which is the same right-sizing the audit points to.

## Open, and the next step

1. **The search at small budgets.** At 800 designs, all 25 front designs on `main`'s search are beaten by one cost-only change (median 1.9%). Nothing on the page runs it at that size yet. When the gallery or picker calls `searchDesigns` in the browser, use the full budget, or polish the shown picks one knob at a time.
2. **Values the search does not offer:** an 8" overhang (it has 6", 9" and 12"), and 88" walls (+9 cu ft at no extra cost on the 8x10 and 8x11). This is for r3 lane 1.
3. **Audit the gallery's picks.** The picker still shows `PRESETS`, and it says it will until "a search supplies optimised ones". When it does, add those designs to `under100` in `paretoaudit.test.mjs` so the 3% guard covers them.
4. **Two storage definitions disagree.**
   - `designfacts.mjs` takes volume from the outside width and the wall height including the plates, so it reads higher.
   - `designsearch.mjs` and `paretoaudit.mjs` use inside dimensions and the clear height under the plates (the audit counts the roof triangle at half).

   One shared `storageOf` would stop the detail panel and the search quoting different cubic feet for the same shed.
5. **Kit prices go stale.** The rows are search-result copies, some of them old. A person should open the 17 links and update `KITS` in `value.mjs`; `value.test.mjs` checks the shape, not the numbers.

## Verification

- The venture's `node --test *.test.mjs` on each PR after merging `main`: 248, 315 and (this PR) the count in its body, with no failures. The skips are axe (axe-core is not installed here) and the opt-in full audit.
- `AUDIT_FULL=1` brute force: passes, with gaps of 0.3% to 2.4%.
- For #11566, `ink.mjs --strict`, `siblings.mjs --check` and `webcheck/check_pages.mjs` were clean.
- Each UI change was screenshotted at 1280 px and 390 px, with no console errors and no horizontal scroll.
- CI runners were starved tonight, so local checks stood in, as `CLAUDE.md` allows.
- There is no `typecheck.mjs` in `platform/ci`.
