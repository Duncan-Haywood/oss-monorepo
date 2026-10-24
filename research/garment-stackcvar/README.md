# garment-stackcvar: does a tail-risk objective, or a correlated-error model, rescue the angle-stable stack?

Follow-up to `garment-stackrobust` (track 6, `PROJECTS.md`; its "CVaR objective" and "correlated (rate-drift) errors" next steps). That project found that optimised 8-layer thin-film stacks lose to the plain quarter-wave stack under independent 3 to 5% layer-thickness error. Here the training objective is changed to the mean of the worst quarter of the sampled errors (CVaR), and the error model to one with a shared rate-drift component; every design is cross-evaluated under both models. Everything is a model on a CPU; nothing was coated or measured. Produced with AI assistance (Claude). **Result: negative** (below).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-stackcvar/

**Builds on.** `garment-stackrobust`, `garment-stackopt` (objective, imported) and `garment-thincolor` (transfer-matrix reflectance and colour; Macleod, *Thin-Film Optical Filters*; Born and Wolf, *Principles of Optics*; Wyman, Sloan and Shirley 2013). CVaR (conditional value at risk) is a standard tail-risk measure (Rockafellar and Uryasev 2000, *Journal of Risk* 2(3), cited from memory; not re-checked). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. No LLM is used. **Citation check.** No new reference was verified in this run; the inherited references carry the caveats in `garment-thincolor`, and the CVaR reference is unverified.

## Method (`src/garment_stackcvar/cvar.py`)
- Fabricated stack = design x (1 + sigma x eps), sigma = 0.05, eps_i ~ N(0,1) per layer. **iid**: layers independent. **corr**: eps_i = sqrt(rho) z + sqrt(1 - rho) e_i with one shared z and rho = 0.5, so each layer keeps the same marginal spread and only the correlation changes (a rate drift scaling all layers together).
- Training objective over K = 8 fixed draws (common random numbers): **mean** of the `garment-stackopt` objective J, or **CVaR25**, the mean of the worst 2 of the 8 values. Four training variants: mean/iid, CVaR25/iid, mean/corr, CVaR25/corr.
- Optimisers: random search and Nelder-Mead with restarts, 3000 stack evaluations each (8 per call), 8 seeds. Targets: quarter-wave stacks at 620 nm (red) and 450 nm (blue).
- Evaluation: 200 held-out draws per error model (never seen in training). Reported: mean J, 90th-percentile J, share of draws feasible (C* >= 40, hue within 30 degrees at normal incidence). Medians over seeds.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-stackcvar
python3 -m pytest -q tests          # 5 tests
python3 experiments/run.py          # about 19 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; medians over 8 seeds; mean J / p90 J / feasible)
Red (620 nm), evaluated under iid errors / under correlated errors:

| design | iid | corr |
|---|---|---|
| quarter-wave | **14.1** / **18.0** / 1.00 | **16.1** / **22.4** / 0.97 |
| random, mean/iid | 16.5 / 23.9 / 0.89 | 21.3 / 32.0 / 0.80 |
| random, CVaR25/iid | 18.4 / 27.0 / 0.85 | 22.2 / 32.0 / 0.82 |
| Nelder-Mead, mean/iid | 21.6 / 47.1 / 0.68 | 23.8 / 51.5 / 0.64 |
| Nelder-Mead, CVaR25/iid | 25.6 / 43.1 / 0.72 | 27.8 / 46.3 / 0.68 |
| Nelder-Mead, mean/corr | 35.8 / 85.3 / 0.44 | 35.1 / 88.1 / 0.51 |
| Nelder-Mead, CVaR25/corr | 33.5 / 65.8 / 0.45 | 37.1 / 69.6 / 0.39 |

Blue (450 nm) has the same pattern (quarter-wave 28.2 / 37.2 / 0.93 iid; the best optimised design 35.0 / 52.2 / 0.51); see `results.txt` for all rows.

- **No optimised design beat the quarter-wave stack** on mean J, p90 J or feasibility, for either target or either error model. The earlier finding (optimised stacks do not survive thickness error at this budget) is not rescued by these two changes.
- **CVaR lowers the tail for Nelder-Mead only, and costs the mean.** Red, iid: Nelder-Mead p90 falls from 47.1 to 43.1 while mean J rises from 21.6 to 25.6; with correlated training the p90 falls from 85.3 to 65.8. For random search CVaR training raised both mean and p90 under iid errors (p90 23.9 to 27.0). With 8 seeds and no significance tests, I treat the Nelder-Mead tail reduction as suggestive only.
- **Correlated-error training made things worse under both error models** for Nelder-Mead (red mean J 35.8 against 21.6 under iid evaluation). A plausible cause, not tested: with a shared factor the K = 8 draws span fewer independent directions, so the optimiser overfits them. Random search was less affected.
- **Correlated errors are harder for every design**: the quarter-wave stack's mean J rises from 14.1 to 16.1 (red) and 28.2 to 36.4 (blue).

## Limitations
Same model limits as `garment-stackopt` and `garment-stackrobust`: flat substrate, plane wave, no dispersion or absorption, recalled constant indices, equal-energy illuminant, three sample angles. Only one sigma (0.05), one rho (0.5), one K (8), one CVaR level (worst quarter), two optimisers and 8 seeds; no significance tests; K and optimiser settings untuned. The mean J mixes angle shift and constraint penalties. The comparison shows that these changes did not help in this stylised setting; it does not show that no robust stack exists, and it is not a claim about a real coating or fabric.

## Next steps
A larger K or more seeds to separate overfitting from a real effect; report shift and feasibility separately; CMA-ES and Bayesian-optimisation baselines; a drift term in the objective; start the optimiser from the quarter-wave stack instead of at random.

## Owner steps
Depositing and measuring a stack is a physical step for the owner. No price is given: I have no dated, sourced price list for coatings, so a bill of materials at about $300 / $1,000 / $3,000 is left to the owner.

## Outside dependencies (vitamins)
Python, numpy, SciPy, `garment-stackrobust`, `garment-stackopt` and `garment-thincolor`. Refractive indices, densities and colour-matching coefficients come from outside the model.
