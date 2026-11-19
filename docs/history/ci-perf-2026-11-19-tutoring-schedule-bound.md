# tutoring-group-schedule-optimizer: a profit bound skips slot sets that cannot win; 40 s to 0.6 s at 30 slots (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. The top suites in `venture_suite_times.json`
(league, shift-roster, shed, changepoint, ai-bookkeeper) have all had several
passes. This run timed three suites no `docs/history/ci-perf-*.md` names yet
(`suite_file_times.py <slug> --jobs 1`): tutoring-group-schedule-optimizer
3.1 s, cheap-meal-plan-optimizer 3.3 s, dining-room-table-mix-optimizer
2.5 s. Tutoring spent 3.0 s on 12 tests in `calc.test.mjs`, 2.4 s of it in
one local-search test, so it went first. Then it measured what a visitor
waits for when they press "Build the timetable".

## Reading

A scratch bench, `analyze(slots, students)` on seeded random instances
(capacity 1 to 8, each student free for about a quarter of the slots), two
runs each, Node 22:

| instance | before | after |
|---|---:|---:|
| the page's sample (9 slots, 34 students, exact) | 72 ms | 7 ms |
| 20 slots, 120 students (local search) | 4,197 ms | 157 ms |
| 30 slots, 250 students (the most the tool accepts) | 40,000 ms | 634 ms |

`node --cpu-prof`, self time, 20-slot case: `seat` (the min-cost flow)
3,833 ms of 4.3 s, GC 319 ms, nothing else over 90 ms. Two things fed it:

1. `seat` built its graph as arrays of arrays and allocated fresh `dist`,
   `prevE`, `inQ` and a growing queue for every augmenting path.
2. `analyze` priced the "run every slot, minimum 1" baseline by calling
   `search(relaxed, ...)`: a full exhaustive or local search over the relaxed
   slots, of which it read one mask. That doubled the work of every analysis.
3. The search solved the flow for every mask it compared, including masks
   that could not possibly beat the incumbent.

## Change (`ventures/tutoring-group-schedule-optimizer/calc.mjs`)

- `seat`: edges in typed arrays, compressed adjacency in the same per-node
  insertion order, buffers allocated once per call, and the FIFO queue as a
  ring of N slots (a node is queued at most once at a time, so the order is
  the same as the growing array). Same augmenting paths, same seating. 4.3x
  on the 20-slot case on its own (4,197 to 971 ms).
- The baseline is one `seat` call with every relaxed slot open, which is what
  `evalMask(all)` returned from the old search.
- `bound(mask)`: students who can reach an open slot, dearest first, capped by
  the open seats, all paying, minus the run cost; `-Infinity` when fewer such
  students exist than the open minimums add up to. A real seating can only do
  worse, so `profit(mask) <= bound(mask)`. `beats(mask, ref)` solves the flow
  only when the bound (plus 1e-7 relative slack for float summation order)
  exceeds `ref`. Every comparison in the exhaustive loop and in `climb` is
  `profit > ref + EPS`, so a mask it skips was never going to be chosen: the
  search walks the same path and returns the same `best`. Skipped masks are
  not cached; `analyze` still solves them when it reads them (the per-slot
  flip column), and `seat` is a pure function of the mask.

## Verification

- New `search-pinned.test.mjs`: `oldSeat` is the earlier solver copied
  verbatim; `evalMask` deep-equals it on 1,000+ masks over 80 random
  instances (fractional prices and costs, unknown slots, 0 to 39 students).
  `oldBest` re-runs the earlier unpruned exhaustive and climb loops on the
  same `evalMask` and must pick the same `best` on 24 instances (6 to 13
  slots, default and custom seeds). A third test pins the baseline against a
  relaxed `evalMask(all)`.
- Mutation: with the bound lowered by 15 (so it can skip winners), 3 tests
  fail, the pinned one among them.
- Scratch lockstep of the old and new `calc.mjs`: 1,500 random instances
  (1 to 14 slots, 0 to 49 students, duplicate and unknown availability,
  custom `exactLimit`/`seed`/`restarts`): every `analyze` result
  `isDeepStrictEqual`, error messages included, plus `search().best` and
  68,452 seatings compared mask by mask. A second lockstep on 60 large
  instances (11 to 24 slots, 20 to 139 students): all 60 `analyze` results
  and `search().best` equal, 3,840 seatings compared.
- `node --test` in the venture: 32 tests pass.
  `suite_file_times.py tutoring-group-schedule-optimizer --jobs 1`: 3.1 s
  before, 1.9 s after with the new file (calc.test.mjs 3.0 to 0.3 s; the
  pinned file is 1.4 s because it solves every mask the old way on purpose).

## Not changed, ranked

1. **Dijkstra with potentials in `seat`.** The graph starts as a DAG, so
   potentials are cheap, but Dijkstra can pick a different shortest path among
   ties and so a different (equally profitable) seating. It would change what
   the page shows; only worth it with a tie-break that reproduces SPFA's.
2. **Warm-starting the flow between neighbouring masks.** `climb` flips one
   or two slots at a time, so most of the previous flow is still valid. Same
   tie problem as 1, and the bound already skips most solves.
3. **cheap-meal-plan-optimizer** (3.3 s, `calc.test.mjs` 1.9 s for 40 tests)
   and **dining-room-table-mix-optimizer** (`calc.test.mjs` 2.4 s for 11
   tests): timed, not profiled. Next in line for a run like this one.
