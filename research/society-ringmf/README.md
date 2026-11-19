# society-ringmf: can a local mean-field predict which robot blocks tip a ring crowd's passing-side convention?

`society-allies` found by simulation that clustered robots stop tipping the crowd once a block outgrows the
neighbourhood (its next step 2 asked for a mean-field). **A deterministic local mean-field (one number per person, memory treated as independent draws) gets the ordering
right but is not a bound in either direction: over 160 cells (ρ 0.04 to 0.40, blocks 1/2/4/8, k = 1/2/3/5) it calls
tip/no-tip the same as the simulation in 141; in 11 of the other 19 the simulation tips and the mean-field does not, in 8
the reverse.** For evenly spread robots it overstates the share needed (ρ = 0.20 against 0.12 simulated at k = 2); for
blocks of 4 to 8 at k ≥ 2 it tips at or below the simulated share in all 6 cells (below in 5), partly because the map
runs to its fixed point while the simulation stops at 500 rounds. (Corrected 2026-11-19: an earlier version read the
binomial through a 1/1000 lookup table that froze slowly moving fronts and reported 145 / 14 / 1 and "almost never too
optimistic"; see the audit note under Limitations.) Results are about simulated people following a stated
rule, not real crowds.

**Live page:** https://marisstella.app/research/society-ringmf/

## Why this question

A closed-form or cheap fixed-point rule would let a designer screen robot placements without 20-seed simulations. The
question is how far a simple local approximation can be trusted, and in which direction it errs.

## Builds on

`society-allies` (same ring, rule and parameters; its simulator is imported for the comparison, and a test checks the
two placement functions agree), `society-robotnorms`, and the committed-minority literature (Xie et al. 2011;
Centola et al. 2018). Closest methods and models: pair approximations and approximate master equations for binary-state dynamics (Gleeson 2013, *Phys. Rev. X* 3, 021004); adaptive play, the same memory-majority rule (Young 1993, *Econometrica* 61, 57); local interaction on a circle (Ellison 1993, *Econometrica* 61, 1047); zealots in voter models (Mobilia 2003, *Phys. Rev. Lett.* 91, 028701). **Lab tags:** none; no lab's work is built on.

## Model

Person i has `x_i`, the chance their memory majority is L. A partner is uniform over the 2k nearest sites and plays L
with probability 1 (robot) or `(1 − ε)·x_j + ε/2` (person). Memory slots are treated as independent Bernoulli draws
with the mean partner rate `q_i`, so `x_i = P(Binomial(M, q_i) > M/2)`. Iterating from `x = 0` (everyone on R) gives the
fixed point; "tips" means mean `x ≥ 0.9`. N = 200, M = 9, ε = 0.02 as in `society-allies`.

## Results (`experiments/results.txt`, seeded; `experiments/run.py`, a few minutes)

Smallest ρ on a 0.04 grid at which the crowd tips (simulation: at least half of 10 crowds with ≥ 90% of people on L):

| block | k | mean-field | simulation |
|---|---|---|---|
| 1 | 1 | 0.16 | 0.12 |
| 2 | 1 | 0.24 | 0.20 |
| 4 | 1 | 0.36 | 0.32 |
| 8 | 1 | none ≤ 0.40 | none ≤ 0.40 |
| 1 | 2 | 0.20 | 0.12 |
| 2 | 2 | 0.12 | 0.16 |
| 4 | 2 | 0.24 | 0.24 |
| 8 | 2 | 0.36 | 0.40 |
| 1 | 3 | 0.20 | 0.16 |
| 2 | 3 | 0.20 | 0.12 |
| 4 | 3 | 0.16 | 0.20 |
| 8 | 3 | 0.28 | 0.36 |
| 1 | 5 | 0.24 | 0.16 |
| 2 | 5 | 0.20 | 0.16 |
| 4 | 5 | 0.12 | 0.16 |
| 8 | 5 | 0.20 | 0.28 |

The mean-field recovers the "block vs neighbourhood" pattern: the threshold rises with block size at small k and falls
as k grows. It is too pessimistic for evenly spread robots, where the simulated tip happens at ρ = 0.12 while the
mean-field fixed point stays near R until 0.20 (at ρ = 0.12, k = 2: mean-field 0.05, simulation 0.98 of people on L).
For blocks of 4 and 8 at k ≥ 2 it errs the other way, tipping one or two grid steps (0.04 to 0.08) below the
simulation in 5 of 6 cells. Pairs (block 2) go both ways.

## What this does and does not show

- A deterministic local map is not a bound in either direction: it overstates the share needed for spread robots and,
  for blocks of 4 to 8, tips at or below the simulated share. The second is likely partly a horizon effect (the map is
  a fixed point with no time limit; the simulation stops at 500 rounds, about 56 memory refreshes per person), which
  this study does not separate.
- Why the map overstates the share needed for singles is not tested here (finite-size noise is the obvious candidate; the memory
  independence approximation is another). A noise or pair-approximation version would separate them.
- 10 seeds, a 0.04 ρ grid and a 0.5 crowd criterion make each simulated threshold coarse (±0.04).
- No real-people data; norm-shifting raises consent questions and this is a cost study, not a recipe.

## Limitations

Stylised: binary choice, 1D ring, M = 9, ε = 0.02 (chosen in `society-robotnorms`, not sourced), 500-round horizon.
Only ρ, block and k are swept.

**Audit correction (2026-11-19, [audit](../../portfolio/quality/audits/2026-11-19-society-ringmf.json)).** Until
2026-11-19 `fixed_point` rounded q to 1/1000 before a binomial lookup, which makes the map piecewise constant and pinned
slowly moving fronts (at ρ = 0.22, block 4, k = 2 it settled at 0.444; the exact map reaches 1.0 after more than 3,000
iterations). It now uses the exact binomial with a 20,000-iteration cap, and the table, counts and headline above are
from the rerun. `society-ringnoise` imports this function, so its mean-field column follows the exact map from the same
date. Still open: no horizon-matched comparison and no well-mixed baseline (its threshold, r* ≈ 0.2165, is about the
local map's 0.20 for spread robots).

## Next steps

1. A pair approximation or finite-size noise term, to test whether it closes the gap for spread robots.
2. Sweep M and ε in the mean-field (cheap) and check the extremes by simulation.

## Reproduce

```
cd research/society-ringmf
python3 -m unittest discover -s tests
PYTHONPATH=src python3 experiments/run.py
```

## Outside dependencies

None: standard library, plus `society-allies`' simulator in this repository.
