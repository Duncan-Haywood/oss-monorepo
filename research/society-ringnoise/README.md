# society-ringnoise: is the mean-field's overshoot on the ring crowd caused by finite-size noise or by memory correlation?

`society-ringmf` found its deterministic mean-field overstates the robot share needed to tip a ring crowd's passing-side
convention, and listed two suspects: finite-size noise and the independent-memory step. **In the committed table a
noisy but memoryless version of the same map (`resampled`) tips at a lower robot share than the simulation and the
mean-field at a higher one (evenly spread robots, k = 2: ρ = 0.06 / 0.10 / 0.18). An audit (2026-11-19, see "Audit
correction" below) found that this bracketing does not support the noise-versus-memory reading: it is largely an
artefact of the resampled model's longer horizon and of a lookup-table rounding in the mean-field.** Results are about
simulated people following a stated rule, not real crowds.

## Audit correction (2026-11-19)

Quality round 85 (`portfolio/quality/audits/2026-11-19-society-ringnoise.json`) re-ran `experiments/run.py` (the table
below reproduces exactly) and found two problems that change the conclusion:

1. **Horizon mismatch.** `resampled` runs 300 sweeps, and each sweep refreshes all M = 9 memory slots; the simulation's
   500 rounds give each person about 500 meetings, about 56 full memory refreshes. With `sweeps=56` the resampled
   thresholds are 0.12, 0.26, 0.38, 0.14, 0.22, 0.34 (rows in table order): at or above the simulation in all 6 cells,
   not below it. More time to escape, not the absence of memory, is what lowered the resampled column.
2. **Mean-field lookup table.** `society_ringmf.fixed_point` rounds q to 1/1000 before the binomial lookup; for blocks
   this pins the slowly moving front at x ≈ 0.44. With the exact binomial (same map, same placement) the block cells
   tip at 0.22, 0.34, 0.16, 0.26 (block 4 k 2, block 8 k 2, block 4 k 3, block 8 k 3), below the simulation, and some
   still creep after 30,000 iterations, so the deterministic threshold is horizon-dependent too. The simulation then
   lies between the two other columns in 2 of 6 cells, not 6 of 6.

A fair comparison needs the three models on a matched time scale (same number of memory writes per person) and an
exact mean-field iterated for that horizon. Until then the table is a record of what the code printed, not evidence
for the "noise down, memory up" attribution.

**Live page:** https://marisstella.app/research/society-ringnoise/

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

In this table the simulation lies between the other two in all 6 cells, equal to the mean-field in 3; see the audit
correction above for why that does not survive a matched horizon or an exact mean-field. The 20-seed, 0.02 grid mean-field
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
