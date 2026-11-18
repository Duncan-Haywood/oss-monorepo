# Support-agent benchmark test: 6.1 s to 3.0 s, bit-identical (perf track, 2026-11-18)

## Reading

The previous perf run (`ci-perf-2026-11-18-lineup-cost-scratch.md`, "Not changed" item 3)
listed `ventures/support-agent/eval.test.mjs` at 5.8 s as the largest unprofiled
mid-tier suite. Timed here (`node --test eval.test.mjs`, three runs, wall clock):
6105, 5956, 6103 ms. One test is all of it: "BANKING77 held-out test", which runs the
benchmark's `run(0)` and `run(40)` (fit the confidence model on 3,080 dev questions,
evaluate dev and test, 2,160 questions each).

`node --cpu-prof` on `run(0)` + `run(40)` (self time, ms): `fitLogistic` 666,
`search` 660 + 528 (its posting loop) + 288 (the final map/sort), `distance` 463,
`normalise` 426, `evaluate`'s per-bar row builder 402, `tokens` 353, `expand` 301,
GC 224.

## What the time was

1. **`expand` re-did fuzzy matching** for every unknown query word on every call:
   a scan of the whole vocabulary with an edit distance each. The same few hundred
   words recur thousands of times across one evaluation.
2. **`queryOf` normalised the same question about ten times per decision**
   (example votes, ranking, coverage of each of five candidates, features).
3. **`evaluate` built every row at every bar.** The sweep rebuilt 2,160 row objects
   (with spread copies and `reasons.map`) for each of ~1,000 distinct confidence
   values, only to count outcomes.
4. **`search` summed scores in Maps and sorted every match** (up to ~3,000 for the
   past-question index) to return the top 5 or 40, recomputing each term's BM25
   weights per query.

## Change

- `search.mjs` (shared byte-for-byte with `ventures/help-keeper`, enforced by
  `support-agent/agent.test.mjs`, so both copies changed): `expand` results cached
  per index (cleared at 20,000 entries so a long-running server stays bounded);
  each term's `idf * norm` per passage cached per index (bounded by the vocabulary);
  scores summed in `Float64Array`s by passage number; top-`limit` insertion
  selection under the same comparator instead of a full sort.
- `agent.mjs`: `queryOf` cached per agent (cleared at 2,000 questions).
- `eval.mjs`: each case's outcome above and below its confidence is worked out once;
  the sweep counts them per bar. `rows` for the chosen bar is still built the old way.

Why it is the same answer: every float sum adds the same products in the same order
(`idf * norm * weight` was already `(idf * norm) * weight`); the ranking comparator
(score, then id) is a total order since ids are unique, so top-k selection returns
what sort-then-slice did; the lazy `decide` calls in `evaluate` happened for every
answered case anyway (the sweep always includes bar 1.001).

Tried and reverted: a flat `Float64Array` design matrix in `fitLogistic` (no gain:
the loop is bound by 6 M `Math.exp` calls per fit, not array access).

## Verification

- `run(0)`, `run(10)`, `run(40)` plus two full `evaluate` reports (rows and sweep)
  serialised to JSON before and after: 1,156,994 bytes, `cmp` identical
  (md5 `ac8a06588a38fc3544ba54d329d35c27` both).
- New `support-agent/search.test.mjs`: the old search kept as a reference must give
  `deepEqual` results on 307 queries × 2 indexes × 2 passes (cold and cached) × limits
  0, 1, 3, 10, 40, 2.5, Infinity; and every sweep entry must equal the summary of
  `evaluate` at that bar (the old row-building path). A seeded mutation of the score
  formula fails it.
- support-agent: 57 of 57 tests pass (plus the new two); help-keeper 46 of 46.

## Numbers

| | before (ms) | after (ms) |
|---|---|---|
| `node --test eval.test.mjs` (3 runs) | 6105, 5956, 6103 | 3048, 2813, 3022 |
| `node --test *.test.mjs`, support-agent (3 runs) | 6013, 6332, 6111 | 3237, 3332, 3315 |
| benchmark `run(0,10,40)` (3 runs) | 8378, 8317, 8184 | 4361, 4274, 4538 |
| help-keeper `*.test.mjs` (3 runs) | 260, 265, 277 | 256, 263, 267 |

## Not changed, ranked for the next run

1. **`fitLogistic`** (~0.7 s of the remaining 3 s): 3,000 full-batch gradient steps.
   Fewer iterations or a Newton step changes the fitted weights, which are pinned in
   `agent.mjs` `DEFAULT_CALIBRATION*`; a product decision plus a refit, not a perf one.
2. **`tokens` / `normalise`** (~0.6 s): regex-heavy normalisation of passages and
   sentences; `articleTerms` is already cached, `extract` is not on this path.
3. Other mid-tier suites still unprofiled: garmin-world-traveler-watchface
   `citydata.test.mjs` 4.6 s, s3-storage-class-savings `engine.test.mjs` 4.2 s.
