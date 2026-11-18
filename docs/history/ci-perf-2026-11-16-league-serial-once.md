# CI perf, 2026-11-16: league-schedule-generator, the serial search once per season shape, shared tries, counts checked first

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/`, which CODEOWNERS holds for the owner, so this run again took the
slowest venture suite in `platform/ci/venture_suite_times.json`:
league-schedule-generator (626.8 s under the four-suite pool, 2026-11-15).

## Reading

Each `*.test.mjs` alone, `node --test <file>`, one at a time, this 4-core
container, main at `d475aabdb`: floor-priced 98.7 s, starter 50.9, carryover
47.6, orient 39.3, best-of-k 36.7, capped-breaks 36.4, doubleheader 24.3,
polish 24.1, fuzz-build 22.6, frontier-pick 22.5, squeeze 13.5, calc 11.7,
the other 13 under 4 s each. The sum is about 470 s.

The slowest tests (spec reporter):

| test | file | s |
|---|---|---:|
| floorTable.balanced gives leastBreaks' balanced least ... | floor-priced | 33.1 |
| bestCarryOverRounds keeps its choice with floor-priced seasons ... | floor-priced | 26.1 |
| a pool of any size, finishing in any order ... | best-of-k | 23.0 |
| carryOverFloorPriced: seasons into the widest gap ... | floor-priced | 22.9 |
| the carry-over guide's numbers come from the code ... | carryover | 16.2 |
| the carry-over-only season ... reaches the proved 94 | carryover | 13.1 |

## Three findings

**The pool test ran the serial search six times.** It compares worker pools
(1, 3 and 8 workers, results arriving in reverse) against the serial
`bestCarryOverRounds` for picks 0, 10 and 40, single and home-and-away. The
pooled side already shared one set of 8 searched tries. But the serial side
called `bestCarryOverRounds` once per pick, and each call searched the same 8
tries again. Only its last step, `combineCarryOverTries` over tries 0 to 7 in
order, depends on the pick.

**The floor-priced choice test searched the same eight 10-team tries three
times before `buildSchedule`.** `plain` and `withF` were two full
`bestCarryOverRounds` calls over the same 4 + 2 + 2 tries. The third search
came from `assert.throws(... floorPriced: -1 ...)`: `bestCarryOverRounds`
checked `squeeze`, `polish` and `floorPriced` only after its tries, so the bad
count threw about 6 s into a search.

**The floor-priced seasons themselves are cheap.** Timed separately: twelve
12-team tries 26.5 s, `carryOverFloorPriced` on them (400 iterations) under
1 ms. Eight 10-team tries 6.1 s, `carryOverFloorPriced` on them 0.26 s. So
the cost in this file is in the seeded tries used as inputs.

## Change

- `carryover.mjs`, `bestCarryOverRounds`: the `squeeze`, `polish` and
  `floorPriced` checks moved to the top with the `capped` and `gap` checks,
  with the same messages. A bad count now fails before any try is searched.
  Valid inputs take the same path as before. This is the one product change.
- `best-of-k.test.mjs`, the pool test: one full serial `bestCarryOverRounds`
  per season shape (pick 0 single, pick 40 home and away). The other picks are
  checked against `combineCarryOverTries` over clones of the in-order tries
  with `among: 8`, which is the call `bestCarryOverRounds` makes on its last
  line when `capped` is 0 and `pure` is false. Every pool, worker count and
  pick is still compared.
- `floor-priced.test.mjs`, the choice test: `withF` stays a full
  `bestCarryOverRounds` call. `plain` is `combineCarryOverTries` over the
  file's memoised tries, `among: 6`. A new assertion checks that `withF`'s
  first eight listed tries equal `plain`'s, so the floor-priced seasons come
  after the same tries.

## Verification

- Mutation checks, each applied to `carryover.mjs` and then reverted:
  - `among: pick === 0 ? 1 : ...` (the serial pick-0 path is wrong) fails the
    pool test.
  - `combineCarryOverTries` with no sort by index (the result depends on
    arrival order) fails the pool test.
  - Letting floor-priced seasons into the choice pool (`among: floorPriced ?
    Infinity : ...`) is **not** caught by the choice test: at pick 10 no
    floor-priced season out-scores the tries. The old test made the same
    `chosen` comparison against a no-floor-priced run, so it would not have
    caught this either. The rule is pinned elsewhere by the `among` tests in
    best-of-k and carryover.
- Per file, alone, before (`git stash`) and after back to back:

| file | before | after |
|---|---:|---:|
| best-of-k | 35.8 s | 24.6 s |
| floor-priced | 97.2 s | 91.1 s |
| pool test | 23.0 s | 11.1 s |
| choice test | 26.1 s | 18.7 s |

- Whole suite, `node --test '*.test.mjs'`, nothing else running. Before was a
  `git archive` of `d475aabdb`. Its two failures are the page.test sibling-link
  tests, which need the other venture folders an archived copy lacks.

| | before | after |
|---|---:|---:|
| wall | 173.1 s | 171.4 s |
| user CPU | 457.0 s | 444.8 s |
| tests | 553 (551 pass, 2 archive-only failures) | 553 pass |

An earlier pair taken with `git stash` in place gave 173.0 / 451 s before and
175.7 / 455 s after. **At suite level the gain is within run-to-run noise**,
although each file saves time when run alone.

## Why the suite barely moved

The suite runs three files at a time on four cores and uses about 2.6 cores
throughout (444 s user over 171 s wall), so it is close to CPU-bound. Saving
12 to 17 s of CPU should buy about 5 s of wall time, and it did. Starting the
longest file first (`node --test floor-priced.test.mjs <the rest>`) gave
167.4 s, only about 4 s better, so start order isn't the limit either. Large
wall-time gains here now need large CPU cuts. The tests that searched the
same thing twice are mostly gone.

## Not changed, ranked for the next run

1. starter.test.mjs: a file-local memo over `lowCarryOverRounds` /
   `lowCarryOverDoubleRounds` keyed on canonical arguments (defaults filled
   in) would hit 10 of 82 calls and save 4.8 s of 51 s. That's small, and
   several of those calls are each test's own subject, so not taken.
2. floor-priced "carryOverFloorPriced: seasons into the widest gap" (22.9 s):
   almost all of it is twelve 12-team tries used only as inputs (tries 6 to 11
   are used nowhere else in the file). Fewer tries, or a committed fixture,
   would change the test's inputs.
3. carryover "the carry-over guide's numbers" (16.2 s): `eval/carryover-real.mjs`
   `run()` plus a 16-team field run. Not profiled.
4. Longest-file-first ordering inside `run_venture_tests.py` (passing files to
   `node --test` in an order taken from per-file times): worth about 4 s here,
   so not worth a timing file per venture.
5. P063 and P064 are still owner-gated.
