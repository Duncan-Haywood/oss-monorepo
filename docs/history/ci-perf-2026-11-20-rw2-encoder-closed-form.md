# photo-editing: the RW2 test encoder reads its step off the difference; test_rw2.py 7.3 s to 1.3 s (2026-11-20)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took step 3 (the slowest local
step a session waits on).

## Readings

- `suite_file_times.py league-schedule-generator --jobs 4`: 50 files, 513.3 s
  summed, 150.2 s wall. Slowest: `floor-priced.test.mjs` 84.1 s,
  `bowling.test.mjs` 56.1 s, `orient.test.mjs` 50.2 s. Alone,
  floor-priced's test 17 (`floorTable.balanced ...`) is 28.1 s, and all of it
  is the 30 `carryOverTry` searches it starts from (`leastBreaks`, the table
  and every `balanced` call together are under 0.1 s).
- `suite_file_times.py shed-designer --jobs 4`: 59 files, 425.2 s summed,
  111.2 s wall; `fuzz.test.mjs` 21.6 s alone, a flat profile (GC 2.2 s, then
  `buildFramed` 1.4 s, `jointSets`'s `from` 1.2 s).
- `suite_file_times.py ai-bookkeeper --jobs 4`: 350 files, 80.1 s summed,
  20.9 s wall; nothing over 2.2 s.

## Two negative results on the carry-over search (not landed)

`node --cpu-prof` of nine `carryOverTry` calls (12, 13 and 14 teams, tries
0 to 2, 19.0 s wall): `coeOf` 6.3 s self, 5.1 s of it from the first
annealing pass, whose cost is `coeOf` alone.

1. **`coeOf` round by round** (each round's row read once, every team's last
   opponent carried in an array, the limit bound per round): same digest,
   133.2 s to 134.8 s on the digest workload. The column walk was not the cost.
2. **An incremental count** (`coeTracker`: take the edges a move touches out of
   a persistent count table, put the new ones in, undo from a log on a refusal):
   same digest (`ef4fc2c49f96d353` over 124 searches: `carryOverTry` at 4 to 18
   teams, cyclic and with break weights, doubles, `bestCarryOverRounds` with
   capped, floor-priced and squeeze tries), but 19.0 s to 23.0 s on the nine
   tries and 133 s to 171 s on the digest. Instrumented: a team swap touches
   7.4 of 13 rounds on average (3.1 M of them), a partial round swap 6.8 teams,
   and a round swap every team, so a move rewrites about half the season's
   edges twice (out and back in), where the recount with the annealer's limit
   stops early on most refused moves. Do not retry this without a move set that
   touches far fewer rounds.

## Change (`ventures/photo-editing/tests/test_rw2.py`, test helpers only)

`ReadTests.test_every_shift_and_several_blocks` builds two 154 x 300 fields
and Panasonic-codes them with the test's own encoder, then checks both
decoders read them back. cProfile (21.2 s under the profiler): `_step` 56.6 M
calls, 7.5 s; `field`'s two list comprehensions 13.2 s; `_code` 5.2 s. The
decoder itself (`rw2._decode_python`) is 0.15 s.

`_step(pred, sh, j)` is `_step(pred, sh, 0) + (j << sh)`: `j` enters only
there. So:

- `_code` (the step that takes `pred` to `v`) reads `j` off `v - base`
  instead of trying `j` = 1..255.
- `field`'s `ok` (steps that stay within 12 bits) and `near` (steps that move
  at most 60) are runs of `j`, now `range`s from `_steps`. Same members in the
  same order; `random.choice` draws index `_randbelow(len(seq))` from either,
  and an empty `near` is still falsy, so the random stream is unchanged.

The decoder under test is not touched.

## Verification

- Digest of `field` and `encode` over seeds 1 to 7 at 36x10, 154x300, 28x40
  and 60x7 (the encoder's own assertion text where a size straddles a block)
  plus `_code` over a grid of 820 predictors x 4 shifts x 1,366 values:
  `d15e0b0ae0944aa4` before and after (108.1 s before, 3.9 s after).
- New `EncoderHelperTests.test_closed_forms_match_the_search` pins `_code`
  and `_steps` against the old 255-step search on 112 predictors x 4 shifts.
- `python3 platform/ci/run_venture_tests.py photo-editing`: in the run
  record's `notes`.

## Numbers

| | before | after |
|---|---:|---:|
| `python3 -m unittest tests.test_rw2` (this container, idle) | 7.25 s, 18 tests | 1.28 s, 19 tests |

## Not changed, ranked for the next run

1. **The carry-over search** behind every league file: see the negative
   results above. `teamSwapRounds` (2.1 s of 19 s) and `greedyBreaks` inside
   the `mixed` pass (2.5 s) are the next self-time entries.
2. `floor-priced.test.mjs` test 17 (28 s) is its 30 searches; the file
   already shares searches across its tests.
3. shed-designer `fuzz.test.mjs` (21.6 s), flat profile.
4. P063 and P064 remain owner-gated.
