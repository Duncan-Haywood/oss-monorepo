# simdesign-holepatch: does a patch-averaged stress give a mesh-converged stress concentration for a bolt hole?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking up a next step of `simdesign-patchstress`: apply the patch-averaged stress measure to `simdesign-holes`. A strip in tension with a central circular hole is solved by finite elements on a mesh sequence, and the pointwise peak of sigma_xx is compared with its average over a small disc, for hole sizes d/W = 0.05 to 0.4. The patch values are also compared with Kirsch's analytic field. Produced with AI assistance (Claude). Stylised and linear elastic; nothing was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-holepatch/

**Builds on.** `research/simdesign-holes` (mesh and loading, imported by relative path, not copied) and `research/simdesign-patchstress` (the patch measure). scikit-fem (Gustafsson and McBain, *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). The reference is Kirsch's solution for a circular hole in an infinite plate (Kirsch, 1898, *Zeitschrift des Vereines deutscher Ingenieure* 42:797–807; citation from memory, not re-verified; I coded the polar-stress formulas from memory and checked them only through the tests below). This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `src/simdesign_holepatch/field.py`: the `simdesign-holes` strip (W = 60 mm, modelled length 4W, steel-like E and nu, load 2000 N, thickness 3 mm; the thickness and material drop out of Kt) is solved with P2 triangles, and sigma_xx is read at 3 quadrature points per element with area weights, away from the clamped end (within W of mid-length).
- **Patch measure:** the largest area-weighted mean of sigma_xx over a disc of radius rho, with discs centred on the 150 highest quadrature points. rho is a fraction of the hole radius a: 0.1, 0.25, 0.5 (0 is the pointwise peak). Kt_gross is the measure over the gross stress T/(W t).
- **Reference:** Kirsch's sigma_xx for an infinite plate, averaged over the same disc centred on the stress maximum (0, a), clipped to r > a (midpoint rule, 400 x 400). Its pointwise peak is exactly 3.
- Mesh sequence: 48, 96, 192, 384, 768 points around the hole (the `simdesign-holes` default is 192). Deterministic; no random numbers.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib pytest
cd research/simdesign-holepatch
python -m pytest -q tests          # 6 tests, a few seconds
python experiments/run.py          # about 10 s; writes experiments/results.txt and results.json
```

## Results (from `experiments/results.txt`)
- **For a hole, the pointwise peak is already nearly settled.** Between 384 and 768 points around the hole it changes by 0.3% (0.4% at d/W = 0.4); the patch measures change by 0.0–0.1%. So the drift that motivated the patch measure in `simdesign-patchstress` (18–41% for the L-bracket fillet) is much weaker here. A smooth hole has no sharp feature, so this is a smaller problem than the bracket's, not evidence that the patch is needed.
- **The patch measure agrees with Kirsch at small d/W.** At d/W = 0.05 and 768 points, Kt_gross is 2.999 (peak), 2.729, 2.386 and 1.954 for rho/a = 0, 0.1, 0.25, 0.5; Kirsch's infinite-plate disc averages are 3.000, 2.723, 2.377, 1.948 (differences 0.0–0.4%; the finite strip adds a small width effect at d/W = 0.05).
- **The patch is not conservative.** At d/W = 0.05, rho/a = 0.1, 0.25 and 0.5 read 91%, 80% and 65% of the peak, a knock-down that is a geometric fact about a field falling away from a hole, not a mesh error. A stress limit written for the peak needs a different limit on a patch measure, as `simdesign-patchstress` found.
- **Coarse meshes: the patch does not remove bad meshes.** At d/W = 0.4 the 96-point mesh is an outlier for every measure (peak 3.284, against 3.561 at 48 and 3.695 at 192; patch 0.5 gives 2.149, against 2.309 and 2.322). I did not diagnose it; a Delaunay mesh artefact is likely but not shown. Single-point jumps of this size on a coarse mesh are why a two-mesh comparison is not enough.
- At d/W = 0.4 the peak Kt_gross is 3.73 on the finest mesh. This is not compared with a published chart here.

## Limitations
- Linear plane stress, one hole, centred; no bolt contact, bearing load, fatigue or notch sensitivity. A patch average is a stand-in for a design rule, and no allowable on it is calibrated here, so it must not be used to size a real part.
- Patch centres are restricted to the 150 highest points; for this smooth field the maximum is at the hole edge, but I did not test other counts.
- One strip width, one Poisson ratio, one mesh generator; the 0.4 outlier shows mesh dependence I did not explain.
- The Kirsch comparison is for an infinite plate; the finite-width strip differs, and the closest case is d/W = 0.05. The formulas were written from memory (see above), though the tests check the exact edge values 3 and 0 and the far-field limit.

## Next steps
Find the cause of the d/W = 0.4, 96-point outlier (a graded mesh with fixed topology would help). Calibrate a patch limit for the hole against a published finite-width chart whose source is checked first. Apply the patch measure in the `simdesign-holes` sizing search.

## Owner steps
Test coupons with holes to calibrate an allowable on a patch measure (a physical test, not done).

## Outside dependencies (vitamins)
numpy, scipy, scikit-fem, matplotlib (pip) and the sibling `simdesign-holes` source tree (relative path). Nothing else.
