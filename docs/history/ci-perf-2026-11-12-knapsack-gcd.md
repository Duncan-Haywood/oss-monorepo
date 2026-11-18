# CI perf, 2026-11-12: wall-framing-takeoff's pricing knapsack on weights / gcd

Perf track. Both open backlog perf items (P063, P064) touch
`.github/workflows/`, which CODEOWNERS holds for the owner, so this run took
"the slowest local step an agent session waits on", picking up item 2 of the
ranked list in `ci-perf-2026-11-11-exact-stock-bitset-dp.md`: the
wall-framing-takeoff mutation sweep.

## Reading

Each of the venture's 142 test files timed alone (`node --test <file>`, this
4-core container, serial, 78.6 s in all). Slowest: `cli-sweep.test.mjs`
12.6 s, `mutation-sweep.test.mjs` 11.6 s, `engine.test.mjs` 7.0 s.

`node --cpu-prof` on the mutation sweep (814 accepted single-field mutations of
the sample plan, each through `takeoff`): of about 12 s, 6.4 s of self time was
in `boundedKnapsackMulti` and its inlined loop (`engine.mjs`), the pricing step
of the column generation that buys the lumber. Next were the LP pivots
(`lpDualSettle` 0.95 s, `lpAddRow` 0.40 s).

Instrumented on `takeoff(samplePlan())`: 76 knapsack calls, every one with all
weights and capacities even (gcd 2). Weights are piece length plus kerf in
1/16 in: whole-inch or eighth-inch pieces with the default 1/8 in kerf are all
multiples of 2.

## Change (`ventures/wall-framing-takeoff/engine.mjs`, `boundedKnapsackMulti` only)

- When every weight shares a factor `g > 1`, fill the table on `weights / g` and
  look each capacity up at `floor(cap / g)`. Only multiples of `g` are
  reachable, so the original `best[c]` and `keep[k][c]` depend only on
  `floor(c / g)`, and the walk back from `cap` subtracts multiples of `g`. The
  same floating-point additions run in the same order: values and counts are
  identical, and the table is `g` times shorter.
- Chunks with no positive value (they never update `best`) get no keep row, and
  the fill loop hoists the chunk's weight, value and row.

The vendored copy `ventures/open-house-plans/wft-engine.mjs` was regenerated
with `node vendor-framing.mjs` (its `--check` passes).

## Verification

- Old and new `engine.mjs` imported side by side
  (`equiv.mjs` in the session scratchpad):
  20,000 random `boundedKnapsackMulti` instances (gcd 1 to 4, 1 to 12 items,
  10% negative values, 1 to 3 capacities not aligned to the gcd),
  `JSON.stringify` equal, 0 differences; every accepted mutation-sweep plan
  plus 30 kerf and stud-length variants (814 `takeoff` outputs), 0 differences.
- New test `boundedKnapsackMulti on weights with a common factor matches the
  unscaled table exactly` (`engine.test.mjs`) keeps the old DP as a reference
  and `deepEqual`s 300 seeded cases. Changing `Math.floor(c / g)` to
  `Math.ceil` turns it red.
- `python3 platform/ci/run_venture_tests.py wall-framing-takeoff open-house-plans`:
  see the run record's `notes`.

## Numbers

Same container, nothing else running, wall time of `node --test <file>`,
three runs each, "before" a copy of the venture with the old `engine.mjs`.

| | before | after |
|---|---|---|
| `mutation-sweep.test.mjs` | 12.07 / 11.90 / 11.94 s | 8.73 / 8.61 / 8.47 s (−28%) |
| knapsack self time in its profile | 6.4 s | 4.2 s (gcd step alone; before the loop hoist) |
| `takeoff(samplePlan())`, median of 10 warm | 15.9 ms | 15.0 ms |
| `cli-sweep.test.mjs` | 12.1 / 12.1 s | 11.5 / 12.1 s (unchanged: process start-up) |

## Not changed, ranked for the next run

1. **`cli-sweep.test.mjs`** (12 s): 144 `node cli.mjs` spawns, about 85 ms each,
   run one after another. Most of it is process start-up and module load, not
   the engine. Running each plan's 36 flags concurrently would cut wall time but
   not CPU, and on CI the suite already shares 4 cores with other files; an
   in-process harness would test something different (the raw-error check is
   on the child's stderr). Worth a measured try with a small concurrency cap.
2. LP pivots (`lpDualSettle`, `lpAddRow`): about 1.3 s of the sweep. Already
   sparse-pivot; the next step would be a bounded-variable or revised simplex,
   a bigger change.
3. P063 and P064 remain owner-gated.
