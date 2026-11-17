# job-shop-scheduler: a capped exact search before tabu on small shops (2026-11-14)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took the newest venture on `main`
(PR #15909, landed the same day) and timed its suite.

## Reading

`node --test *.test.mjs` in `ventures/job-shop-scheduler`, this container,
Node 22.23.4: **11.45 s wall** (`time`), 23 tests. Two tests took 10.4 s of
it: "jobs that visit a machine twice" 5.5 s (60 shops) and "brute force
agrees" 4.9 s (150 shops).

## Profile

`node --cpu-prof engine.test.mjs`, self time summed per function:
`tabuSearch` 3.8 s, `evaluate` 3.7 s, `criticalPath` 1.4 s, GC 1.0 s,
`blocks` 0.6 s. The test's own brute force was 0.13 s.

So the time was the solver, not the test. `solve()` on a shop of up to 64
operations ran tabu search first, until the lower bound was met or a fixed
300 ms passed, and only then the exact branch and bound. On a 3x3 shop the
lower bound is often not tight, so tabu spent its full 300 ms on a problem the
exact search settles in a few dozen nodes. The page's own example showed it:
**305 ms**, 235,904 tabu moves, then 260 exact-search nodes to prove 38.

Nodes the uncapped branch and bound needs, from the dispatch-rule schedule,
on 300 random shops of 2 to 7 jobs on 2 to 6 machines (195 left unproved by
the bound): p50 61, p90 1,860, p99 14,196, max 20,833.

## Change

`engine.mjs` `solve()`: on small shops (N <= 64) not already proved, run
`branchAndBound` with a 2,000-node cap first (`QUICK_NODES`). If it finishes,
the answer is proved by exhaustive search and tabu never runs. If not, the old
path runs unchanged: tabu until `t0 + min(0.4 * ms, 300)`, then the uncapped search
to the deadline. The quick search reads no random numbers, so tabu sees the
same seed stream. `nodes` now sums both searches; a caller's `nodes` limit
covers both.

A 20,000-node cap was tried first and dropped: a failed attempt on an 8x8 shop
cost 130 to 170 ms, half the tabu window. At 2,000 nodes a failed attempt
costs 13 to 38 ms (five 8x8 shops, `performance.now()`).

## Verification

- Old engine (copied aside) against new on the 300 random shops above, same
  seeds: **makespan and `optimal` identical on 300 of 300**; 300 proved by
  both; total solve time 47.2 s to 5.8 s.
- JSPLIB instances that take the small path (ft06, la01 to la05,
  `bench/jsplib.mjs --ms 4000 --only ...`): identical rows, all six proved.
  Larger instances never reach the changed code, so `bench/jsplib.md` stands.
- New test "small shops the capped exact search settles skip the tabu run"
  pins the order (`tabuIterations === 0` when the proof is exhaustive) and
  checks each answer against the brute force.
- `python3 platform/ci/run_venture_tests.py job-shop-scheduler`: ok.

## After

Suite **11.45 s to 0.56 s** wall (three runs 0.56 to 0.57 s), 24 tests. The
page's example: **305 ms to 9 ms** (0 tabu moves, 427 nodes, same 38).

## Not changed, ranked

1. Medium shops (65+ operations) still run tabu for the whole limit even when
   it stalls; a stall-based stop would free the tab sooner but changes
   results on the benchmark, so it needs a bench run to judge.
2. `evaluate` rebuilds the full topological order each move; an incremental
   update is the classic speed-up for tabu on large shops (bench time-bound,
   not test-bound).
