# CI perf, 2026-11-12: shift-roster-builder checks a move before building it

Perf track, item 3 ("a venture's test suite"). Both open perf backlog items (P063,
P064) touch `.github/workflows/` and wait for the owner. This pass takes item 1 of the
"not changed" list in `ci-perf-2026-11-12-shift-roster-plateau-floor.md`:
`insertSorted` + `validList`.

## Reading

Suites of the five ventures most touched in the last 40 commits on `main`, timed one after
another on this 4-core container (`node --test` over every `*.test.mjs`, wall clock):
changepoint-detector 166 s, shift-roster-builder 156 s, league-schedule-generator 85 s,
einvoice-preflight 6.5 s. changepoint-detector and league-schedule-generator each had
two or more passes on 2026-11-11 and 2026-11-12, and their notes say the rest is spread
thin; shift-roster-builder's note named one concrete lever.

## Profile

`node --cpu-prof` over five `buildRoster(sampleStaff, sampleShifts, {})` builds in one
process, self time summed per function: `coverPass` 32.5%, `insertSorted` 21.3%,
`validList` 18.4%, `dfs` 7.4%, garbage collection 5.9%.

A counting build (one café sample week, 7 people, 32 shifts) made **7.7 million**
"is this list valid with shift i added" checks, average list length 4.7, and **1 in 8**
was valid. Every check first allocated the candidate list (`insertSorted`), most only
to be thrown away.

## Change (`ventures/shift-roster-builder/calc.mjs`)

1. **`validWith(ctx, p, list, i, skip)`**: the answer of
   `validList(ctx, p, insertSorted(ctx, list without skip, i))` without building the
   list. It walks the merged order (shift i goes before the first shift it does not
   start after, ties by index: exactly where `insertSorted` puts it) and runs
   `validList`'s steps on it, stopping at the first rest or overlap clash. An unordered
   list, or a day outside 0-30, takes the original path. Start, end and day come from
   typed arrays built once per ctx (`slotTable`).
2. The search loops (`anneal`, `ejectPass`, `coverPass`, `polishPay`, the open-shift
   `dfs`, `heldMost`, `coverableHours` and the other single-insert sites) check with
   `validWith` first and build the new list only for a move they keep. RNG draws happen
   in the same order, so the walk is the same walk.
3. **`coverPass` keeps its answers.** The plateau walk asks "can q take shift i?" (and
   "can q take i in place of j?") again and again while q's list stays the same. Each
   answer is kept with a stamp of q's list version and dropped when q's list changes.
   The pair cache is allocated only while people × shifts² is at most 4M entries.

Measured on its own, step 1 saved little: allocation was not the cost. The check
itself is. With the profile showing `validWith` at 44% after step 1, the cut came from
asking fewer questions (step 3).

## Verification

- **Same answers:** `eval/same-answers.mjs` (the harness from the plateau-floor pass)
  against `main`'s `calc.mjs`: the café sample, the sample with balance 50, the sample
  plus a spare, and 80 seeded random weeks across five option sets (59 leave hours open).
  The whole `buildRoster` result, as JSON minus timings: **83 of 83 identical.**
- New `valid-with.test.mjs`: 120,000 random moves, holding `validWith` to
  `validList(insertSorted(...))` with and without a skip (more than a quarter of the
  moves have one), unordered lists (one in four), a case in ten with every day moved
  past 30 (the slow path), and start/end minutes of :00, :01, :30 and :59, so some gaps
  fall one minute either side of the rest limit. Mutation check: dropping the skip, or
  moving the rest limit by one minute, fails it. (Before the minute offsets were added,
  the one-minute mutant survived, because every random shift was on the hour.) Putting
  tied starts in the wrong order survives, and that is correct: two shifts that start
  at the same minute clash in either order, so the answer cannot change.
- `run_venture_tests.py shift-roster-builder ics-calendar-check` (ics-calendar-check
  imports `calc.mjs`): both pass.

## Numbers (same method before and after, quiet container)

| measure | before | after |
|---|---:|---:|
| `buildRoster` on the café sample, 5 runs × 3 processes | 1.11-1.34 s | 0.92-1.11 s |
| 83-week equivalence set, total solver time | 32.1 s | 28.0 s |
| suite, `run_venture_tests.py shift-roster-builder` (one run each, back to back) | 158.5 s | 133.9 s |

## Not changed, ranked for the next run

1. `coverPass` still misses its cache whenever a plateau move is taken (two people's
   lists change, and the walk takes many). An incremental check that uses "q's list
   is already valid" would make each miss O(log n), but that precondition needs a proof
   for every caller; not done.
2. The open-shift `dfs` (second-largest caller of `validWith` now) puts a list back
   after each branch, so its answers could be kept by list identity the same way.
3. `coverPass`'s own loop is now mostly RNG draws and the `elig` reads: little is left
   without changing the walk, which would change rosters.
4. P063 and P064 remain owner-gated.
