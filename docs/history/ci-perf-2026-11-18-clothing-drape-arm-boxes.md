# CI perf, 2026-11-18: clothing-design-studio drape, one arm pass and a box per arm

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/workflows/` and wait for the owner, so this run timed the venture
suites with the largest test files that had no recent pass.

## Reading

4-core container, node 22.23.5, nothing else running.

- Suites (`node --test` on each venture's test files, bash timestamps):
  ebay-fee-calculator 1.1 s, ids-model-check 2.8 s, sales-agent 3.7 s,
  amazon-fba 0.8 s, shopify-fee 0.7 s, where-to-sell 0.6 s,
  **clothing-design-studio 18.9 s**.
- Inside clothing-design-studio, the slowest tests were all drapes: the
  sleeves test 12.0 s, lowerArms 5.4 s, regular/slim tee 4.5 s, soft-torso
  arms out 4.4 s.
- `node --cpu-prof` on one `drapeGarment(me, { garment: "tee", size: "M" })`
  (4.05 s), self time per function: `simulate` 1.74 s, **`armContact` 0.71 s +
  `armsClear` 0.71 s**, `pushOut` 0.42 s, `sectionAt` 0.15 s.

The 2026-11-13 pass (`ci-perf-2026-11-13-clothing-drape-arm-reject.md`) added
`armsClear` as a cheap "nowhere near an arm" check before `armContact`. Sleeve
vertices sit next to an arm on every substep, so for them the projection onto
all 8 capsules ran twice: once in `armsClear` (which failed), then again in
`armContact` with a `Math.hypot` per capsule.

## Change (`drape.mjs`, `pushOutArm` only)

1. **One pass.** Each capsule is projected once. If its squared axis distance
   is at least `(r + thick + 1e-9)^2` the capsule is skipped with no `hypot`:
   it is `thick` or more away, so it cannot push the point, and it cannot be
   the nearest capsule when another one does push it. The remaining capsules
   are compared with `armContact`'s own arithmetic, first minimum wins, so the
   winner (and the push) is `armContact`'s whenever there is a push. When
   nothing is closer than `thick`, both versions return 0.
2. **A box per arm.** Each arm's capsule end points give an axis-aligned box,
   kept in a `WeakMap` keyed by the `body.arms` array (`setArmAngle` replaces
   that array and builds new arms; nothing mutates capsules). A point outside
   the box by more than the arm's widest radius + `thick` + 1e-6 m would have
   every capsule of that arm skipped in step 1, so the whole arm is skipped.
3. **NaN** coordinates (from the point or a capsule) fall back to the old
   `armContact` path, so even a broken simulation moves the same way.

`armsClear` is gone; `armContact` is unchanged and still used by `sleeveLevels`,
`bodyClearance` and the fallback.

## Verification

- **Byte-identical drapes.** Fourteen `drapeGarment` calls (every one the tests
  make, plus an XL slim with a 36 cm upper arm and an XS small body with arms
  lowered), each result `JSON.stringify`d with typed arrays expanded (316 to
  918 kB each). Old `drape.mjs` (from `HEAD`) and new give the same sha256 per
  case and overall (`fa0e6c1f0a333086…`).
- **Suite**: 719 tests, 719 pass. `python3 platform/ci/run_venture_tests.py
  clothing-design-studio` (the CI command): ok, 17.3 s.

## Numbers

Same container, bash timestamps; old = `git show HEAD:…/drape.mjs` swapped in.

| | before | after |
|---|---|---|
| one M tee drape, cold process | 4.05 s | 2.81 s |
| arm work in that drape (self time) | 1.42 s | 0.43 s `pushOutArm` + 0.11 s box lookups (before the lookup went to once per vertex) |
| the 14 hashed drapes, one process | 37.0 s | 25.2 s |
| `drape-sleeves.test.mjs` alone | 11.3 s | 8.2 s |
| `drape-soft-torso.test.mjs` alone | 7.9 s | 5.5 s |
| `drape-lower-arms.test.mjs` alone | 5.2 s | 4.2 s |
| suite CPU (user), `node --test *.test.mjs` | 57.4 s | 49.9 s, 54.1 s |
| suite wall | 17.0, 16.2, 18.9 s | 15.4, 16.1, 16.4, 17.7 s |

The suite wall moves little: `node --test` runs 3 files at a time on 4 cores,
so the wall follows total CPU, and the drapes are about half of it.

**Tried and reverted:** splitting the sleeves test (four drapes) into two files
of two. Suite wall stayed at 16.7 / 15.4 s; with the pool full, one long file is
not the floor any more.

The user-facing gain is the browser: `drape.html` runs the same
`drapeGarment`, so a visitor's tee settles about 30% sooner.

## Not changed, ranked for the next run

1. **`simulate`'s XPBD edge loop (1.46 s self per M tee)**: now the majority.
   Its arithmetic order is the output; any change needs a tolerance argument,
   not `cmp`.
2. **`pushOut` + `sectionAt` (0.54 s)**: up to 9 `sectionAt` calls per vertex
   with a linear walk over 12 levels and an object each. Binary search is only
   exact if the levels are sorted for every body (level 5 is a `min`, so check
   that first); returning the two scalars without an object is exact.
3. P063 and P064 remain owner-gated (workflow files).
