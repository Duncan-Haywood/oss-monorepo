# society-ringnoise: is the mean-field's overshoot on the ring crowd caused by finite-size noise or by memory correlation?

`society-ringmf` found its deterministic mean-field overstates the robot share needed to tip a ring crowd's passing-side
convention, and listed two suspects: finite-size noise and the independent-memory step. **Neither alone explains it. A
noisy but memoryless version of the same map (`resampled`) goes too far the other way: for evenly spread robots at k = 2
the tip threshold is ρ = 0.06 (resampled), 0.10 (simulation) and 0.18 (mean-field). Noise pulls the threshold down, and the
persistence of real memory pushes it back up; for blocks of 4 to 8 the simulation sits at or near the mean-field.**
Results are about simulated people following a stated rule, not real crowds.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/society-ringnoise/

## Why this question

A designer who wants a cheap screening rule needs to know which approximation to repair. Adding noise to the mean-field
would overcorrect; the missing piece is the time correlation in each person's memory.

## Builds on

`society-ringmf` (mean-field and its next step 1), `society-allies` (simulator, placement, parameters N = 200, M = 9,
ε = 0.02), and the committed-minority literature (Xie et al. 2011; Centola et al. 2018). **Lab tags:** none.

## Method

Three models share the ring, placement, k, M and ε. *Mean-field*: deterministic fixed point (`society-ringmf`).
*Resampled* (`src/society_ringnoise`): 300 synchronous sweeps; each person's state is the majority of M fresh partner
plays (robots play L; people play their state, flipped to a coin with chance ε), so there is noise but no memory.
*Simulation*: `society-allies`, 500 rounds, persistent memory. Threshold = smallest ρ on a 0.02 grid where the mean-field
share ≥ 0.9, or at least half of 20 crowds have ≥ 90% on L.

## Results (`experiments/results.txt`, seeded, about 12 minutes)

| block | k | mean-field | resampled | simulation |
|---|---|---|---|---|
| 1 | 2 | 0.18 | 0.06 | 0.10 |
| 4 | 2 | 0.26 | 0.16 | 0.24 |
| 8 | 2 | 0.38 | 0.26 | 0.38 |
| 1 | 3 | 0.18 | 0.10 | 0.14 |
| 4 | 3 | 0.20 | 0.14 | 0.20 |
| 8 | 3 | 0.34 | 0.22 | 0.30 |

The simulation lies between the other two in all 6 cells, equal to the mean-field in 3. The 20-seed, 0.02 grid mean-field
values differ slightly from `society-ringmf` (0.18 vs 0.20 at block 1, k = 2) because of the finer grid.

## Limitations

Only 6 cells; resampled is one particular memoryless model (synchronous updates differ from the simulation's random
pairwise meetings, so part of its gap may be update order, not memory); thresholds are ±0.02 with 20 seeds; M, ε are
from `society-robotnorms`, not sourced; 1D binary stylised game; no real-people data.

## Next steps

1. A memoryless *asynchronous* model, to separate update order from memory persistence.
2. A pair approximation that carries memory correlation.

## Reproduce

```
cd research/society-ringnoise
python3 -m unittest discover -s tests
python3 experiments/run.py
```

## Outside dependencies

None: standard library, plus the `society-allies` and `society-ringmf` code in this repository.
