# shed-designer: gambrel solveFrame prefix sums (2026-11-05, perf)

**Reading.** Per-file `node --test` timing of ventures/shed-designer (4-core sandbox): paretoaudit,
gallery, fuzz and designsearch each exceeded 60 s; shed-designer is the longest suite
(`ci-perf-2026-11-04-venture-suites-longest-first.md`). In `paretoaudit.test.mjs` one test,
"design search: no front design is beaten by one cost-only change", took 67.5 s.

**Profile.** `node --cpu-prof` of its `searchDesigns` call (62.7 s): 27.1 s self time in the
`at` closure of `solveFrame` (gambrel.mjs), 10 s GC, 5.3 s + 2.7 s in `integrity.mjs` bbox.
`at` ran ~240 times per truss and each call filtered all 240 slice loads and reduced them twice.

**Change.** Sort the loads by plan position once per side, keep running sums of force and
force x position, binary-search per section. Output differs only at floating-point rounding:
max relative difference 3.4e-11 over 18 widths/tie-depths/load shapes against the old function.

**Verification.** `searchDesigns` call 62.7 s -> 26.6 s (same 23-design front).
`node --test gambrel checks connections` 50 pass; `paretoaudit designsearch gallery fuzz`
65 pass, 0 fail, 87 s total wall (each of those files alone exceeded 60 s before).

**Not changed, ranked.** 1. GC (10 s) from per-call object/array allocation in the search.
2. `integrity.mjs` bbox (8 s) called per evaluated design. 3. `finishing`, `crossfeature`,
`utilisation` tests at 25-29 s each. 4. Browser tests (7-14 s each) in `*.browser.test.mjs`.
