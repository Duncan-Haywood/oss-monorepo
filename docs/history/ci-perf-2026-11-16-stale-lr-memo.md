# changepoint-detector: the stale-feed test answers a repeat question once (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took a reading and then went
through the slowest venture suites.

## Reading

- `ci_profile.py --runs 600 --top 25` (2026-11-16 01:15 to 02:18 UTC): 590.7
  job-minutes in 560 jobs, 239.7 of them checkout. The heaviest steps:
  `node --test in each touched venture` 53.8 min and `Test the site builder`
  50.2 min. The checkout share is P063/P064's work, which is owner-gated.
- `check_conflict_markers.py`, item 1 on the 11-12 list: 16.5 s on a cold page
  cache (2.0 s user, 1.7 s sys, the rest waiting on disk), **2.2 to 2.3 s
  warm**, three runs. In CI the checkout has just written every file, so the
  cache is warm. Not worth changing.
- `run_venture_tests.py --times` still ranks league 627 s, shift-roster 571 s,
  changepoint 569 s, shed 472 s, wall-framing 90 s (2026-11-15 00:25Z). The
  wall-framing figure is stale: it took **27.2 s** this morning (1,206 tests),
  and its longest file is 5.9 s.

## A dead end first: carry-over kept up to date in the league annealer

League's slowest test, `floorTable.balanced gives leastBreaks' balanced least`
(floor-priced.test.mjs, item 1 on the 11-15 list), took **54.6 s** alone. Under
`node --cpu-prof`, 55.1 s of it is the 30 `carryOverTry` searches and almost
none is `leastBreaks`. Inside the searches, `coeCost` (14.6 s self) and `mixed`
(13.7 s) recount the carry-over sum, O(N R), after every move.

A move changes two rounds, or a few teams. So this run wrote `coeTracker`: the
pair counts persist across one anneal, and a move takes out the changed teams'
transitions (from the game before a changed round to the game after it) and
puts them back as they are after the move, with a log to undo a rejected move.
The integers are the ones `coeOf` gives, so the search takes the same path. A
411-case sweep (3 to 23 teams, plain, cyclic, break-weighted, carried hosts,
double round robins, `carryOverTry` 0 to 9) gave **byte-identical results**
to the old code.

It was **slower**: 96.2 s for the test, then 76.6 s after the bookkeeping went
into flat typed arrays, against 54.6 s. The profile says why. At 8 to 14 teams
a full recount is R ≈ 13 tight steps per team. The incremental version still
needs about eight count updates per changed (team, round) cell, plus the log
and the undo. A round swap changes every team in two rounds, so it costs more
than the recount it replaces. The break-even is somewhere past 30 teams, and
the tests run at 8 to 14. The change was reverted. **Don't retry this at test
sizes.** If the page is slow at 30 to 40 teams, measure the tracker there.

## The change

`update-rate-columns.test.mjs` was changepoint-detector's longest file: 46.8 s
at two files at a time, and **42.8 s alone**. One test, `analyzeMulti` on
`data/frozen-juice.csv` with three columns, took 26.0 s. Under the profiler,
24.9 s of that is `staleLRMarkov`, the round-five stale-feed likelihood ratio
(two forward filters, `roundedWalkLogLik` 11.2 s self and
`roundedWalkLogLikMarkov` 13.2 s), reached through `consensus` → `runSetting`
→ `analyze` → `updateRateChanges` → `roundingVerdict`.

Counting the calls settled it: **7 calls, 1 distinct input.** The ppi
column's 218-step stretch, with default options, is fitted once by the
several-columns check and again by each consensus setting. Each fit is the
same 3.6 s of work, because the fit is a pure function of the ticks and the
options.

`staleLRMarkov` now keeps its last 16 answers in a `Map`, keyed on the ticks
(length and values) and on the options, with infinite numbers spelled out so
`Infinity` in `nus` keys apart from `null`. A hit returns a shallow copy, since
the result is a flat object of numbers and `null` for a stretch outside
`minSteps` to `maxSteps`. The first key in goes out first once 16 are held.
The fit itself moved unchanged into `staleLRMarkovFit`.

## Verification

- **Same answers**: `analyzeMulti` on frozen-juice (price, ppi, fdd) hashes
  the same before and after (sha256 of the JSON, `3965f421d5a0efbf`), taking
  **26.0 s before and 4.6 s after**.
- **Full suite**, old tree against new, one after the other on 4 cores:
  755 of 755 pass before and 757 of 757 after (two new tests). It took 154 s
  wall and 7 m 42 s user before, and 143 s wall and 7 m 03 s user after.
- **Per file**, alone: update-rate-columns **42.8 s → 12.4 s**, update-rate
  13.9 s → 12.8 s.
- New `stale-lr-memo.test.mjs` (3.3 s): a repeat gets an equal answer as its
  own copy (changing one caller's copy does not reach the next); a changed
  tick, and `nus: [Infinity]` against the default grid, are fitted afresh;
  too-short stretches stay `null`.

## Suite times file

`run_venture_tests.py --write-times changepoint-detector wall-framing-takeoff`
refreshed two rows of `platform/ci/venture_suite_times.json`: changepoint
569.1 to 152.9 s, and wall-framing 90.0 to 38.7 s. Most of the changepoint drop
is the old figure having been taken with 4 suites sharing 4 cores, not this
change (this change is about 11 s of wall time on its own; see above). The
file's `taken` stamp now reads 2026-11-16, but only those two rows were re-timed:
league, shift-roster and shed are still the 2026-11-15 contended figures.

## Not changed, ranked for the next run

1. **changepoint-detector per file** (two at a time): engine 33.8 s,
   engine-trend-bends 28.4, engine-trend-joint-knots 24.4, drift-warning-null195
   18.7, drift-warning-null195-ar1 18.0, watch-workflow 16.9. The suite's wall
   time is now set by these, not by update-rate-columns.
2. **The rest of update-rate-columns (12.4 s)**: the CLI test (12.7 s alone)
   runs `main` three times on the same file. The memo covers its ppi stretch,
   but the other columns' consensus runs repeat `analyze` itself. Count the
   distinct `analyze` inputs before memoising anything bigger.
3. **League `bestCarryOverRounds keeps its choice`** (44 s, 11-15 list item 2):
   `plain` and `withF` search the same 8 tries. Sharing them means a product
   API that accepts tries already run, so it is a venture change, not a test
   change.
4. P063 and P064 remain owner-gated.
