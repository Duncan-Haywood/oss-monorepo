# changepoint-detector: the stale-feed fit stops re-asking its own questions (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run went to the slowest local suites
(prompt item 3).

## Reading

Each suite run alone on this 4-core container, `node --test --test-reporter=tap`,
per-test `duration_ms` summed from the TAP:

| suite | wall | note |
| --- | --- | --- |
| einvoice-preflight | 9.3 s (2,308 tests) | `venture_suite_times.json` says 40.4 s, but that was taken with 4 suites in parallel. Nothing to win. |
| ai-bookkeeper | 23.2 s (3,448 tests) | start-up bound, as the 11-14 note says |
| changepoint-detector | 188.7 s wall, 519 s user (1,007 tests) | chosen |

## Profile

The slowest changepoint test outside the engine files was
`update-rate.test.mjs`'s "a stale feed that was fixed" (20 series of 300 steps):
**13.1 s** alone. `node --cpu-prof`, self time:
`roundedWalkLogLik` 6.27 s, `roundedWalkLogLikMarkov` 6.09 s, `tKernel` 0.35 s.
The update-rate search itself (`partitionRates`, `xlx`) was under 0.03 s.

The likelihood filter is the stale-feed test's cost, and it's already tight (one
convolution per step). So the question was how often it runs. Counting calls in
that one test:

- `roundedWalkLogLik`: **10,640 calls, 3,040 distinct** argument sets;
- `roundedWalkLogLikMarkov`: **13,680 calls, 4,560 distinct**.

The reason: `staleLRMarkovFit` (and the round-three and round-four fits) fit by
coordinate ascent, three rounds of golden-section searches. When a round moves
neither `s` nor `p` (as usually happens when `p` stays at 0 on a rounded walk), the
next round's golden searches probe exactly the same points again. The
2026-11-16 memo is one level up: it catches the same *stretch* asked twice, not
the same point inside one fit.

## Change

1. `rounded-walk.mjs`: each fit wraps its `L` / `LM` closures in a per-fit
   `Map` keyed on the arguments' string form (`${s},${p}`). A JS number's
   string form round-trips exactly, so two keys match only for the same
   doubles. The filter is a pure function of (ticks, s, p, G, nu), so a cached
   answer is the answer. This applies to `staleLikelihoodRatio`, `staleLRHeavy`
   and `staleLRMarkovFit`.
2. `update-rate.mjs` `partitionRates` (and `gridPartition`): the PELT pruning
   pass recomputed `F[s] + segmentCost(s, t)` for every candidate the search
   had just scored. It now keeps that sum from the search, so it's the same
   double computed once. The candidate list is a reused `Int32Array`. On the
   `--closed ... --suggest` watch CLI call (closed-days.test.mjs) this took
   6.15 s → 5.41 s; most of what's left there is `bocpd`.

## Verification

- `partitionRates` old vs new on 18,000 random 0/1 inputs (n 40 to 2,540, so
  both the exact path and the grid path above 1,500; bernoulli and markov;
  mult 0.5/1/2; minSegment 5/20): `JSON.stringify` of every result identical
  (84,602 cuts in all).
- `staleLRMarkov`, `staleLikelihoodRatio` and the heavy variant old vs new on
  25 random rounded/carried walks (31 to 120 steps, random sd, stale and stay
  probabilities): 59 results identical, every field (lr, s, p, nu, l0, l1, lM).
- The 27 test files that import update-rate or the stale tests, all at once
  (`node --test` default concurrency, 4 cores), old files vs new:
  **32.6 s → 17.1 s wall, 83.6 s → 50.6 s user CPU**, 141 of 141 pass both times.
  "a stale feed that was fixed" 13.1 s → 4.7 s; "Venezuela exchange controls"
  6.6 s → no longer in the top six.
- `python3 platform/ci/run_venture_tests.py changepoint-detector`: see the run
  record's `notes`.

## Not changed, ranked for the next run

1. **`bocpd` in watch replays** (1.29 s self plus `logAdd` 0.67 s in the 5.4 s
   `--suggest` call). `--suggest` replays the history once per setting. Check
   whether the three settings share detector runs before touching the loop.
2. **The remaining stale-feed calls are all distinct.** A further cut needs fewer
   golden probes (an output change) or a cheaper filter: the convolution is
   O(width x K) per step, and an FFT would change the float sums.
3. **engine / null195 files** (16 to 17 s each): the 11-17 list's item 3 (two
   evals repeat 120 identical `analyze` calls) still stands.
4. P063 and P064 remain owner-gated.
