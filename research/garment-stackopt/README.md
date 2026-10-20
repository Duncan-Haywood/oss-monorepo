# garment-stackopt: can an optimiser cut the angle shift of a structural-colour coating, and what does it give up?

Follow-up to `garment-thincolor` (track 6, `PROJECTS.md`; the "optimiser for stacks that minimise angle shift" next step). `garment-thincolor` showed that a quarter-wave stack's colour blue-shifts strongly with viewing angle. Here the layer thicknesses of an 8-layer stack are optimised to reduce that shift while keeping the colour, and three non-LLM optimisers are compared at the same evaluation budget. Everything is a model on a CPU; no coating was made or measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-stackopt/

**Builds on.** `research/garment-thincolor/src/garment_thincolor/model.py` (imported, not copied), which implements the standard characteristic-matrix method of thin films (Macleod, *Thin-Film Optical Filters*; Born and Wolf, *Principles of Optics*) and the Wyman, Sloan and Shirley (2013) colour-matching fit. Optimisers are from numpy and SciPy (Nelder-Mead, differential evolution). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. No LLM is used. **Citation check.** No new references. Those inherited from `garment-thincolor` carry its caveats (books cited from memory, editions unverified).

## Method (`src/garment_stackopt/opt.py`)
- Design: 8 alternating layers (TiO2-like 2.4 on top, SiO2-like 1.46) on a nylon-like 1.53 substrate, thicknesses free in 20 to 250 nm. Indices and densities are the round recalled values of `garment-thincolor`.
- Objective J (minimise): mean dE76 between the colour at 15, 30 and 45 degrees and at normal incidence, plus soft penalties 5 x max(0, 40 - C*) and max(0, |hue - target| - 30 degrees), both at normal incidence. The target hue is that of a quarter-wave baseline stack with the same 8 layers.
- Baseline: the quarter-wave stack at 620 nm (red-orange hue 92) or 450 nm (blue, hue 213).
- Optimisers, each given exactly 3000 objective calls per run and 10 seeds: uniform random search; Nelder-Mead with random restarts; SciPy differential evolution (population 80, no polish). A wrapper counts calls and keeps the best point.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-stackopt
python3 -m pytest -q tests                  # 7 tests
python3 experiments/run.py                  # about 4 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`, seeded; 10 runs per method)
Median over 10 seeds of the best objective found (lower is better); "shift" is mean dE76 over the three angles.

| target | quarter-wave | random | Nelder-Mead restarts | differential evolution |
|---|---|---|---|---|
| 620 nm stack: shift | 12.4 | 4.4 | 1.4 | 3.3 |
| 450 nm stack: shift | 25.9 | 9.3 | 5.6 | 7.1 |

- Every optimiser beats the quarter-wave stack on angle shift at both targets, and Nelder-Mead with restarts is best at this budget on both (the ranking could change with a different budget, layer count or objective; 10 seeds, no significance test).
- The price is chroma and mass. The quarter-wave stacks have C* 70 (red) and 53 (blue); the optimised stacks sit near the allowed floor of C* 40 to 47, because the optimiser trades colour strength for angle stability, and use roughly 1.8 to 2.5 times the oxide mass (3.3 to 3.8 g/m2 against 2.0 and 1.5 g/m2). Mass was not constrained.
- Not all runs end feasible: for the blue target 9 of 10 Nelder-Mead and 9 of 10 differential-evolution runs satisfy both penalties (the other run in each case misses a constraint).
- A shift of 1.4 dE76 is small in this model, but the three sample angles, the flat substrate and the equal-energy illuminant are all modelling choices, and the optimiser may exploit them (angles between the samples are not checked).

## Limitations
Flat substrate, plane wave, no dispersion or absorption, constant recalled indices. The objective samples three angles only and uses dE76 under an equal-energy illuminant. Optimised thicknesses are not checked for fabrication tolerance (`garment-thincolor` showed 10% errors matter), so the "optimum" may be fragile. The chroma floor and hue window are arbitrary. Optimiser settings were not tuned; the comparison is of three default-ish configurations at one budget. Nothing here is a claim about a real fabric.

## Next steps
Add a robustness term (expected dE76 under thickness error); more angles or a hemispherical average; mass in the objective, giving a Pareto front of shift against mass and chroma; dispersion and absorption from published index data; CMA-ES and Bayesian optimisation as further baselines; a session-written proposer set against the baselines, labelled as such.

## Owner steps
Depositing and measuring a stack is a physical step for the owner. No price is given: I have no dated, sourced price list for coatings, so a bill of materials at about $300 / $1,000 / $3,000 is left to the owner.

## Outside dependencies (vitamins)
Python, numpy, SciPy, and `garment-thincolor`. Refractive indices, densities and colour-matching coefficients come from outside the model.
