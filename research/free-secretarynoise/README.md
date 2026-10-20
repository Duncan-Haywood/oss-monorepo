# free-secretarynoise: how much does noisy scoring cost the secretary problem, and should the 1/e cutoff move?

**Why this was worth doing.** The secretary problem (hire the best of *n* candidates seen one at a time, deciding on the spot) is usually stated with perfect comparisons. Real screening, including a digital twin that scores designs before a real test, sees a noisy score. A free-choice hunch: does noise change the best cutoff, or only the success rate? **Result (simulation, n = 50, 40,000 trials per cell):** the best cutoff barely moves. It sits at r = 19 with no noise and at r = 16 to 17 for every noise level from 0.25 to 4 (noise sd as a multiple of the quality sd), while the chance of picking the true best falls from 0.373 to 0.299 (noise 0.25), 0.145 (noise 1), 0.075 (noise 2) and 0.043 (noise 4); pure noise is a 1/50 = 0.02 lottery. Keeping the classical cutoff r = 19 instead of the best one costs at most 0.006 in P(best) at any noise level tried. A different goal, a high *average* true rank of the pick, wants a much earlier cutoff (r = 7 to 9). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-secretarynoise/

**Builds on.** Ferguson (1989), "Who solved the secretary problem?", *Statistical Science* 4(3), and Lindley (1961) for the cutoff rule and its 1/e limit (cited from memory, not re-verified: no bibliographic service was reachable from this session). No CU Boulder group's work is built on or implied; the link to the digital-twin theme is the analogy of a noisy screening score.

## Model
Candidate *i* has true quality q<sub>i</sub> ~ N(0,1), iid, and the interviewer sees x<sub>i</sub> = q<sub>i</sub> + σ·ε<sub>i</sub> with ε<sub>i</sub> ~ N(0,1). Cutoff rule r: skip candidates 1 to r&minus;1, then take the first later candidate whose observed score beats every observed score so far; if none does, take the last. Success means the pick has the largest *true* quality. `secretary.py` has the rule, the exact noiseless success probability (r&minus;1)/n · Σ<sub>j=r..n</sub> 1/(j&minus;1), and a sweep that reuses the same draws for every cutoff.

## Reproduce
```bash
cd research/free-secretarynoise
python3 -m unittest discover -s tests -v     # 5 tests
python3 experiments/run.py                   # about 30 s, stdlib only, seed 7
python3 experiments/figure.py                # stdlib only
```

## Results
`experiments/results.txt` (all four tables) and `experiments/pbest_vs_cutoff.svg`.

| noise σ | best cutoff r | P(best) at best r | P(best) at r = 19 | cutoff best for mean rank | mean true percentile there |
|---|---|---|---|---|---|
| 0 | 19 | 0.373 | 0.373 | 7 | 0.883 |
| 0.25 | 17 | 0.299 | 0.297 | 7 | 0.870 |
| 0.5 | 16 | 0.231 | 0.227 | 8 | 0.847 |
| 1 | 16 | 0.145 | 0.139 | 8 | 0.785 |
| 2 | 16 | 0.075 | 0.071 | 9 | 0.687 |
| 4 | 16 | 0.043 | 0.041 | 9 | 0.603 |

Check: with σ = 0 the simulation agrees with the exact formula; the largest gap over the 45 cutoffs is 0.0062, against a binomial standard error of 0.0024 per cell (the cells share draws and 45 are scanned, so a gap of 2 to 3 standard errors somewhere is expected).

## Limitations
- **One setting.** n = 50, Gaussian quality and Gaussian noise, one seed, 40,000 trials per cell. Standard error of a P(best) cell is about 0.002 to 0.0025, so best cutoffs within about 2 of each other (16 vs 17, and the flat top between them) are not distinguishable; "r = 16 to 17" is a range, not a measured optimum.
- **Cutoff rules only.** The truly optimal policy under noise (a dynamic programme over posterior beliefs) is not computed; it could beat every cutoff rule here, so these are lower bounds on what is achievable, and the "cutoff barely moves" finding is about this rule family.
- **Noise is known to be independent and homoscedastic.** The rule ignores σ entirely. Learning σ from the stream, or noise that grows with quality, is not tried.
- **No claim about real hiring or real twins.** This is an analogy-level toy.

## Next steps
Solve the noisy problem by dynamic programming over a discretised posterior to see how much a σ-aware rule beats the best cutoff; vary n.

## Owner steps
None.

## Outside dependencies
Python standard library only.
