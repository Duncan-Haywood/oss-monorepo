# dining-room-table-mix-optimizer: a free count per seat size and a shorter waiting-line pass; 2.2 s to 0.4 s at 600 parties (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. The tutoring run earlier today
(`ci-perf-2026-11-19-tutoring-schedule-bound.md`) timed this suite and left it
"next in line": `calc.test.mjs` 2.4 s for 11 tests, no earlier perf pass on
record. 2.2 s of that was one test calling `analyze` at `MAX_PARTIES` (600),
which is also what a visitor waits for after pressing the button.

## Reading

Scratch bench: `analyze(EXAMPLE_TABLES, EXAMPLE_PARTIES, {...EXAMPLE_SHARED,
partiesPerService, combine})`, one run each, Node 22, same container:

| parties, combine | before | after |
|---|---:|---:|
| 62 (the page's example), yes | 313 ms | 173 ms |
| 62, no | 170 ms | 99 ms |
| 300, yes | 1,401 ms | 301 ms |
| 300, no | 862 ms | 266 ms |
| 600 (the cap), yes | 2,170 ms | 398 ms |
| 600, no | 1,577 ms | 380 ms |

Every row recommends the same mix and the same gain as before.

`node --cpu-prof`, self time, 600 parties: `runService` 1,341 ms (its inlined
`pick`), `seat` 611 ms, `drain` 168 ms, GC 97 ms, nothing else over 30 ms.
The search scores about 150 mixes on 60 services each, then about 10 more on
300 services; the two search starts never score the same mix (counted: 0 to 1
repeats in six settings), so a shared memo would buy nothing.

The cost was the simulator's table picker. A queued party was retried on every
departure; each failed retry scanned every table, then every pair of tables
(about 136 pairs for the example's 17 tables) to look for two to push together.

## Change (`ventures/dining-room-table-mix-optimizer/calc.mjs`, `runService`)

1. **Free count per distinct seat size.** Only `seats` is ever read from a
   table, so two tables with the same seats are interchangeable. `pick` walks
   at most 6 sizes for a single table and 21 size pairs for a pushed-together
   pair. Tie-break kept: the old scan over tables sorted by seats took the
   first pair with the fewest seats, which is the pair with the smaller first
   table, and the new loop takes the same.
2. **Departures inserted by binary search** for the first later time, so
   equal times keep their insertion order as before.
3. **Waiting line.** Deadlines are arrival + patience and the line stays in
   arrival order, so the parties who gave up form a prefix and are dropped in
   one splice. A pick that fails for size s fails for every larger party until
   something is freed, so those are skipped; once the smallest party size
   fails the pass stops.

## Verification

- New `simulator-pinned.test.mjs`: the old `runService` copied verbatim.
  2,400 random runs (1 to 5 table types with repeated seat sizes, shuffled
  table order, 0 to 40 minutes of patience, both combine settings; 300+ of
  them with someone waiting) and 400 runs with whole-minute arrivals and
  stays (simultaneous departures and arrivals) must deep-equal it field for
  field.
- Mutation: pair tie-break `<` to `<=` fails 2 tests; departure ties `<=` to
  `<` fails 1; early exit after size 2 fails 2; dropping the "two tables of
  the same size" check fails 2; deadline `<` to `<=` fails 1. The two mutants
  that survive (`>=` on the early exit, retrying equal sizes) change no
  output by construction.
- Scratch lockstep of the old and new `calc.mjs`: 120 random `analyze` inputs
  (bad rows, odd seats, caps, 100 to 1,000 sq ft, 5 to 205 parties), 109 of
  which ran the search: all 120 results `isDeepStrictEqual`.
- `node --test *.test.mjs` in the venture: 26 pass.
  `suite_file_times.py dining-room-table-mix-optimizer --jobs 1`: 1.8 s summed
  (`calc.test.mjs` 2.4 s to 1.2 s; the pinned file adds 0.4 s).

## Not changed, ranked

1. **The 60-service search set.** The search scores about 150 mixes; most
   neighbours of a mix share all but one table, and a bound on guests (seats
   times window over the shortest stay) could skip mixes that cannot beat the
   incumbent, as the tutoring bound does. Worth a look only if the cap rises.
2. **`drawServices`** is 30 ms at 600 parties: below noise for a visitor.
3. **cheap-meal-plan-optimizer** (3.3 s, `calc.test.mjs` 1.9 s for 40 tests):
   timed by the tutoring run, still not profiled.
