# garment-stackpareto: how much angle shift can an 8-layer coating shed at a given chroma and oxide mass?

Follow-up to `garment-stackopt` (track 6, `PROJECTS.md`; its "mass in the objective, giving a Pareto front of shift against mass and chroma" next step). `garment-stackopt` minimised angle shift with a chroma floor of C* 40 and no mass limit, and found the optimum used 1.8 to 2.5 times the quarter-wave oxide mass. Here the chroma floor and a mass cap are swept as constraints, and the best angle shift found in each cell is tabulated. Everything is a model on a CPU; no coating was made or measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-stackpareto/

**Builds on.** `research/garment-stackopt` and `research/garment-thincolor` (imported, not copied), which implement the standard characteristic-matrix method of thin films (Macleod, *Thin-Film Optical Filters*; Born and Wolf, *Principles of Optics*) and the Wyman, Sloan and Shirley (2013) colour-matching fit. The optimiser is SciPy Nelder-Mead with random restarts. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. No LLM is used. **Citation check.** No new references; those inherited carry the caveats stated in `garment-thincolor` (books cited from memory, editions unverified).

## Method (`src/garment_stackpareto/front.py`)
- Same design as `garment-stackopt`: 8 alternating layers (index 2.4 on top, 1.46), nylon-like substrate 1.53, thickness 20 to 250 nm, shift = mean dE76 at 15, 30, 45 degrees against normal incidence.
- Constraints as soft penalties: 5 per unit of C* below the floor, 1 per degree of hue error beyond 30 degrees from the quarter-wave stack's hue, 20 per g/m2 of oxide mass above the cap.
- Grid: 3 chroma floors x 4 mass caps (1.5, 2.0, 3.0, 4.0 g/m2) for each of two targets (620 nm and 450 nm quarter-wave stacks). Each cell: 5 seeds of Nelder-Mead restarts, 3000 objective calls each. A run counts as feasible only if all three constraints hold exactly; a cell reports its best feasible run.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-stackpareto
python3 -m pytest -q tests          # 4 tests
python3 experiments/run.py          # about 8 minutes on 4 cores; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; 5 seeds per cell, so every number is noisy)
Quarter-wave references: red 620 nm stack shift 12.4, C* 69.7, mass 2.03 g/m2; blue 450 nm stack shift 25.9, C* 53.1, mass 1.47 g/m2.

- **Mass is the binding constraint.** Red, C* floor 40: best shift 0.68 at a 4.0 g/m2 cap (5 of 5 runs feasible), 2.71 at 3.0 (2 of 5), and no feasible run at 2.0 or 1.5. At the same floor, cutting the cap from 4.0 to 3.0 raises the best shift about four-fold.
- **Chroma costs less than mass until the floor gets high.** Red at a 4.0 cap: 0.68 (floor 40), 0.73 (50), 2.84 (60). At a 3.0 cap: 2.71, 2.75, 9.04.
- **A tight mass cap can give nothing better than the plain stack.** Red, floor 60, cap 2.0 (about the quarter-wave stack's own mass, 2.03): best shift 13.88, slightly worse than the quarter-wave 12.4 at lower chroma 60 vs 69.7. With 3000 calls the optimiser did not find a better point there; that does not show none exists.
- Blue behaves similarly but is harder: floor 35 reaches 3.13 at a 4.0 cap; floor 42 gives 4.98; floor 50 is feasible in only 2 of 5 runs, with shift 10.79. Nothing is feasible at a 1.5 cap.
- "No feasible run" means 5 runs of this optimiser at this budget failed, not that the cell is infeasible.
- The script also prints the non-dominated cells over (shift, C*, mass). Every cell with a feasible run came out non-dominated (7 of 7 red, 6 of 6 blue), so that count says nothing here: with a coarse grid and noisy cell bests, the table above is the result, not a smooth front.
- The best-of-5 numbers favour the optimiser (the median is at least as high in every row), and they carry the same caveat as `garment-stackopt`: the optimiser may exploit the three-angle sample.

## Limitations
Stylised throughout: flat substrate, plane wave, constant recalled indices, equal-energy illuminant, dE76, mass as areal oxide mass only. Three angles, two targets, coarse grid, 5 seeds, one optimiser at one budget, soft penalties with untuned weights, so the cell optima are lower bounds on what a better search might find. No thickness tolerance (see `garment-stackrobust`: the nominal optima are fragile). Nothing here is a claim about a real fabric.

## Next steps
A proper multi-objective search (e.g. NSGA-II) in place of a constraint grid; more seeds and a smaller grid step near the knee; layer count as a variable; combine with the robust objective of `garment-stackrobust`; dispersion and absorption from published index data.

## Owner steps
Depositing and measuring a stack is a physical step for the owner. No price is given: I have no dated, sourced price list for coatings, so a bill of materials at about $300 / $1,000 / $3,000 is left to the owner.

## Outside dependencies (vitamins)
Python, numpy, SciPy, `garment-stackopt` and `garment-thincolor`. Refractive indices, densities and colour-matching coefficients come from outside the model.
