# garment-stacklayers: does adding layers cut the angle shift of a structural-colour coating at fixed chroma and oxide mass?

Follow-up to `garment-stackpareto` (track 6, `PROJECTS.md`; its "layer count as a variable" next step). `garment-stackpareto` fixed the stack at 8 layers. Here the layer count N runs over 2, 4, 6, 8, 10 and 12 with the same objective, penalties and optimiser budget, for three constraint cases. Everything is a model on a CPU; no coating was made or measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-stacklayers/

**Builds on.** `research/garment-stackpareto`, `research/garment-stackopt` and `research/garment-thincolor` (imported, not copied), which implement the standard characteristic-matrix method of thin films (Macleod, *Thin-Film Optical Filters*; Born and Wolf, *Principles of Optics*) and the Wyman, Sloan and Shirley (2013) colour-matching fit. The optimiser is SciPy Nelder-Mead with random restarts. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. No LLM is used. **Citation check.** No new references; those inherited carry the caveats stated in `garment-thincolor` (books cited from memory, editions unverified).

## Method (`src/garment_stacklayers/layers.py`)
- Alternating layers, index 2.4 on top and 1.46 (densities 4230 and 2200 kg/m3), nylon-like substrate 1.53, thickness 20 to 250 nm, shift = mean dE76 at 15, 30, 45 degrees against normal incidence.
- Soft penalties as in `garment-stackpareto`: 5 per unit of C* below the floor, 1 per degree of hue error beyond 30 degrees from the 4-pair quarter-wave stack's hue, 20 per g/m2 of oxide mass above the cap. A run counts as feasible only if all three constraints hold exactly; a cell reports its best feasible run.
- Cases (target, C* floor, mass cap): 620 nm / 40 / 4.0; 620 nm / 40 / 3.0; 450 nm / 35 / 4.0. Per cell: 8 seeds, 3000 objective calls each, the same for every N (so larger N gets fewer calls per dimension).

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-stacklayers
python3 -m pytest -q tests          # 4 tests
python3 experiments/run.py          # a few minutes on 4 cores; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; 8 seeds per cell, noisy)
- **Two layers are not enough, six to ten are.** Red, floor 40, cap 4.0: best shift 3.40 with 2 layers, 3.38 with 4, then 0.47 (6), 0.77 (8) and 0.58 (10).
- **More layers did not keep helping at this budget.** At 12 layers only 3 of 8 runs were feasible and the best shift was 1.14. With the cap at 3.0, 10 layers had 1 of 8 feasible runs (13.69) and 12 layers none. This probably reflects the search (same 3000 calls, more dimensions, a tighter feasible region), not a property of 12-layer stacks; it was not tested with a larger budget.
- **Best-of-8 versus median.** The best values (e.g. 0.47 at 6 layers) are far below the medians (2.54), so single best numbers overstate what a typical run finds. The differences between 6, 8 and 10 layers in the best column are within that spread and should not be ranked.
- **Blue is harder.** Floor 35, cap 4.0: best 6.76 (2), 3.93 (4), 1.73 (6), 3.58 (8), 4.04 (10), 6.00 (12; 2 of 8 feasible). Six layers again had the lowest best, from one favourable run among 7 feasible (median 3.97).
- The 8-layer figures here (e.g. 0.77 red) are not the same as `garment-stackpareto`'s 0.68 for the same case: different seeds and 8 rather than 5 per cell.

## Limitations
Stylised throughout: flat substrate, plane wave, constant recalled indices, equal-energy illuminant, dE76, mass as areal oxide mass only. Three angles, two targets, three cases, 8 seeds, one optimiser at one budget, soft penalties with untuned weights. The best-of-8 numbers may exploit the three-angle sample, and no thickness tolerance is applied (see `garment-stackrobust`: nominal optima are fragile, and more layers probably add sensitivity; not tested). Nothing here is a claim about a real fabric.

## Next steps
Scale the budget with N to separate search difficulty from stack capability; NSGA-II; robust objective from `garment-stackrobust` at each N; dispersion and absorption from published index data.

## Owner steps
Depositing and measuring a stack is a physical step for the owner. No price is given: there is no dated, sourced coating price list here, so a bill of materials at about $300 / $1,000 / $3,000 is left to the owner.

## Outside dependencies (vitamins)
Python, numpy, SciPy, `garment-stackpareto`, `garment-stackopt` and `garment-thincolor`. Refractive indices, densities and colour-matching coefficients come from outside the model.
