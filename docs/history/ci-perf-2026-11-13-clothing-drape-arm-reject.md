# CI perf, 2026-11-13: clothing-design-studio drape, a cheap "nowhere near an arm" test and the drape file split

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/workflows/` and wait for the owner, so this run took item 3 of "Not
changed" in `ci-perf-2026-11-13-open-house-plans-clean-fast-path.md`:
clothing-design-studio, which had had no perf pass.

## Reading

This 4-core container, node 22.23.4, nothing else running.

- Each test file alone (`for f in *.test.mjs; time node --test $f`):
  **`drape.test.mjs` 29.8 s**, then `nest` 3.4 s, `pattern` 2.6 s,
  `marker` 2.5 s, everything else under 1 s. One file was the suite's tail.
- Inside it, the sleeves test 14.9 s, the lowerArms test 6.7 s, the
  regular/slim tee 3.5 s, the drawing test 2.9 s; the closed-form solver tests
  under 0.6 s each.
- `node --cpu-prof` on one `drapeGarment(me, { garment: "tee", size: "M" })`
  (5.17 s), self time summed per function: **`armContact` 2.89 s**,
  `simulate` 1.33 s, `pushOut` 0.34 s, GC 0.33 s.

`simulate` calls `pushOutArm` for every free vertex on every substep, and it
called `armContact`, which runs `Math.hypot` against all 8 capsules (2 arms x 4)
and allocates a fresh result object each time a capsule beats the last. Almost
every torso vertex is nowhere near an arm, and `pushOutArm` then returns 0.

## Change

1. **`armsClear` (`drape.mjs`)**: before `armContact`, `pushOutArm` checks each
   capsule with the same projection and clamp, but compares the squared
   distance to the axis with `(r + thick + 1e-9)^2`: no `hypot`, no object. If
   every capsule passes, the original would have found `dist >= thick` and
   returned 0 without touching anything, so it returns 0. Any doubt (inside
   the margin, or a NaN coordinate, which fails `>=`) falls through to
   `armContact` unchanged. The 1e-9 m margin is many orders above the rounding
   gap between `sqrt` of a sum of squares and `hypot` at metre scale.
2. **`armContact`** keeps the winning capsule's numbers in scalars and builds
   the result object once at the end. Same arithmetic, same comparisons, same
   object returned.
3. **`drape.test.mjs` split**: the sleeves test moved unchanged to
   `drape-sleeves.test.mjs` and the lowerArms test to
   `drape-lower-arms.test.mjs`, so `node --test` (3 files at a time here) runs
   them alongside the rest. 12 tests before, 10 + 1 + 1 after. The README's
   pointer to the sleeves checks names the new file.

## Verification

- **Byte-identical drapes.** Nine `drapeGarment` calls (every one the tests
  make, plus an XL slim with a 36 cm upper arm and an XS small body with arms
  lowered), each result `JSON.stringify`d with typed arrays expanded, so every
  vertex position, strain, level, note and check is in it (316 to 811 kB
  each). The old `drape.mjs` (copied beside the new) and the new one give the
  same sha256 for every case and overall
  (`4b00173ee4ff78c8…`).
- **Suite**: 675 tests, 675 pass. `python3 platform/ci/run_venture_tests.py
  clothing-design-studio` (the CI command): ok, 12.9 s.

## Numbers

Same container, bash timestamps.

| | before | after |
|---|---|---|
| one `drapeGarment` M tee, cold process | 5.17 s | 3.27 s |
| `armContact` self time in that drape | 2.89 s | 0.60 s (+ 0.63 s `armsClear`) |
| `drape.test.mjs` alone (unsplit, after change 1) | 29.8 s | 21.1 s, 20.6 s |
| suite, `node --test '*.test.mjs'` | 31.9 s | 12.7 s |
| `run_venture_tests.py clothing-design-studio` | | 12.9 s |

The "before" suite was a `git archive HEAD` copy of the venture; its one
failure there (`byok.mjs is a synced copy`) is the copy lacking
`platform/llm/byok.mjs`, not a real failure.

## Not changed, ranked for the next run

1. **`simulate` itself (1.6 s self per M tee)**: the XPBD edge loop. Its
   arithmetic order is the output; any change there needs a tolerance
   argument, not `cmp`.
2. **`pushOut`** calls `sectionAt` up to 9 times per vertex (3 Newton steps,
   each at y and y +/- 1e-4) with a linear walk over the body levels. A cached
   level index would be exact; perhaps 0.3 s a drape.
3. **The sleeves test is now the floor** (about 10 s, four drapes in one
   test). Splitting it would mean splitting a test's assertions, which share
   `r` across checks: only if the suite floor matters again.
4. P063 and P064 remain owner-gated (workflow files).
