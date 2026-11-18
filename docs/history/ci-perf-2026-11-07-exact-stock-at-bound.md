# Perf: skip the exact stock search when the cover already meets the LP bound (2026-11-07)

**Reading.** `ci_profile.py --runs 600`: "node --test in each touched venture"
is 42 of 475 job-minutes. Per-file timing of wall-framing-takeoff (4 parallel,
this sandbox): `engine.test.mjs` 96 s, the next file 46 s. Three seeded-wall
tests in it take 24-31 s each.

**Profile.** `node --cpu-prof` on the 200-wall horizontal test: 29.4 of ~30 s
self time in `exactStock` (engine.mjs), the dynamic program over piece-count
vectors, called from `optimizeStock` via `takeoff`. Everything else under 1 s.

**Change.** `optimizeStock` ran `exactStock` on every group. It can only
replace the cover when it is cheaper than the best heuristic cover, and the LP
bound is a floor on any order, so when `min(lpCost, ffdCost)` already meets it
(ceiling for whole-number prices) the search is skipped.

**Verification.** 300 random two-wall plans through `takeoff`, old engine vs
new, JSON compared with numbers rounded to 1e-9: 0 differences. Unrounded, 71
plans differ only in the last digits of `bound` (709.0400000000003 vs
709.0400000000001): the skipped case reports the LP bound instead of the
DP's re-summed cost. `engine.test.mjs`: 96 s -> 72 s wall, 74/74 pass; whole wall-framing-takeoff suite 1026/1026 pass.
Single runs, one machine.

**Not changed, ranked.** (1) The remaining 72 s of engine.test.mjs: profile
again, the DP still runs when the heuristic misses the bound; a faster DP
(skip dominated patterns) must keep tie-breaking. (2) sheathing-fuzz 46 s,
engine-fuzz 34 s, budget 29 s. (3) Splitting engine.test.mjs's three seeded
loops into separate files would let the pool run them in parallel.
