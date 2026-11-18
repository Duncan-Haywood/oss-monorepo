# CI perf, 2026-11-18: shift-roster-builder, the open-hours row before the dual branch

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/`, which CODEOWNERS holds for the owner, so this run took a venture suite.

## Reading

Each `*.test.mjs` file alone (`node --test <file>`, one at a time, this 4-core
container, main at `e04b8ad26`) across the eleven heaviest suites by test bytes.
Sums: shift-roster-builder 494 s, changepoint-detector 109 s, ai-bookkeeper 58 s,
wall-framing-takeoff 37 s, einvoice-preflight 28 s (the sweep was stopped before
league-schedule-generator, clothing-design-studio, babysitting-business-kit and
chant-forge). Thirteen mid-size suites (ebay-fee-calculator, sales-agent,
amazon-fba-calculator and others) each took under 2 s, and seven more from
`platform/ci/venture_suite_times.json` (support-agent, s3-storage-class-savings,
pick-path-optimizer and others) under 6 s. Slowest files: shift-roster-builder
`calc.test.mjs` 79 s, `open-sums.test.mjs` 49 s, `warm-score-floor.test.mjs` 36 s.

`calc.test.mjs` had passes on 2026-11-12 to 11-16, and their notes say it is
bound by budgets that are what the tests are about. `open-sums.test.mjs` had none.
Its third test, "call-out week with Cleo off Saturday", is 49.2 of its 49.3 s,
spent in three `buildRoster` calls:

| call | wall | where (buildRoster `timings`) |
|---|---:|---|
| `on` (defaults) | 0.36 s | scoreCG 0.16 s, proven |
| `late` (`earlyFloor: false`) | 19.4 s | scoreCG 10.0 s (its `scoreCGMs` budget), exactSearch 9.2 s |
| `off` (`openSums: false`) | 29.1 s | exactSearch 25.1 s, dayLNS 2.0 s, scoreCG 1.5 s |

## Profile

An instrumented copy of `exactSearch` timed each floor stage. In `late`:
`priceOpenFloor` 0.85 s, then `branchDual` 8.0 s, which ran out its
`dualBranchMs` budget (8 s) without proving anything. The lifted priced floor
was already 3 h, the incumbent's open hours, so the cover branch, the cover LP
and the coverage pass were all skipped. Then the open-hours row (`onFloor`,
buildRoster's `openRow`) proved the week at its root LP in 0.09 s. The 8 s
bought nothing.

Across the whole suite (same instrumented copy, `node --test *.test.mjs`, 769
pass), `branchDual` ran 46 times, 75 s in all. Only this one call had the row
prove the week after it. The other 45 had no row to try (scoreCG off or
`openRow` off), or the row did not prove the week.

## Change

`calc.mjs`, `exactSearch`: the priced floor's lift (`pfOpen`) is computed
before the dual branch rather than after (same expression). When `onFloor`
exists, `pfOpen > 0`, `pfOpen` already reaches the incumbent's open hours and
the priced bound has not yet proved the roster, the row is tried first, with
`(pfOpen, incumbent)`. These are the same arguments the later call would get:
nothing between the two spots can change them. The cover branch and the cover LP
need `minOpenH < incHours`. The coverage pass needs `incOpen > minOpenH`.
`lpOwner` only comes from the cover LP. If the row's bound proves the roster, the
dual branch is skipped and the existing code path returns the proof. Otherwise the
answer is kept and reused at the old call site, and the dual branch runs exactly
as before. `rowBeforeDual: false` restores the old order. `optimality.openRow`
gains `beforeDual: true|false`.

The trade: when the row does not prove the week and the dual branch then does,
the row's time (0.1 s here, `scoreCGMs` at most) is spent where it was not
before. The suite had no such case. Without the reorder it had one row call
that ran after a full dual branch.

## Verification

- **Same answers.** On the `late` call, `rowBeforeDual: true` (new) and `false`
  (old order) give the same `owner` (`===` on the JSON), the same `score`, and
  the same whole result JSON once timing and search-effort fields are removed
  (`timings`, `timeline`, `ms`, node and round counts, the per-stage stats and
  bounds). `status`, `lowerBound`, `forcedOpenHours`, `coverageProven`, the
  people, the shifts and the costs are all compared.
- `open-sums.test.mjs` asserts `late.optimality.openRow.beforeDual === true`
  next to its existing checks (same unfilled hours, `openRow.proven`, same
  `bestScore` as `on`).
- The whole suite, `node --test *.test.mjs`: 769 of 769 pass after the change
  (the same 769 passed on the instrumented copy of the old code). Suite wall was
  180 s after and 183 s before (the instrumented run). It is bound by
  `calc.test.mjs` (79 s alone), which this change does not touch, so the suite
  wall is not where the saving shows. The saving is CPU time on the runner pool,
  which other suites share.

## Numbers

| measure | before | after | how |
|---|---:|---:|---|
| `late` call | 19.4 s | 11.0 s | `performance.now()` around `buildRoster`, alone |
| its `exactSearch` stage | 9.2 s | 0.9 s | buildRoster `timings.exactSearch` |
| `open-sums.test.mjs` | 49.3 s | 41.1 s (-17%) | `node --test --test-reporter=tap`, file `duration_ms`, alone |

The real-use effect is small. With default options, `exactSearch` gets an
`onFloor` only on weeks of 60 shift copies or fewer (`bigExact` skips it above
that). Those weeks also get the early floor, which usually lets scoreCG prove the
week before `exactSearch` starts. The reorder helps such weeks when the early
floor comes back 0 while the priced floor is above 0, and it helps `earlyFloor: false`.

## Not changed, ranked for the next run

1. **`late`'s scoreCG, 10.0 s.** Without the early floor, its whole-score
   column generation branches 2,232 nodes and stops at its budget with a bound
   of 204,096 against a 304,071 roster. The test gives it 10 s (`scoreCGMs`)
   because the `on` call flaked at 1.5 s on loaded runners (2026-11-14). The
   `late` call could take its own smaller `scoreCGMs`, since its assertions are
   about the row, not this pass, but that is a test-budget change: check that
   `openRow` (which also reads `scoreCGMs`) keeps a wide margin under load first.
2. **`off`, 29.1 s.** `openSums: false` is the ablation, and its floor stages run
   to their budgets: dual branch 8 s, cover branch 4 s, cover LP 10 s (`coverLPMs`),
   then the tree. All three are fixed budgets that ignore `exactMs: 1500`, so an
   "exact search limit" of 1.5 s can take 25 s. Whether the stages should share
   `exactMs` is a product question (they are what proves floors on the 10x28
   weeks, README 2026-10-26), not a speed-up.
3. **The other 45 `branchDual` runs (67 s in the suite)** have no row to try
   first. Not profiled at the line level.
4. P063 and P064 remain owner-gated (workflow files).
