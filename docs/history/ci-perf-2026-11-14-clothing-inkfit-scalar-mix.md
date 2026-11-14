# clothing-design-studio: inkfit.test.mjs 5.66 s to 3.47 s, bit-identical (2026-11-14)

Perf track, prompt 0. Both perf backlog items (P063, P064) are still owner-gated
workflow edits, so this run timed venture suites no perf pass had read
(`node --test` over each venture's `*.test.mjs`, this container, 4 cores, node 22):
ebay-fee 1.2 s, babysitting-business-kit 7.3 s, sales-agent 4.3 s,
clothing-design-studio 15.2 s, eight others under 1 s. In clothing-design-studio,
the drape files had a pass on 2026-11-13
(`ci-perf-2026-11-13-clothing-drape-arm-reject.md`); the next file down,
`inkfit.test.mjs` (5.7 s), had none. `inkfit.mjs` is also what the studio page
runs in a visitor's browser when it picks inks for an index print
(`index.html`, `chooseIndexInks`).

## Profile

One test is 5.28 s of the file's 5.66 s: "chosen inks are never further from the
painting than the flat inks". It calls `chooseIndexInks` four times on a
140x90 card: once at 1 m (0.70 s) and three times at 3 m (about 1.5 s each:
the loop, then twice for the repeatability check).

`node --cpu-prof` on three of those calls, self time: `mixWeights` 1634 ms,
`unlin` 614 ms, `toLab`'s `lin` 565 ms, `labOfLin` 178 ms, GC 164 ms,
`toLab`'s `f` 152 ms, `mixCost` 136 ms. So: the Frank-Wolfe mix per sample, per
cost evaluation of the pattern search, then the Lab conversion of the mixed
colour (a `pow` pair).

## Change

1. **`mixWeights` on scalars.** It kept the mix `p`, the gradient `g` and the
   step `d` as 3-element arrays, two of them allocated every iteration, and
   `n2` through `map`. Now they are local numbers, `n2` a `Float64Array`, and
   the result array is made once at the end. Every expression is the same
   operation in the same order (no fused multiply-add in JS), so the bits are
   the same.
2. **The repeatability check makes one call, not two.** It compared two fresh
   3 m calls; it now compares one fresh call with the 3 m pick the loop above
   already made, on the inks *and* every candidate's label, inks and score
   (the old check compared only the inks). Still two independent calls on the
   same input.

## Verification

- `chooseIndexInks` at 1, 3 and 3 m on the test card: JSON of inks and all
  candidates (with their deltaE floats) `cmp`-identical before and after.
- 200,000 random `mixWeights` calls (2 to 7 points, lambda 0, 0.01, 0.3, 0.95
  and 2, random warm starts), old file against new: the returned mix and the
  updated weights `Object.is`-equal on every call.
- `python3 platform/ci/run_venture_tests.py clothing-design-studio`: ok (14.5 s).

## Numbers

| | before | after | how |
|---|---|---|---|
| `node --test inkfit.test.mjs` wall | 5.66 s (5.66, 5.67, 5.64) | 3.47 s (3.38, 3.56, 3.48) | three runs each, same container |
| three `chooseIndexInks` calls (1, 3, 3 m) | 3.76 s (702 + 1526 + 1531 ms) | 3.09 s (633 + 1206 + 1255 ms) | `Date.now()` around each call |
| `mixWeights` self | 1634 ms | 1093 ms | `node --cpu-prof`, summed self time |

The second row is what the page gains: about 18% off each ink choice.

## Tried, no gain

Hoisting `toLab`'s two inner closures (`lin`, `f`) to module level in
`separation.mjs`: 3.07 s against 3.09 s, inside noise (V8 already inlines
them). Reverted.

## Not changed, ranked for the next run

1. **`unlin` then `toLab`'s `lin` on every mixed colour** (about 1.2 s of the
   3.1 s): `labOfLin` goes linear to sRGB (`** (1/2.4)`) and `toLab` straight
   back (`** 2.4`). Skipping the round trip would be faster but not
   bit-identical; it would need a tolerance argument and an eval re-run
   (`eval/index-inks.mjs`).
2. **Warm starts are shared by rejected trials** in `fitIndexInks`: a rejected
   trial still moves the per-sample weights the next trial starts from, so the
   search's answer depends on evaluation order. Any trial skipping or caching
   changes output; a product decision, not perf.
3. **babysitting-business-kit** (7.3 s) and **sales-agent** (4.3 s) have had no
   per-file reading.
4. P063 and P064 remain owner-gated (workflow files).
