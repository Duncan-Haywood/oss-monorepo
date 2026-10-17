# simdesign-gaugerestart: do DE restarts remove the missed gauge-2 sub-search and the two mass groups?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5). `simdesign-gaugescatter` found that the price scatter of laser-cutting rules came from one missed sub-search at the narrow 2 mm gauge (1 seed in 20) and that feasible 2 mm results fall into two mass groups. Its next step was to re-search with more restarts. This project does that, at gauge 2 only. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary experiment.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugerestart/

**Builds on.** `research/simdesign-gaugescatter` (model, rules and optimiser copied into `src/simdesign_gaugerestart/` so the project stays self-contained; only the experiment script and tests differ), and through it `simdesign-filletfloor`, `simdesign-patchsearch` and `simdesign-dfm`. `research/simdesign-gaugemesh` found that every gauge-2 design feasible on the 2.5 mm search mesh is infeasible on finer meshes, so the gauge-2 region is itself a mesh effect; this project studies the search on the 2.5 mm mesh as defined, not the physics. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); SciPy's `differential_evolution` (Storn and Price, 1997, "Differential evolution – a simple and efficient heuristic for global optimization over continuous spaces", *Journal of Global Optimization* 11:341–359). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Laser cutting rules (steel sheet, fillet floor 0.2 mm) and the no-rules steel-sheet twin, gauge 2 mm, peak von Mises stress on the search mesh h = 2.5 mm, design variables (w, r). Seeds 0–19, three search variants (`experiments/restarts.py`):
- `base`: one differential-evolution run, population 4, 17 iterations (the per-gauge setting inside `optimise`);
- `restart2`: two independent `base` runs (seeds s and s + 1000), keep the lighter feasible one;
- `bigpop`: one run with population 8, 17 iterations, about the same number of finite-element solves as `restart2`.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugerestart
python -m pytest -q tests            # 5 tests, about 1 minute
python experiments/restarts.py       # restarts.txt, restarts.json (about 10 minutes on 4 cores)
```

## Results (from `experiments/restarts.txt`)
| variant | kind | missed of 20 | mean FE solves | lower group (< 34.65 g) | upper group |
|---|---|---|---|---|---|
| base | rules | 1 | 113 | 10 | 9 |
| base | twin | 0 | 117 | 10 | 10 |
| restart2 | rules | 0 | 228 | 14 | 6 |
| restart2 | twin | 0 | 229 | 15 | 5 |
| bigpop | rules | 0 | 235 | 17 | 3 |
| bigpop | twin | 0 | 242 | 19 | 1 |

- `base` reproduces the `simdesign-gaugescatter` numbers (one rules miss in 20, a 10/9 and 10/10 split), as it should for the same code and seeds.
- **Both remedies remove the miss at roughly twice the cost.** Neither `restart2` nor `bigpop` missed in 40 runs each (20 rules, 20 twin). Zero misses in 20 does not show the miss rate is zero; with one miss in 20 at baseline, the data cannot tell a reduced rate from a removed one.
- **The two mass groups look like search basins, not designs.** The share in the lower group rises from about half to 70–75% with a restart and to 85–95% with the larger population, and the best masses move down slightly (33.29–33.30 g against 33.32 g). The group split shrinking with search effort is consistent with the upper group being a local optimum of the penalised search. We did not inspect the (w, r) of the two groups, so this is not confirmed.
- **The price scatter at gauge 2 narrows.** The rules/twin mass ratio on matching seeds has sd 0.026 (base, 19 seeds where both are feasible), 0.012 (`restart2`) and 0.019 (`bigpop`), with means 1.002, 1.003 and 1.008. The base range 0.944–1.061 includes a seed where the rules run reached the lower group and the twin run did not. With 19–20 seeds per variant these sds are rough.

## Limitations
- Gauge 2 only, one process, one load case, one mesh (h = 2.5 mm), the peak stress measure. Twenty seeds per variant, and one restart count and one population size.
- The variants were matched on finite-element solves only approximately (228–242 against 113–117 for base); wall time was not compared.
- `simdesign-gaugemesh` showed the gauge-2 region is not feasible on finer meshes, so the "better" masses found here are better only on the 2.5 mm search mesh; they should not be read as better physical designs.
- Stylised 2D plane stress, assumed rule values and materials. Nothing was made or tested. Simulated results only.

## Next steps
Inspect (w, r) of the two groups to confirm they are two basins; run the full ten-gauge `optimise` with restarts or a larger population and report the overall price scatter; repeat on a mesh fine enough that gauge 2 is infeasible, to see whether the search then picks 3 mm reliably.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
