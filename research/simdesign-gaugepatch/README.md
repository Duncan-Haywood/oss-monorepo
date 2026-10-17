# simdesign-gaugepatch: does a patch-averaged stress make the 2 mm laser-cut bracket region mesh-independent?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5). `simdesign-gaugemesh` found that the 39 gauge-2 bracket designs feasible on the 2.5 mm search mesh all fail the stress limit on finer meshes, because the element-centroid peak stress keeps rising, and listed "a patch/regularised stress measure" as an open step. This project tests that. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load. Preliminary, simulated only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-gaugepatch/

**Builds on.** `research/simdesign-gaugemesh` (same 39 designs, same solver) and, through it, `simdesign-gaugescatter`, `simdesign-patchsearch` (which introduced the patch measure and its 3 mm radius), `simdesign-dfm` and `simdesign-bracket`. The model, rules and measures are copied into `src/simdesign_gaugepatch/` so the project stays self-contained; only the experiment script and tests differ. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
The 39 gauge-2 designs (19 laser rules, 20 no-rules steel twin) are read from `simdesign-gaugescatter/experiments/miss_rate.json` and re-solved at h = 2.5, 1.5, 1.0 and 0.75 mm (P2 triangles, same load and 4 mm tip limit). On each solution the code records the element-centroid peak and the *patch measure*: the largest area-weighted mean of element-centroid von Mises stress over a disc of radius rho, for rho = 1, 2, 3 and 5 mm (`measures.py`, outside the clamp zone). Feasibility is also evaluated with the patch measure at rho = 3 mm (`PATCH_RHO` in `dfm.py`), against the same 100 MPa limit.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-gaugepatch
python -m pytest -q tests          # 4 tests
python experiments/run.py          # results.txt, results.json (about 25 s)
```

## Results (from `experiments/results.txt`)
Median stress in MPa at h = 2.5 / 1.5 / 1.0 / 0.75 mm, and the range over designs of the ratio of the h = 0.75 value to the h = 1.0 value (rules designs; the no-rules twin is within 0.003 on the median ratios and listed in the file):

| measure | median MPa by h | ratio h0.75 / h1.0 (min–max) |
|---|---|---|
| centroid peak | 99.3 / 109.9 / 117.0 / 120.9 | 1.007–1.092 |
| patch, rho = 1 mm | 99.0 / 100.5 / 111.0 / 110.9 | 0.972–1.044 |
| patch, rho = 2 mm | 91.1 / 94.3 / 95.1 / 98.2 | 0.983–1.033 |
| patch, rho = 3 mm | 81.1 / 84.2 / 85.2 / 86.3 | 0.991–1.022 |
| patch, rho = 5 mm | 68.6 / 72.0 / 72.3 / 72.7 | 0.990–1.014 |

- **The patch measure settles with the mesh; the centroid peak does not.** For rho = 3 mm the value changes by at most 2.2% between h = 1.0 and 0.75 mm in all 39 designs, against up to 9.7% (and always upward) for the centroid peak. Smaller discs converge less well (rho = 1 mm: up to 4.4%, in both directions).
- **All 39 designs stay feasible under the rho = 3 mm patch measure at every mesh size** (19/19 rules, 20/20 twin at each h), with a median patch stress of 84–86 MPa on the finest mesh. By construction they were selected on the coarse centroid peak, so this is a statement about those designs, not about the best design.
- **Same designs, different verdict.** Under the centroid peak 0 of 39 are feasible at h ≤ 1.5 mm (`simdesign-gaugemesh`). The verdict flips because the criterion changes, not because the model does: the patch measure averages over a region and is a less strict rule than a pointwise peak.

## Limitations
- The 100 MPa limit was set with the centroid peak in mind. Whether a 3 mm patch average against 100 MPa is an adequate design rule (for example for fatigue or for a notch-sensitive material) is not shown; a pointwise peak at a fillet is a stress concentration that real parts can be sensitive to.
- No design search was run with the patch measure, so the fine-mesh minimum mass and the true feasible region at gauge 2 (or thinner) are unknown.
- Convergence is judged from four mesh sizes and a ratio, with no order estimate. The cause of the centroid peak's slow convergence (junction singularity, sampling, mesher) was not identified.
- One load case, 2D plane stress, assumed rule values and materials. Nothing was made or tested.

## Next steps
Re-run the gauge search with the rho = 3 mm patch measure on a fine mesh (h ≤ 1.0 mm) and report the minimum mass and gauge against the coarse-mesh centroid result; add a graded refinement at the fillet tangent point to decide whether the pointwise peak has a finite limit.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
