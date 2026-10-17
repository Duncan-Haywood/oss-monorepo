# garment-stackrobust: does the angle-stable stack survive layer-thickness error?

Follow-up to `garment-stackopt` (track 6, `PROJECTS.md`; its "robustness term" next step). That project's optimised 8-layer stacks had a small angle shift on paper, but `garment-thincolor` had shown that 10% thickness errors matter. Here the optimised designs are fabricated virtually with random thickness error, and a robust objective (mean cost over fixed error draws) is compared with the nominal one at equal total cost. Everything is a model on a CPU; nothing was coated or measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-stackrobust/

**Builds on.** `garment-stackopt` (objective and penalties, imported) and `garment-thincolor` (transfer-matrix reflectance, colour; Macleod, *Thin-Film Optical Filters*; Born and Wolf, *Principles of Optics*; Wyman, Sloan and Shirley 2013). Robust optimisation by sampled scenarios is a standard idea; no specific paper is reproduced. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. No LLM is used. **Citation check.** No new references; inherited ones carry the caveats in `garment-thincolor` (books cited from memory, editions unverified).

## Method (`src/garment_stackrobust/rob.py`)
- Fabricated stack = design thickness x (1 + sigma x eps), eps ~ N(0,1) independently per layer, sigma = 0.03 or 0.05.
- Nominal optimisation: the `garment-stackopt` objective J (mean dE76 over 15/30/45 degrees plus chroma and hue penalties), 3000 stack evaluations.
- Robust optimisation: J averaged over K = 6 fixed error draws (common random numbers), so each call costs 6 stack evaluations and the same total cost of 3000 buys 500 calls.
- Optimisers: random search and Nelder-Mead with restarts (differential evolution from `garment-stackopt` was not rerun). 10 seeds each.
- Evaluation: 200 held-out draws never seen by any optimiser. Reported: nominal J, mean J under error, share of draws that stay feasible (C* >= 40 and hue within 30 degrees at normal incidence), and mean dE76 drift of the normal-incidence colour from the design's own.
- Targets: quarter-wave stacks at 620 nm (red) and 450 nm (blue), as in `garment-stackopt`.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-stackrobust
python3 -m pytest -q tests          # 5 tests
python3 experiments/run.py          # about 15 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; medians over 10 seeds)
Mean J under error (lower is better; includes penalties) and feasible share:

| target, sigma | quarter-wave | NM nominal | NM robust | random nominal | random robust |
|---|---|---|---|---|---|
| 620 nm, 0.03 | 13.2 / 1.00 | 24.9 / 0.49 | **11.7 / 0.87** | 19.9 / 0.63 | 15.8 / 0.83 |
| 620 nm, 0.05 | **14.2 / 1.00** | 45.6 / 0.39 | 25.6 / 0.64 | 37.7 / 0.51 | 23.1 / 0.77 |
| 450 nm, 0.03 | 26.5 / 0.99 | 24.1 / 0.24 | **21.0 / 0.59** | 19.2 / 0.54 | 25.1 / 0.47 |
| 450 nm, 0.05 | 28.2 / 0.94 | 40.8 / 0.21 | 34.4 / 0.43 | 35.5 / 0.43 | **30.8 / 0.56** |

- **The nominal optima are fragile.** The Nelder-Mead optimum that scores J = 1.4 (red) with no error scores 24.9 at 3% error, worse than the unoptimised quarter-wave stack (13.2), and only 49% of draws stay feasible. At 5% error it is 45.6.
- **Robust optimisation recovers part of the loss but not all.** At red, sigma 0.03, robust Nelder-Mead beats the quarter-wave stack on mean J (11.7 vs 13.2, 10 seeds, no significance test). At 5% error the quarter-wave stack has the best mean J at red (14.2 vs 23.1 for the best robust design) and at blue (28.2 vs 30.8).
- **Robustness costs nominal performance**: robust designs have nominal J of 5 to 18, against 1.4 to 5.6 for nominal ones.
- **Colour drift is not reduced.** The normal-incidence colour of every optimised design drifts by about 10 dE76 at 3% error and 16 to 18 at 5%, larger than the quarter-wave stack's (7.1 and 11.7 at red; 4.5 and 7.6 at blue). The robust objective trades shift against feasibility, not against drift, and the optimisers settle where colour is sensitive to thickness.
- At this cost, K = 6 draws is a small sample and the best of 500 calls can overfit them; random search beats Nelder-Mead on the robust objective at 5% error (red 23.1 vs 25.6, blue 30.8 vs 34.4). I did not tune K or the optimiser settings.

## Limitations
Same model limits as `garment-stackopt`: flat substrate, plane wave, no dispersion or absorption, constant recalled indices, equal-energy illuminant, three sample angles. Thickness error is independent Gaussian per layer; real deposition errors are correlated (a drifting rate scales all layers together) and that case is not modelled. Penalties are included in "mean J", which mixes shift and constraint violation. Only 2 optimisers, 2 sigmas and 1 K were tried; medians over 10 seeds with no significance tests. The results show the nominal designs of `garment-stackopt` should not be read as realistic; they do not show that a robust stack exists. Nothing here is a claim about a real fabric.

## Next steps
Report shift and feasibility separately instead of one J; correlated (rate-drift) errors; a minimax or CVaR objective; more draws with a smaller sigma sweep; a drift term in the objective; CMA-ES and Bayesian optimisation baselines.

## Owner steps
Depositing and measuring a stack is a physical step for the owner. No price is given: I have no dated, sourced price list for coatings, so a bill of materials at about $300 / $1,000 / $3,000 is left to the owner.

## Outside dependencies (vitamins)
Python, numpy, SciPy, `garment-stackopt` and `garment-thincolor`. Refractive indices, densities and colour-matching coefficients come from outside the model.
