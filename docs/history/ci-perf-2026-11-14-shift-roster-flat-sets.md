# shift-roster-builder: flat set arrays in the priced bound, and the red test they did not fix (2026-11-14)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took a fresh reading of the venture
suites.

## Reading

`python3 platform/ci/run_venture_tests.py --no-unwired --slowest 30`, this
container (4 cores), 2026-11-14: 1,360 suites, **1 failed**:
shift-roster-builder, in
`open-sums.test.mjs` "call-out week with Cleo off Saturday: coverage proven at
3 h open", with `status` "bounded" where the test wants "optimal" or
"improved". The slowest suites were league-schedule-generator 626 s,
changepoint-detector 543 s, shed-designer 518 s, shift-roster-builder 221 s,
ai-bookkeeper 127 s, wall-framing-takeoff 114 s.

Run alone, the test passed in 43 s. So the failure only happened under load, and
the test was slow.

## Profile

`node --cpu-prof` on the test's three `buildRoster` calls (on, late, off),
self time summed per function: **`scoreDualCore` 20.5 s** of about 43 s,
`solveLP` 8.5 s, `priceOpenFloor` 3.0 s, GC 1.9 s. `scoreDualCore` is the
subgradient loop under the Lagrangian score bound and `branchDual`. Every
round, for every person, it sums the shift prices over each of that person's
candidate sets, which can number in the thousands. The sets were one small JS
array per set, iterated with `for...of`.

## Change

`scoreDualCore` now flattens each person's sets once per call into an
`Int32Array` of shift indices plus an `Int32Array` of start offsets (`flatSets`),
and the inner loop walks those. The subtraction order is unchanged, so every sum
is the same double.

## Verification

- **Exact:** the old and new `scoreDualCore` (copied out of the old and new
  `calc.mjs`) on 5,000 random inputs (1 to 6 people, 1 to 12 shifts, up to 30
  sets each, with and without `fixed`, 5% people with no set so the infeasible
  return is hit, 1 to 200 rounds) return equal `best`, `bestLam` and `gr`,
  compared bit for bit including -0 and Infinity. 640 of them were infeasible.
- **Throughput** (temporary counters, since removed, around `scoreDualCore`, the
  test's three calls): before, 161 calls, 21.5 s, 1,048 M set visits, **48.7 k
  visits/ms**; after, 276 calls, 18.9 s, 1,548 M visits, **82.1 k visits/ms**
  (1.69x).
- The test's wall time did **not** drop (43 s before and after, alone). The
  calls that dominate it (`branchDual` at 8 s and 4 s, column generation at
  10 s) stop on the clock, not when the work runs out, so a faster core does
  more nodes in the same time. On this week the extra nodes change no result:
  `unfilledHours`, `status` and `bestScore` are the same on all three calls.
- `python3 platform/ci/run_venture_tests.py shift-roster-builder`: see the
  run record's `notes`.

## The red test, separately

The red test was not a `scoreDualCore` problem. 12 copies of the test's
first call ("on") at once on 4 cores:

| code | runs | "bounded" |
|---|---:|---:|
| old `calc.mjs` | 48 (plus 24 in a first, unlabelled pass: 0) | 3 |
| new `calc.mjs` | 84 | 4 |
| new, test with `scoreCGMs: 10000` | 60 | **0** |

Diffing a bounded run against a good one showed a single difference that
mattered: `scoreCG.proven` was false at `scoreCG.ms` 1,523. Score column
generation's budget defaults to `exactMs`, which the test sets to 1.5 s. On an
idle machine it proves the week in 235 ms; with 12 processes on 4 cores it
took up to 1,599 ms. The test now gives the "on" and "late" calls
`scoreCGMs: 10000`. They still run the 1.5 s exact search the test is about,
the assertions are unchanged, and a proven week stops early, so an idle run
gains no time: the "on" call took 0.5 to 0.7 s alone both ways, and the whole
file took 50.7 s after the change (the test alone was 43 s before). The "off" call keeps the old options, because it is the
call that runs out its budgets on purpose.

## Not changed (ranked, for the next run)

1. **Other `exactMs`-budgeted tests** in this suite that assert "optimal",
   "improved" or `proven`. They can fail the same way on a loaded runner. Grep
   for `exactMs:` near a status assertion. The right fix is per test: give the
   phase that must finish its own budget. A shorter search does not help.
2. **`solveLP`** (8.5 s self time, `bnp.mjs`): the next item in the profile,
   mostly in the "off" call's column generation. It also has a time budget, so
   speeding it up buys nodes, not wall time.
3. **The "off" call (30 s)** is mostly wall-clock budgets (dual branch 8 s,
   cover branch 4 s, cover LP 10 s). Lower budgets in the test would cut the
   suite, but whether `forcedOpenHours < 3` still holds at lower budgets has
   to be checked, and that would be a test change, not a speed-up.
4. P063, P064 remain owner-gated.
