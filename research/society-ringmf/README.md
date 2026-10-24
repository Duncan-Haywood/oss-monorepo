# society-ringmf: can a local mean-field predict which robot blocks tip a ring crowd's passing-side convention?

`society-allies` found by simulation that clustered robots stop tipping the crowd once a block outgrows the
neighbourhood (its next step 2 asked for a mean-field). **A deterministic local mean-field (one number per person, memory
treated as independent draws) gets the ordering right and is almost never too optimistic, but it overstates the robot share
needed: over 160 cells (ρ 0.04 to 0.40, blocks 1/2/4/8, k = 1/2/3/5) it calls tip/no-tip the same as the simulation in 145;
in 14 of the other 15 the simulation tips and the mean-field does not (1 the reverse).** For evenly spread robots at k = 2 it
puts the threshold at ρ = 0.20 against 0.12 simulated; the gap shrinks to 0 for blocks of 4 to 8 at k = 3, because noise in
small crowds, not the average, carries the tip at low density. Results are about simulated people following a stated
rule, not real crowds.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/society-ringmf/

## Why this question

A closed-form or cheap fixed-point rule would let a designer screen robot placements without 20-seed simulations. The
question is how far a simple local approximation can be trusted, and in which direction it errs.

## Builds on

`society-allies` (same ring, rule and parameters; its simulator is imported for the comparison, and a test checks the
two placement functions agree), `society-robotnorms`, and the committed-minority literature (Xie et al. 2011;
Centola et al. 2018). **Lab tags:** none; no lab's work is built on.

## Model

Person i has `x_i`, the chance their memory majority is L. A partner is uniform over the 2k nearest sites and plays L
with probability 1 (robot) or `(1 − ε)·x_j + ε/2` (person). Memory slots are treated as independent Bernoulli draws
with the mean partner rate `q_i`, so `x_i = P(Binomial(M, q_i) > M/2)`. Iterating from `x = 0` (everyone on R) gives the
fixed point; "tips" means mean `x ≥ 0.9`. N = 200, M = 9, ε = 0.02 as in `society-allies`.

## Results (`experiments/results.txt`, seeded; `experiments/run.py`, about 2.5 minutes)

Smallest ρ on a 0.04 grid at which the crowd tips (simulation: at least half of 10 crowds with ≥ 90% of people on L):

| block | k | mean-field | simulation |
|---|---|---|---|
| 1 | 1 | 0.16 | 0.12 |
| 1 | 2 | 0.20 | 0.12 |
| 1 | 3 | 0.20 | 0.16 |
| 1 | 5 | 0.24 | 0.16 |
| 2 | 2 | 0.16 | 0.16 |
| 4 | 2 | 0.28 | 0.24 |
| 4 | 3 | 0.20 | 0.20 |
| 4 | 5 | 0.16 | 0.16 |
| 8 | 2 | 0.40 | 0.40 |
| 8 | 3 | 0.36 | 0.36 |
| 8 | 5 | 0.24 | 0.28 |
| 8 | 1 | none ≤ 0.40 | none ≤ 0.40 |

(All 16 cells are in `results.txt`.) The mean-field recovers the "block vs neighbourhood" pattern: the threshold rises with
block size and falls as k grows, and for blocks of 4 and 8 it is within one grid step (0.04) of the simulation in all 6
cells at k ≥ 2. It is too pessimistic for evenly spread robots, where the simulated tip happens at ρ = 0.12 while the
mean-field fixed point stays near R until 0.20 (at ρ = 0.12, k = 2: mean-field 0.05, simulation 0.98 of people on L).
One cell goes the other way (block 8, k = 5: mean-field 0.24, simulation 0.28), within one grid step and ten seeds.

## What this does and does not show

- A deterministic local map is a usable *upper bound on the share needed* for clustered robots, not a predictor for
  spread ones; the miss is where fluctuations in finite neighbourhoods matter.
- Why the gap is largest for singles is not tested here (finite-size noise is the obvious candidate; the memory
  independence approximation is another). A noise or pair-approximation version would separate them.
- 10 seeds, a 0.04 ρ grid and a 0.5 crowd criterion make each simulated threshold coarse (±0.04).
- No real-people data; norm-shifting raises consent questions and this is a cost study, not a recipe.

## Limitations

Stylised: binary choice, 1D ring, M = 9, ε = 0.02 (chosen in `society-robotnorms`, not sourced), 500-round horizon.
Only ρ, block and k are swept.

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
