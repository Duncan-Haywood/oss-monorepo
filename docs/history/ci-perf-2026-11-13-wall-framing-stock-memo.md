# Venture suites: wall-framing-takeoff keeps recent cutting-stock answers (2026-11-13)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner. The previous perf run today
(`ci-perf-2026-11-13-xls-row-padding.md`) ranked wall-framing-takeoff second in
its "not changed" list: 163 s in the 4-at-once sweep, no perf pass yet, and the
advice "profile `cli-sweep` and `mutation-sweep` before anything else".

## Reading

`node --test --test-reporter=spec <file>`, this container (4 cores):

| file | time | note |
|---|---:|---|
| `mutation-sweep.test.mjs` | 10.2 s | one test, in-process |
| `cli-sweep.test.mjs` | 5.6 s | already parallelised to 4 children earlier today; the rest is Node start-ups |

So `mutation-sweep` was the target. It sets each of the sample plan's 242 leaves
to each of 10 hostile values (2,420 plans), and runs `takeoff` on the 784 that
validate. A bench replaying the same loop: validation 84 ms in total, `takeoff`
8.8 s (11 ms each).

## Profile

`node --cpu-prof` on that bench, self time: `boundedKnapsackMulti` 4.9 s,
`lpDualSettle` 1.2 s, `columnGeneration` 0.5 s, `lpAddRow` 0.3 s, `exactStock`
0.3 s. About 85% of the time is the cutting-stock solver (column generation with
a knapsack pricing step), which has already had several algorithm passes (gcd
scaling, a shared scratch buffer, Farley's stop).

The work was not slow, it was repeated: almost every mutation (a paint coat, a
drywall field, a stock price of another size) leaves most lumber sizes' cut lists
exactly as they were, and each `takeoff` solved every size again from scratch.

## Change

`ventures/wall-framing-takeoff/engine.mjs`: `optimizeStock` is split into the
part that builds the integer problem and maps the answer back (labels, refs,
lengths, offcuts) and `solveStock`, which only reads each item's width `w` and
demand `d` and each board's `cap` and `price`. Its answer (board index and item
indices per bar, the method, the exact cost, the LP bound, the two heuristic
costs) is a pure function of those numbers, so `solveStockMemo` keeps the last
128 answers in a Map keyed on them (least recently used goes first). Entries are
frozen and the caller builds a fresh result object every time, so a caller that
edits a result cannot change the next one.

`stock-memo.test.mjs` pins it: a repeated problem returns the cold answer byte
for byte; editing a returned result (pushing a cut, emptying `bars`, changing
`cost`) does not leak into the next call; the same widths with new labels and
refs map the new ones on; a changed price is a different problem.

## Verification

A hash of every output (the `takeoff` JSON, the refusal list, or the error
message) of the 2,420 mutated plans, run twice per process so the second pass is
served from the memo: old engine `dbe82b5cd562cadc`, new engine
`dbe82b5cd562cadc`, two runs each.

## After

| measure | before | after | how |
|---|---:|---:|---|
| bench, 2,420 plans x 2 passes, same hash | 18.6 / 18.0 s | 4.0 / 4.1 s | alternating runs, scratch script |
| `mutation-sweep.test.mjs` | 10.2 s | 2.6 s | `node --test --test-reporter=dot <file>`, wall clock |
| wall-framing-takeoff suite alone | 29 s | 25 / 26 s | `run_venture_tests.py wall-framing-takeoff`, nothing else running |
| `takeoff(samplePlan())`, repeated, median of 21 | 12.7 ms | 2.8 ms | in one process, after warm-up |

One discarded reading: a first "before" of 50 s overlapped with an "after" run
I had started in the background, so both were contended; the numbers above were
taken one after the other.

The page imports the same `engine.mjs` and recomputes on every edit, so an edit
that leaves the lumber alone (or touches only one size) now skips the solve for
the unchanged sizes. The memo holds at most 128 small answers.

## Not changed, ranked for the next run

1. **`cli-sweep.test.mjs` (5.6 s)** is 144 child processes, each a Node
   start-up plus a cold `takeoff` (no memo crosses processes). Importing
   `cli.mjs`'s main in-process would be faster but stops testing the real CLI
   entry; not worth it.
2. The solver itself: `boundedKnapsackMulti` is a textbook 0/1 binary-split DP.
   A cold whole-house order still pays it in full. Profile a whole-house plan
   (not the sample) before touching it.
3. The other wall-framing files are under 5 s each; most of the suite is ~143
   Node start-ups.
4. From the earlier list: the top four suites (changepoint-detector,
   shift-roster-builder, shed-designer, league-schedule-generator) remain most
   of the sweep; P063 and P064 remain owner-gated.
