# Open House Plans: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an LLM agent that will design a house for
someone, or extend the generator. **Human version:**
[`../posts/2026-10-21-free-house-plans-from-a-sentence.md`](../posts/2026-10-21-free-house-plans-from-a-sentence.md).
**Code:** [`ventures/open-house-plans/`](../../ventures/open-house-plans/README.md).

## Answer

To design a house: write a JSON brief, call `design(brief)` (summary, under
60 KB), iterate with `variant`, then write files with
`node ventures/open-house-plans/cli.mjs design ... --out DIR --zip`. The
brief fields and the conversation loop are in
[`AGENTS.md`](../../ventures/open-house-plans/AGENTS.md). Output is CC0 and
not for construction; say both.

To extend it: the layout is a fixed grammar (garage | great room | wing or
suite, on a rectangle), searched exhaustively in two stages, so new house
types are new zone builders in `layout.mjs` plus parameters in `search.mjs`,
not new heuristics in the drawings. Everything downstream (walls, openings,
3D, IFC, takeoff, checks, cost) is derived from the rooms and their links.

## Evidence (verified 2026-10-21, reproducible)

From `ventures/open-house-plans/`:

- `node --test`: 33 tests, about 30 s. One test sweeps 150 programs (0 to 5
  beds, every bath count, 0 to 2-car garages, accessible or not) and requires
  every design to tile its footprint, keep openings inside walls without
  overlap, fit the kitchen, and pass every rule check.
- `structure.test.mjs` pins the JS member checks to research/house-spans and
  research/house-framing (Python) to 1e-9 on 294 cases;
  `python3 verify/structure_fixture.py` regenerates the fixture.
- `python3 verify/check_files.py <bundle>` (IfcOpenShell 0.9.0, ezdxf 1.4.5):
  on all twelve catalogue designs, 0 IFC schema errors, every solid built,
  0 DXF audit errors (`data/verify.txt`).
- `node verify/study.mjs` writes `data/study.txt` (style, size, layout and
  single-choice cost effects; the post quotes it), and
  `node verify/sensitivity.mjs` writes `data/sensitivity.txt`: the same
  findings under 500 seeded draws of the cost model's assumptions. All keep
  their sign; the porch's cost is the least certain ($10.5k to $28.2k).

## Gotchas

- **`call` merges `DEFAULTS` into `--input`.** `engine.mjs` therefore lets a
  `text` brief win over fields equal to their defaults; only fields that
  differ from the defaults override the text. Keep that if you touch
  `resolve()`.
- **Pages cannot serve `.ifc`, `.obj`, `.mtl`, `.dxf` or `.zip`**
  (`platform/pages/check.mjs` `SERVED_EXTENSIONS`, `build.mjs`
  `NON_WEB_EXTENSIONS`). The page builds every file in the browser and zips
  it; the committed catalogue keeps only README, design.json and two SVGs per
  design. Do not commit full bundles under the venture.
- **The catalogue is a test.** Any engine change that alters output makes
  `catalogue.test.mjs` fail until you run `node build-catalogue.mjs`.
- **The cost model sees geometry, not layout detail.** Within one program and
  area, layouts differ by under 2% in modelled $/sq ft; style and size move
  it 9% and about 25%. Do not present layout search as a cost optimiser.
- **Search space limits:** depth 20 to 36 ft, rows at most 16.5 ft deep, so
  wide programs make long houses; a lot narrower than about area/36 + garage
  width fails with an explanatory `error`.

## Limits

Single storey, rectangles, no stairs or basements; IRC checks paraphrased by
section, not compliance; trusses, bracing and foundations not designed; one
cost anchor with assumed driver splits; IFC not yet opened in a commercial
BIM tool.
