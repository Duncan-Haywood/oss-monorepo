# CI perf 2026-11-16: the carry-over guide's leg ones, searched once

Perf track. Takes item 3 of "Not changed" in
[`ci-perf-2026-11-16-league-serial-once.md`](ci-perf-2026-11-16-league-serial-once.md):
`carryover.test.mjs` "the carry-over guide's numbers come from the code and the
real fixture data" (16.2 s there, never profiled). Both open perf backlog items
(P063, P064) touch workflow files and still wait for the owner.

## Pool reading

`python3 platform/ci/ci_profile.py --runs 200 --top 25` (2026-11-16 02:50Z to
03:07Z): 180 jobs, 162.3 job-minutes, checkout 67.5. Portfolio Pages is the
largest workflow (60.7 min; "Test the site builder" 21.3 min over 9 runs, median
143 s), then Portfolio validate (28.4 min, no step over 0.9 min) and ventures
tests (13.9 min; "node --test in each touched venture" median 101 s). The Pages
tests have had a dozen passes since 2026-10-24; this run took the venture side.

## Reading, local

4 cores, Node 22. Per-test `duration_ms` from `node --test --test-reporter=tap
carryover.test.mjs`; the eval timed with `date` around
`node eval/carryover-real.mjs --json`, twice each way (`git stash` for before).

Where the guide test went (each search timed alone):

| step | ms |
|---|---:|
| 18 teams: single (w=0), single (w=10), whole season (w=10), whole season (w=0) | 793, 2,643, 4,942, 1,663 |
| 20 teams: the same four | 488, 1,162, 3,043, 1,361 |
| the page's other searches (8, 16, 20 teams) | about 1,400 |

So `run()` in `eval/carryover-real.mjs` was 16 of the 18 s. Counting calls to
`lowCarryOverRounds` by argument inside `run()` showed why: at 18 and 20 teams
(`starterApplies`, not `fieldApplies`) both the single search and
`lowCarryOverDoubleRounds` take the "circle start against each construction
start" branch, and each runs the same leaf searches with the same seed, effort
and break weight. Every leaf (circle start, `starter`, `weighted starter`, at
w=0 and w=10, both sizes) ran exactly twice: about 4.9 s of repeats.

## Change

- `carryover.mjs`: `lowCarryOverRounds` is now a thin wrapper over the old body
  (`searchRounds`). New export `withSearchMemo(fn)` runs `fn` with the wrapper
  memoised on its full argument list; outside it nothing changes (no lookup, no
  copy). Inside, every answer handed back is a `structuredClone`, so a caller
  editing its season cannot reach the memo. Recursive calls go through the
  wrapper, so the nested leaves are what gets shared.
- `eval/carryover-real.mjs`: `run()` wraps its table in `withSearchMemo`.
- `carryover.test.mjs`: a new test pins the memo to the unmemoised search (a
  repeat equals a fresh call, a mutated first copy does not leak, another seed is
  its own entry). 0.6 s.

The memo stays opt-in on purpose: several tests call the search twice to show it
is seeded and repeatable, and a global memo would make those pass vacuously (the
reason the 2026-11-16 serial-once run declined a file-local memo in
`starter.test.mjs`).

## Verification

- `node eval/carryover-real.mjs --json` before and after: `cmp` identical.
- `carryover.test.mjs`: 18 of 18 pass (17 old plus the new one).
- `python3 platform/ci/run_venture_tests.py league-schedule-generator`: 554 of
  554 pass, 203.7 s (207.6 s before; the suite's wall moves within noise, the
  saving is CPU on one file). A first pass of it failed the 12-team proved-least
  check: my own find-and-replace had rewritten that assertion while I sized the
  new test. Restored; the suite caught it.

## Numbers

| measure | before | after |
|---|---:|---:|
| `node eval/carryover-real.mjs --json` | 16.4 s, 16.1 s | 12.1 s, 11.8 s |
| guide test (`duration_ms`) | 18.0 s | 13.6 s |

About 4.4 s of CPU per venture run of the suite (whole suite 553 tests, 3 min
28 s wall on 4 cores before), less the new test's 0.6 s.

## Not changed, ranked for the next run

1. The w=10 whole season's own leg-two anneal (`lowCarryOverDoubleRounds`
   `exact`, about 2 s at 18 teams): no repeats left, only fewer iterations,
   which changes the answer.
2. `assignVenuesOnce` (17% of self time under `--cpu-prof` of the eval): its
   annealing draws from the seeded RNG, so any reordering changes seasons.
3. "the carry-over-only season" (15.3 s) and "double round robin searched as a
   whole" (10.0 s) in the same file: already shared once (2026-11-15); not
   re-profiled.
4. P063 and P064 remain owner-gated (workflow files).
