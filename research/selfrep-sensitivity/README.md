# selfrep-sensitivity: which assumed input of the replicating-printer growth model does the doubling time depend on most?

Track 1 (`PROJECTS.md`). The `selfrep-growth` model has no measured input, so the useful question is which input a real measurement should pin down first. The track's recent chain had narrowed to variants of rod sizing; this asks a different question of the growth model itself: a variance-based (Sobol) global sensitivity analysis of its doubling time. Produced with AI assistance (Claude). Computed only; no machine was built or measured.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-sensitivity/

**Builds on.** `selfrep-growth` (fluid and discrete-event model, imported by relative path) and through it `selfrep-closure`. Method: Saltelli et al. (2010), "Variance based sensitivity analysis of model output", *Computer Physics Communications* 181(2), <https://doi.org/10.1016/j.cpc.2009.09.018> (first-order estimator); Jansen (1999) estimator for total indices. It builds on none of the labs in `prompt.md`.

## Method
- Inputs: print rate (g/h), assembly time (h), vitamin cost per copy, import budget (per h), build-failure probability. Work per copy is printed mass / print rate + assembly (1100 g printed, as `selfrep-growth`).
- Ranges are assumptions, not data: the four positive inputs log-uniform within x/2..x2 of the `selfrep-growth` baseline (budget x/16..x16 in scenario C), failure uniform on 0..0.5. Inputs are independent.
- Output: effective doubling time for growth 1 → 64 units in the **fluid** model (closed form, `time_to_reach_ode`), and its logarithm. N = 4000 base samples, 7 evaluations each, seed 0. Local elasticities are cross-checked against the **discrete-event** model (300 runs per point, same seeds).

## Reproduce
```bash
cd research/selfrep-sensitivity
python3 -m unittest discover -s tests -v     # 4 tests, standard library only
python3 experiments/run.py                   # about 1 s; writes experiments/results.txt
python3 experiments/figure.py                # writes experiments/sobol_total.svg from the committed results.txt
```

## Results (from `experiments/results.txt`)
- **Import-limited shop (budget 4/h): budget and vitamin cost carry nearly all the variance.** Total index on ln T: budget 0.45, vitamin cost 0.43, failure 0.11, print rate and assembly time 0.00. Doubling time is proportional to V/B here, so the two enter as a ratio and are interchangeable; the first-order sum is 1.02 (additive in logs, as expected).
- **Time-limited shop (budget 64/h): the ranking flattens.** Budget, vitamin cost, failure and print rate are all similar (total index 0.25 to 0.28 on ln T); assembly time stays near 0.01 because the 6 h is a small part of the 50 h per copy.
- **Wide budget uncertainty (x/16..x16) swamps everything else:** budget alone has total index 0.93 on T (0.94 on ln T).
- **The fluid model overstates budget sensitivity at 64/h.** Local elasticity of doubling time to budget at 64/h (failure 0.1) is −0.45 in the fluid model but −0.02 in the discrete-event model; the same for vitamin cost (0.45 vs 0.01). The fluid model keeps a budget-limited tail above N* ≈ 18 units, while the discrete-event fleet grows in whole generations of one build time and is machine-time-limited there. Failure elasticity is −1.00 fluid against −0.71 discrete at 64/h, and −1.00 against −1.14 at 4/h. So the Sobol indices for the time-limited case describe the fluid model, and the discrete-event model would put more weight on failure and print rate.
- **What to measure first.** If the shop is import-limited, the vitamin price list and the import budget matter and the print rate does not; if it is time-limited, failure rate and print throughput matter and prices matter little. Which regime a real shop is in depends on the budget, which is the least knowable input.

## Limitations
- Ranges, baseline and independence are assumed. Sobol indices describe the assumed ranges, not the real world; a different range changes the ranking (compare scenarios A and C).
- The indices are for the fluid model only; the discrete-event model was used for local elasticities, not Sobol indices. Build-time spread (CV) is not varied because the fluid model ignores it.
- Failure and the vitamin price are treated as independent although a cheaper, riskier design would tie them together.
- Estimator noise: with N = 4000 the first-order sums differ from 1 by a few hundredths (0.90 to 1.02); small indices (below about 0.02) are indistinguishable from zero.

## Next steps
Sobol indices on the discrete-event model with common random numbers; add the build-time CV and the machine mix of `selfrep-nextmachine`; correlate failure with design choices.

## Owner steps
- Measure real print throughput, assembly time, failure rate and an actual vitamin quote for one printer; this analysis says which of those moves the answer.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-growth` and `selfrep-closure` source trees (relative paths).
