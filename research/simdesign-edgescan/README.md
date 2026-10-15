# simdesign-edgescan: how sharp is the feasible edge of the 2 mm laser-cut bracket web at 0.1 mm resolution, and is it mesh noise?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "rerun the scan with a 0.1 mm step near the feasible edge" next step of `simdesign-widerweb`. Produced with AI assistance (Claude). Everything is a stylised 2D plane-stress model with assumed rule values, materials and load; a small, preliminary experiment.

**Builds on.** `research/simdesign-widerweb` (model, rules and optimiser copied into `src/simdesign_edgescan/` so the project stays self-contained; only the experiment script and tests differ), and through it `simdesign-meshconverge`, `simdesign-pocketmesh`, `simdesign-gaugemesh` and `simdesign-dfm`. scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
Same model as `simdesign-widerweb`: laser cutting, steel sheet, gauge (depth b) 2 mm, peak von Mises limit 100 MPa, slenderness limit relaxed to 12.5 (arbitrary). Scan w = 15.5 to 17.5 mm in 0.1 mm steps (21 widths) at r = 8, 12 and 14 mm on meshes h = 1.5, 1.0 and 0.75 mm (189 solves). The "edge" is the smallest scanned w such that it and every scanned w above it are feasible. As a noise measure, for each (h, r) a quadratic is fitted to peak stress against w and the standard deviation of the residuals is reported (the scan window is short, so the true curve is nearly smooth; a quadratic is an assumption).

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib shapely pytest
cd research/simdesign-edgescan
python -m pytest -q tests          # 7 tests, a few seconds
python experiments/edgescan.py     # edgescan.txt, edgescan.json (about 45 seconds on 4 cores)
```

## Results (from `experiments/edgescan.txt`)
Edge width in mm (peak stress there, MPa):

| r (mm) | h = 1.5 | h = 1.0 | h = 0.75 |
|---|---|---|---|
| 8 | 16.5 (98.75) | 16.9 (99.13) | 17.0 (98.44) |
| 12 | 15.7 (98.00) | 16.2 (98.56) | 16.3 (98.59) |
| 14 | 15.6 (98.00) | 16.1 (98.60) | 16.0 (99.47) |

- **Peak stress is not monotone in w at this resolution.** In every one of the nine (h, r) series peak stress goes up with a wider web at some 0.1 mm steps (2 to 6 of 20 steps). The largest single upward step is 6.4 MPa (h = 1.5, r = 8 mm) and 0.6 MPa at the finest case (h = 0.75, r = 14 mm).
- **The jitter shrinks with refinement but not to zero.** Residual standard deviation about the quadratic trend: 2.4, 1.6, 1.8 MPa at h = 1.5; 1.7, 1.6, 1.5 MPa at h = 1.0; 1.4, 1.1, 0.9 MPa at h = 0.75 (r = 8, 12, 14 mm). The peak stress just below each edge is only 0.1 to 1.7 MPa above the 100 MPa limit, which is the same size as that noise. At r = 8 mm, h = 1.5, the feasibility flag changes between adjacent widths five times in the 21-point scan.
- **So the edge is a band, not a line.** The edge moves by +0.4 to +0.5 mm from h = 1.5 to 1.0 mm at all three radii and by -0.1 to +0.1 mm from 1.0 to 0.75 mm. The refinement effect reported in `simdesign-widerweb` (one 0.5 mm step) is of the same size as the jitter, so that project's "refinement raises the lightest feasible width" is not separated from mesh noise by this scan. Peak von Mises at a re-entrant corner is a singular-ish quantity, so some such noise is expected; this project does not identify its source (mesh topology changing with w is a candidate, not tested).

Full per-series lines:

```
laser cutting, gauge 2 mm, peak, slenderness limit 12.5; w 15.5-17.5 mm step 0.1
h=1.5 r= 8.0: edge w=16.5 (peak 98.75 MPa, 37.39 g); peak just below edge 101.24 MPa
    peak not decreasing in w at: [15.8, 16.2, 16.5, 17.3]
h=1.5 r=12.0: edge w=15.7 (peak 98.00 MPa, 36.05 g); peak just below edge 100.11 MPa
    peak not decreasing in w at: [15.7, 16.1, 16.3, 17.2]
h=1.5 r=14.0: edge w=15.6 (peak 98.00 MPa, 36.03 g); peak just below edge 100.09 MPa
    peak not decreasing in w at: [16.1, 16.3]
h=1.0 r= 8.0: edge w=16.9 (peak 99.13 MPa, 38.18 g); peak just below edge 101.61 MPa
    peak not decreasing in w at: [15.7, 16.4, 16.7, 17.4]
h=1.0 r=12.0: edge w=16.2 (peak 98.56 MPa, 37.06 g); peak just below edge 100.75 MPa
    peak not decreasing in w at: [15.6, 15.8, 16.6, 16.8]
h=1.0 r=14.0: edge w=16.1 (peak 98.60 MPa, 37.03 g); peak just below edge 100.74 MPa
    peak not decreasing in w at: [15.6, 15.7, 16.4, 16.6, 16.7, 17.4]
h=0.75 r= 8.0: edge w=17.0 (peak 98.44 MPa, 38.38 g); peak just below edge 101.00 MPa
    peak not decreasing in w at: [15.5, 16.1, 16.2, 16.8, 17.0]
h=0.75 r=12.0: edge w=16.3 (peak 98.59 MPa, 37.26 g); peak just below edge 100.88 MPa
    peak not decreasing in w at: [15.5, 16.1, 16.3, 16.9, 17.0]
h=0.75 r=14.0: edge w=16.0 (peak 99.47 MPa, 36.83 g); peak just below edge 101.64 MPa
    peak not decreasing in w at: [15.5, 16.2, 16.8, 17.0]
```

## Limitations
- The relaxed slenderness limit (12.5) is arbitrary; buckling is addressed separately in `simdesign-webbuckle`. Stylised 2D plane stress, assumed rule values, materials and load, one gauge, one load. Nothing was made or tested; simulated results only.
- The quadratic detrend is an assumption; the residual standard deviation mixes true curvature misfit with mesh noise. Three meshes cannot show convergence.
- Only the peak measure; no optimiser run; no check that smoother measures (for example a stress averaged over a patch) remove the jitter.

## Next steps
Repeat with a patch-averaged or nodally-smoothed stress measure to see whether the jitter, and so the edge band, collapses; test whether the mesh topology (element count) changes at the jumps; report the edge as an interval across several mesh offsets rather than one number.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material properties and the load are assumptions that real shop data would replace.
