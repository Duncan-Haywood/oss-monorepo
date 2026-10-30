# Shed designer, round 3, lane 1: design-search engine

2026-10-30. Session: https://claude.ai/code/session_01XpHqycUEdN5jpaaDa8esGA

## What landed

- **PR #11554: `designsearch.mjs`, first version.** A multi-objective search over whole designs under a footprint limit (default 100 sq ft), a peak limit (13 ft) and a wall-height range (78" to 98").
  - **Sizes:** every whole-foot size from 80% of the limit up to it, with the ridge running either way. `halfFeet: true` adds the 6" steps.
  - **Layouts:** five door-and-window layouts. Under a ridge beam, a gable opening moves aside for the post, so a 38-1/2" door then needs a gable wall of 8 ft 6 in.
  - **Structure:** ridge board or ridge beam, pitch, overhang, wall height, stud and rafter spacing, and rafter size.
  - **Rejected designs:** any structural or connection check that fails, or a member over `maxUtilisation`. Also any warning that means the design is not buildable as drawn, or panel siding on studs wider apart than its rating.
- **PR #11569: more choices.**
  - **Doors** (`DOORS`): site-built, a 32" prehung door, or 48" doubles.
  - **Windows** (`WINDOWS`): three sliders, each with its head in line with the door head.
  - **Siding:** six kinds. **Roofing:** shingles or metal.
  - **Foundation and floor:** these come from lane 7's `LEVER_KNOBS`, and `design.locked` is honoured.
  - **Default budget:** now 2,000 designs.
- **This PR: a better search order.** Phase 2 now expands one design at a time: the best unexpanded front design on each objective in turn. It also moves a design to another layout or another size. On the default design and prices, 44 of the 67 designs on the old 2,000-design front are dominated by the new front, and only 8 of the new front's 56 by the old. The cheapest passing shed it finds went from $2,435.09 to $2,255.78 with the same 2,000 designs.

## The API (stable, fields only added)

`searchDesigns(opts)` / `searchSteps(opts)` (a generator yielding `{ evaluated, budget, feasible, rejected }`) return `{ front, all, evaluated, rejected, constraints, objectives }`.

- **`opts`:** `base`, `prices`, `constraints` (see `DEFAULT_CONSTRAINTS`), `objectives` (keys of `OBJECTIVES`: cost, storage, looks, floor, shelf), `fixed` (design keys, or `door` / `window` / `wall`), `budget`, `sizes`, `layouts` and `knobs` (overrides).
- **Each scored design:** `design`, `label`, `cost`, `storage` (`storageOf`), `looks` (`looksOf`, with terms), `feasible`, `why`, `worst`, `peak`, `wallHeight`, `footprintSqFt`, `layout`, `size` and `knobs`.
- **`picks(front)`:** the cheapest, most storage, best looks and balanced designs, for a gallery to lead with.

## Findings

- **Ridge board:** every design on every front used a ridge board. The beam never pays on these three objectives.
- **Turning the ridge:** an 8x12 with its ridge along the 8 ft side and the door in a 12 ft gable is $101.57 cheaper than the usual orientation. It has 42 cu ft more room under the roof, and its peak is 12" higher.
- **Matching the house:** fiber cement lap siding (the owners' HardieBoard match) costs $350 more than T1-11 on one 8x12. With the siding and shingles fixed, the cheapest shed found was $2,677.02 (a 4,000-design run, before this PR's search order).
- **Prehung doors:** none ever made a front.

## Open, and the next step

- **Lane 2 (gallery)** should consume `searchSteps` in a Web Worker or in chunks: 2,000 designs take about 15 s in Node.
- **Lane 3 (structures):** no new structures had landed by the end of this run. When one adds a design key (a truss, a different roof form), add its values to `KNOBS` in `designsearch.mjs`. If a design key is invalid together with another one, reject the combination in `evaluateDesign` by its warning.
- **Board and batten:** it prices primed finger-joint 1x8s at $89.18 per box of three ($2,229.50 on an 8x12). That is an interior trim board, so a person should check the product and the line.
- **The $2,000 budget:** this target is still not met with lap siding and shingles fixed. The cheapest fixed-siding design is about $2,677, so the next savings have to come from cost lines outside the structure: siding, sheathing and the door.
- **Looks** is a heuristic, and it is documented term by term in `looksOf`. Its weights are a judgement call, and a gallery should show the terms, not just the score.

## Addendum: tightening, after r3b lane 5's audit (2026-10-30)

The parent relayed lane 5's findings (`docs/reports/shed-designer-round3b-lane5.md`, `paretoaudit.mjs`).

- **One storage definition.** `storage.mjs` now holds it, and `designsearch.mjs` and `designfacts.mjs` both use it.
  - The box is the inside floor times the height to the top of the plates. The roof triangle spans the inside width. Shelf wall takes off each opening's rough width.
  - The default 8x12 is 662.7 cu ft in both modules. Before, the panel said 666.8 and the search said 641.5.
  - `paretoaudit.mjs` keeps its own definition on purpose: it is an independent check.
- **8" overhang and 88" walls** are now search values.
- **Polish phase.** It uses 35% of the budget. Each front design, cheapest first, takes any one change that beats it outright, trying lighter framing, the overhangs and the wall heights first.
  - At 800 designs, 4 of 42 front designs still have a cheaper twin one change away (median 0.03%). Before, it was 26 of 26 (median 1.45%).
  - At 2,000 designs, it is 0 of 64.
  - A new test pins at most 15% beaten at 800 designs on two sizes.
- **Still open:** the gallery's picks should be added to `under100` in `paretoaudit.test.mjs` once a search supplies them (lane 5's point 3).
