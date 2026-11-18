# CI perf, 2026-11-12: league-schedule-generator divisions suite 79.5 s to 5.3 s

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/workflows/`, which CODEOWNERS holds for the owner. This run took item 1
of "Not changed" in
[`ci-perf-2026-11-11-league-schedule-coe-scratch.md`](ci-perf-2026-11-11-league-schedule-coe-scratch.md):
the divisions test "suggestFairnessWeight reads the league's own travel" (44 s,
the suite's longest), with the instruction to profile `buildDivisions` before
touching the test. No open PR touches `divisions.mjs`.

## Reading and profile (before)

The test body alone, as a script (both `suggestFairnessWeight` calls from the
test, the example league and the three-venue league with a travel table):
**50.1 s wall** (`time node prof.mjs`; 7.8 s for the two-venue call, 42.1 s for
the three-venue one). `node --cpu-prof`, self time summed per function:

| function | self |
|---|---|
| `clashCost` (`divisions.mjs`) | 22.9 s |
| `total`'s reduce callback | 7.7 s + 1.3 s |
| `makeTravelMin` closure (`sort().join()` key per call) | 6.9 s |
| `trip` | 2.6 s |
| `tallyOf` | 2.4 s |
| `buildDivisions` | 2.3 s |
| `unfair` | 1.3 s |
| GC | 1.2 s |

Every annealing move (6,000 + 40 per match with a travel table) rescored the
whole night with `total`, and `total` called `clashCost` per match, which looped
over every other match and built `"div/team"` strings to look up linked
partners: O(n^2) string work per move. `trip` and `unfair` were recomputed per
move too, although `lastVenue` and the venue tally only change after the night
is placed.

## Change (`ventures/league-schedule-generator/divisions.mjs`)

Per night, before the annealing loop, table:

- `W_TRIP * trip(m, c)` and `wFair * unfair(m, c)` for every (match, open cell);
- for each match, its linked matches as (index, number of linked team pairs);
- the clash cost for each pair of cells (1000 same time, 50 adjacent times at
  different venues, else 0).

`total` then adds `trip + fair + clash / 2` per match in the same order as
before, so every float sum is the same expression on the same values; the clash
part is a sum of integers, exact in any order. The RNG draws and the accept test
are untouched.

## Verification

- **Same answers.** A fingerprint script (scratch, not committed) hashed
  `JSON.stringify` of 128 `buildDivisions` results (both test leagues × seeds
  1, 2, 3, 7 × fairness weight 0, 1.5, 3, 10 × fairness on/off × split rounds
  on/off, errors included) plus one `suggestFairnessWeight` sweep. Before and
  after: `952f1996…71951ec`, identical. Wall time of that script: 60.8 s before,
  2.05 s after.
- The test workload script: 50.1 s to **1.85 s**, same printed results.
- `node --test --test-reporter=dot divisions.test.mjs`: **79.5 s to 5.3 s**,
  33/33 passing both times (same container, run back to back).
- Full venture suite (`node --test --test-reporter=dot *.test.mjs`, 4 cores):
  all passing, 128 s wall. The suite's wall time barely moves (130 s in the
  2026-11-11 note) because `best-of-k.test.mjs` is its critical path; the gain
  is about 74 s of CPU per run and a 1 s, not 42 s, "Suggest a weight" click.

## Not changed, ranked for the next run

1. `best-of-k.test.mjs` and `capped-breaks.test.mjs` are now the suite's
   longest files (carry-over annealing, already worked once on 2026-11-11);
   the O(n R) recount per move (`coeOf`, `hostBreaks`) is the next lever there.
2. The annealing loop still rescores the whole night per move (O(n) now, was
   O(n^2)); an incremental delta would be faster again but changes float
   rounding, so it would need tolerance-aware equivalence, not a hash.
3. `free()` rebuilds the spare-cell list every move; cheap at these sizes.
4. P063 and P064 remain owner-gated.
