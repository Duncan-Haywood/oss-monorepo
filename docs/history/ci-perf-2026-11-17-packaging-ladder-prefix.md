# saas-feature-packaging-optimizer: allocation-free price ladder (2026-11-17)

**Reading.** `run_venture_tests.py --times 30` (file timed 2026-11-16 at
168393c46): saas-feature-packaging-optimizer at 13.4 s, tied 16th, with no
earlier perf pass. One test, "the search stays fast at the largest size"
(500 respondents, 8 features, 3 plans), took 9.2 of the suite's 12.1 s.

**Profile.** `node --cpu-prof` over a bench of three 500-row surveys
(seeds 42, 7, 99): 37.8 s, of which 28.4 s self time in the ladder's
recursive `go` (with `evaluate` and `choose` inlined into it) and 8.0 s in
`refine`. Every grid point built a choice array, a buyers array and a result
object, then compared all k plans for every respondent.

**Change** (`calc.mjs`).
1. `profitOf` / `flatten`: profit with the same choice rule and the same
   summation order as `evaluate`, on flat typed arrays, no allocation. `ladder`
   and `refine` use it to test points and call `evaluate` only for a winner.
2. The ladder keeps, per depth, each respondent's best plan among the prices
   fixed so far (same order, same tie rule), so the innermost loop compares one
   plan per respondent instead of k and sums buyers in the same pass.

**Verification.** Output is bit-identical: sha256 of `JSON.stringify(analyze(...))`
for the three bench surveys (041aa308...) and for the example plus 30 random
surveys with fractional values and weights, 2 and 3 plans, locked features
(5be1a7b1...), equal for the old (`git show HEAD:calc.mjs`) and new code. New
test pins the quick ladder to a brute force over the same grid with plain
`evaluate`. Suite: 27 pass.

| measure | before | after |
|---|---:|---:|
| bench, three 500-row surveys | 37.8 s | 18.6 s |
| largest-size test | 9.2 s | ~4.5 s |
| `node --test` suite (idle core) | 12.1 s | 6.4 s |

**Not changed, ranked.**
1. `refine` (4.4 s of the 18.6): inserting plan t into the middle of the
   choice order means the later plans' tie-breaks depend on it, so a
   prefix/suffix split is not a one-liner; worth it only if this suite grows.
2. A threshold sweep over the last plan's sorted candidates: the tie branch
   is not monotone in price and buyer sums would change order (float
   identity), so it was left.
3. The browser page runs the same `analyze`, so users waiting on the largest
   survey get the same 2x; no separate page work needed.
