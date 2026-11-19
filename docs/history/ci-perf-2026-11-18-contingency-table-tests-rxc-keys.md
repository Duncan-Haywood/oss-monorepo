# contingency-table-tests: r x c exact test, numeric merge keys (2026-11-18)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. The previous sweep's "not changed" list
(`ci-perf-2026-11-18-flux10-sniff-redos.md`, item 2) named
contingency-table-tests (13.0 s) as the largest unprofiled mid-tier suite, and
`suite_file_times.py` confirmed no earlier perf pass on record.

## Reading

- `suite_file_times.py contingency-table-tests` (one file at a time, 4 cores):
  `engine.test.mjs` 9.9 s, `cli.test.mjs` 4.1 s, `reference.test.mjs` 3.4 s,
  17.6 s summed.
- `node --test --test-reporter=spec engine.test.mjs`: one test,
  "a work limit returns null so the caller falls back to Monte Carlo", took
  **5,736 / 5,832 / 6,079 ms** (three runs). It runs `analyze` on a 4 x 5
  table with 476 observations.
- `fisherRxC` on that table, standalone: null after **5,332 to 5,840 ms**. It
  stops on the 5,000,000-step work limit, not the 6 s clock (`maxMs: 1e9`
  gives the same null). With no limit at all the network search ran out of
  memory, so the Monte Carlo fallback is the right answer here; the cost is
  the time spent getting to it, which a visitor's browser pays too
  (`index.html` imports `engine.mjs`).
- `node --cpu-prof`, self time: `fisherRxC` 3,348 ms, GC 1,048, `key` 1,033.
  Counting steps: 2,423,990 of the 5 million were **partitions** (column
  fills) and only 2,576,010 were past-value merges, about one past per node.
  So the per-partition overhead was the cost: a `slice().sort().join()` string
  key per fill, a second sort for the stored node, and a `toFixed(9)` string
  per merged past value.

## Change (`ventures/contingency-table-tests/engine.mjs`)

1. **Node key.** The remaining row margins are insertion-sorted once into a
   scratch array and packed into one number, base (largest margin + 1), when
   that is below 2^53 (else joined as text). The sorted copy is stored only
   when the node is new. A stage's map holds one stage's nodes, so the old
   `j:` prefix carried nothing; nodes are still visited in insertion order.
2. **Past-value key.** `pastKey(nv)` returns the integer that
   `nv.toFixed(9)` spells, from `nv * 1e9` rounded, and falls back to the
   string itself near a rounding tie (fraction within 1e-3 of one half) or for
   |nv| >= 1e6. Two values share a key exactly when their `toFixed(9)`
   strings match (`nv` is 0 or at most -log 2, so "-0.000000000" never
   arises).

Work counting is untouched, so every table hits the work limit at the same
step as before.

## Verification

- Old vs new `fisherRxC` on 6,000 random tables (2 to 5 rows, 2 to 6 columns,
  cells up to 24), half with random work limits from 1,000 to 51,000, the
  other half at 200,000: **JSON-identical results, 0 differences** (2,276 of
  them null, the rest exact p-values with their `work` counts).
- `pastKey` against `Math.round(Number(nv.toFixed(9)) * 1e9)` on 3 million
  sums of log-factorials and 9 million adversarial near-ties
  ((q - 0.5)/1e9 and neighbours up to 4 ulps away): **0 mismatches**.
- `python3 platform/ci/run_venture_tests.py contingency-table-tests`: ok,
  54 tests.

## After

| measure | before | after |
| --- | --- | --- |
| `fisherRxC` on the 4 x 5 table to its null, 3 runs | 5,332 to 5,840 ms | 3,122 to 3,277 ms |
| "a work limit returns null" test, 3 runs | 5,736 to 6,079 ms | 3,056 to 3,137 ms |
| `engine.test.mjs` alone | 9.9 s | 5.4 s |
| `cli.test.mjs` alone | 4.1 s | 2.9 s |
| `reference.test.mjs` alone | 3.4 s | 2.4 s |
| suite, files summed (`suite_file_times.py`) | 17.6 s | 11.0 s |

A side effect worth noting: before, the 5 million steps took 5.3 to 6.1 s
against a 6 s clock, so on a slower runner or phone the clock, not the work
limit, decided when to give up. Both give null and the same Monte Carlo
answer, but the work limit is now the one that binds on this machine.

## Not changed, ranked for the next run

1. **The past-value map** is now most of the remaining time: one `Map` per
   node keyed by large integers (heap numbers, not small integers) plus a
   `{ v, w }` object per entry. A sorted-array merge would cut allocation, but
   it must keep the first-seen `v`, the order `w` is summed in and the
   insertion order the final log-sum-exp reads, to stay bit-identical.
2. **A cheaper give-up.** Most of the 3 s goes to a search that cannot finish
   on this table. An up-front estimate of the network's size (the product of
   per-column partition counts, or the first stage's node count) could send
   hopeless tables straight to Monte Carlo, but that changes which tables get
   an exact answer: a product decision, not a speed-up.
3. `partitions()` materialises every column fill as an array before the loop;
   a callback walk would save the allocations (GC was ~1 s of the profile).
4. Other unprofiled mid-tier suites from the 11-18 sweep: stl-decomposition,
   scale-reliability, spc-control-charts, stable-matching.
