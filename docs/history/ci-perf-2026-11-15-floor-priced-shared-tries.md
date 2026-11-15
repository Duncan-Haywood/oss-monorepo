# CI perf, 2026-11-15: league-schedule-generator floor-priced tests 132 s to 103 s, and a negative result on incremental carry-over

Perf track. Both open backlog perf items (P063, P064) touch `.github/workflows/`,
which CODEOWNERS holds for the owner, so this run took the slowest venture
suite in `platform/ci/venture_suite_times.json` (taken 2026-11-15T00:25Z):
league-schedule-generator, 626.8 s under the four-suite pool.

## Reading

Each `*.test.mjs` alone, `node --test --test-reporter=tap <file>`, this 4-core
container (the first eleven files overlapped benchmark runs, so treat those as
upper bounds):

| file | s |
|---|---:|
| floor-priced | 132.0 |
| carryover | 67.0 |
| starter | 44.8 |
| orient | 38.1 |
| capped-breaks | 35.4 |
| best-of-k | 34.2 |
| frontier-pick | 26.9 |
| polish | 22.7 |
| fuzz-build | 21.5 |
| squeeze | 12.7 |
| calc | 10.6 |
| the other 13 | under 4 each |

The sum is about 456 s, so with `node --test`'s default three files at once the
wall is bounded by both sum/3 (about 152 s) and the longest file (132 s).
floor-priced is the longest file and the largest share of the total.

Inside floor-priced, "floorTable.balanced gives leastBreaks' balanced least"
took 54.4 s, and 52.6 s of that was `carryOverTry` building its 30 input
timetables (timed separately: `leastBreaks` 14 ms, `floorTable` 13 ms). Across
the file the same seeded search is asked for the same season over and over:
`carryOverTry(12, 0, { seed: 1, weighted: 8 })` by four tests, (9, 0) and
(13, 0) by three, (12, 1..5) and (8, 0) by two. One 12-team try costs about
3 s, a 9-team one 1.7 s.

## Change

`floor-priced.test.mjs` wraps `carryOverTry` in a file-local memo: each distinct
argument list is searched once, and every caller gets a `structuredClone` of the
result, as a fresh search would hand it. Product code is unchanged. No
assertion, input or test changed. `carryOverTry` is a pure function of its
arguments; that it is seeded is tested where the search is the subject
(`best-of-k.test.mjs`, "keeps the try ... and is seeded"), which still runs the
search twice. A clone of a cached try is `deepStrictEqual` to a fresh search of
the same arguments (checked on (9, 0)).

Repeated calls in other files were checked and left alone: in carryover,
capped-breaks, squeeze, starter and best-of-k they are "same seed twice, same
answer" determinism checks, which a memo would make vacuous.

## Verification

Same container, nothing else running, `time node --test --test-reporter=tap
floor-priced.test.mjs`, before on main at a09f3ce3e, after with this change:

| | before | after |
|---|---:|---:|
| wall | 132.5 s | 103.1 s (-22%) |
| user CPU | 128.8 s | 99.6 s |
| tests | 18 pass, 0 fail | 18 pass, 0 fail |

## Negative result: incremental carry-over in `anneal`

The 2026-11-11 note ranked "an incremental delta for the three move types"
second. Built and measured here, then not landed:

- `node --cpu-prof` on the 30 tries above: `coeOf` (inlined into the `coeCost`
  and `mixed` closures) is 30 of 53 s self time, `teamSwapRounds` 5 s, `anneal`
  4.4 s, `assignVenuesOnce` 3 s. Each try runs several full anneals (circle
  start, starter starts, shift candidates), about 300k `coeOf` calls at 14 teams.
- A tracker that keeps the pair counts and, per move, takes out and puts back
  only the carry-over steps that span a changed (round, team) cell, with an
  undo log on rejection. Carry-over is a sum of squared integer counts, so the
  values were exact: the output hash of 16 `carryOverTry` and 6
  `bestCarryOverRounds` calls was identical to main's.
- It was slower at every size tried. On 8 tries at 8 teams plus six mixed
  searches it took 33.5 s against 25.0 s on main (a first version that re-walked
  whole team rows: 40 s). `lowCarryOverRounds(n, { seed: 3, field: false })`:
  10 teams 449 ms vs 339 ms, 14 teams 463 vs 282, 22 teams 359 vs 408,
  30 teams 534 vs 552. The iteration budget is 4e7 / N^2, so a recount is already
  only N^2 cheap, branch-light, typed-array steps. The tracker touches 2N to 4|S|
  cells a move, each with a backward and a forward scan down a column plus the
  log, and that costs as much as the recount it replaces.
- A round-major `coeOf` (reading each round's row in order instead of one team's
  column through all rounds): same hash, 53.1 s against 52.9 s. Memory order is
  not the cost.

Conclusion: at the sizes the suite and the page use (6 to 30 teams), the
annealer's per-move recount is not the lever. The cost is the number of full
anneals per try, and that is product behaviour the README measures.

## Not changed, ranked for the next run

1. floor-priced "bestCarryOverRounds keeps its choice with floor-priced
   seasons" (25 s): `plain`, `withF` and `buildSchedule` each search the same
   six 10-team tries. Sharing them needs a product hook (for example passing
   searched tries into `bestCarryOverRounds`, as the worker pool already does
   with `combineCarryOverTries`), not a test memo.
2. The rest of "floorTable.balanced" (about 25 s now): 24 distinct tries at 8
   to 14 teams, used only as realistic inputs to `floorTable`. A committed
   fixture of those timetables would cut it to well under a second, at the cost
   of the inputs no longer following the search when it changes. Not taken here.
3. carryover.test.mjs "the carry-over guide's numbers come from the code"
   (14.4 s) and starter.test.mjs (44.8 s): not profiled yet.
4. P063 and P064 remain owner-gated.
