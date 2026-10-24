# sensing-bak2wide: does a wide field of view make the second radial lens term identifiable in self-calibrating bundle adjustment?

`sensing-bak2` found that on a narrow-field rig the second radial term `k2` is invisible: a one-term fit does as well and the (`k1`, `k2`) pair is not recovered. Its limitations and next steps named the cure, points near the image corners. This tests it. **Moving the camera in (distance 4 to 2) and shortening the focal length with it (800 to 400 px), so the object keeps its pixel size but the largest normalised radius goes from 0.34 to 0.85, the spread of the fitted `k2` over seeds falls from 0.33 to 0.02 and its mean sits within 0.01 of the true +0.1 from distance 2.5 on. Fitting `k2` then matters for the surface: at distance 2 a `k1`-only fit gives 0.0027 object radii against 0.0020 with `k2` (and 0.0082 to 0.0118 with no distortion model), and at `k2 = −0.2` the gap is 0.0055 against 0.0022** (numpy and scipy; 4 tests).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/sensing-bak2wide/

**Builds on.** `sensing-bak2` (solver, scoring and the `k2` law, imported unchanged), with `sensing-bafocal`, `sensing-ba` and `sensing-recon` beneath it. Brown (1966), "Decentering distortion of lenses", *Photogrammetric Engineering* 32(3), for `x_d = x (1 + k1 r² + k2 r⁴)`; Triggs, McLauchlan, Hartley and Fitzgibbon (2000), "Bundle adjustment: a modern synthesis", LNCS 1883. Track 15 (`sensing`). No lab in `prompt.md` fits.

## Method
- **A wider rig without a new object.** `wide_rig(dist)` sets the camera distance to `dist` and the focal length to `200 × dist` px in every module that holds them (`sensing_recon.recon`, `sensing_bak2.bak2`). `dist = 4`, `f = 800` is exactly the `sensing-bak2` rig (a test checks the two give identical numbers). The object keeps about the same pixel size, so only the angle of view changes. The 640 × 480 image and its half-diagonal (400 px) are fixed, so the corners sit at normalised radius `400 / f`: 0.5 at `f = 800`, 1.0 at `f = 400`.
- **Same four adjustments as `sensing-bak2`** from the same wrong-pose triangulation: `fixed`, `none`, `k1`, `k1k2`. Everything else as there: 12 views, 0.5 px noise, 300 features, 6 seeds, error in object radii after a similarity alignment.
- **Sweeps.** (A) camera distance 4 to 2 at `k1 = −0.2`, `k2 = +0.1`; (B) `k2` from −0.2 to +0.4 at distance 2; (C) pixel noise at distance 2.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/sensing-bak2wide
PYTHONPATH=src python -m pytest -q tests   # 4 tests
python experiments/run.py                  # writes experiments/results.txt (about 3 min)
```

## Results (from `experiments/results.txt`)
- **Radius reached (A).** The largest normalised radius of a visible point is 0.34, 0.47, 0.61, 0.73, 0.85 at distances 4, 3, 2.5, 2.2, 2.0 (95th percentile 0.27 to 0.62). The `r⁴` term grows by the fourth power of that, about 40 times between the ends.
- **`k2` becomes identified (A).** The fitted `k2` over 6 seeds has standard deviation 0.331 at distance 4 (mean −0.06, truth +0.1), 0.091 at 3, 0.025 at 2.5 and 0.017 to 0.022 at 2.2 and 2.0; its mean is +0.095 to +0.105 from 2.5 on. The `k1` estimate is −0.192 to −0.195 (truth −0.2), against −0.158 on the narrow rig. The focal ends 0.6% off at distance 2, down from 1.1%.
- **The surface needs `k2` now (A, B).** Surface error with `k1` only against `k1`, `k2`: 0.0015 / 0.0015 at distance 4 (no difference), 0.0017 / 0.0017 at 3, 0.0020 / 0.0018 at 2.2, 0.0027 / 0.0020 at 2. Ignoring distortion costs 0.0082 to 0.0118 at distance 2, against 0.0024 to 0.0027 on the narrow rig. At distance 2 the `k1`-only error depends on the true `k2`: 0.0055 at −0.2, 0.0021 at 0, 0.0035 at +0.2, 0.0047 at +0.4, while the two-term fit holds 0.0019 to 0.0022.
- **Noise (C).** At distance 2 with the true model `k1k2` is 0.0004 at 0.1 px, 0.0020 at 0.5 px, 0.0041 at 1 px and 0.0081 at 2 px, `k1` only 0.0016, 0.0027, 0.0045, 0.0083. The `k2` estimate stays near truth (+0.101 to +0.119) with standard deviation 0.005 to 0.082, so at 2 px it is the noise, not the identifiability, that limits it.
- **Cost.** The wider view sees fewer points (3,676 against 5,927 visible observations over 6 scenes), and triangulation from the wrong poses gets worse (`tri` 0.0128 to 0.0164); the adjustment still ends well under it.

## Tests
`wide_rig` restores every constant; distance 4 reproduces `sensing-bak2` exactly; a closer camera reaches a larger radius; at distance 2.5 the fitted `k2` is within 0.1 of truth.

## Limitations
- **Synthetic, one object, no real images**, and the lens values are swept, not measured. The wide rig is a closer camera, so perspective distortion of the bumpy ellipsoid rises with the radius; field of view and range change together and this does not separate them.
- **Distortion only on the rendering side is radial**; no decentring, no principal-point error and one focal shared by all views. A wrong principal point would trade with `k1` and `k2` and is the obvious next failure.
- Correct matches, good starting poses, six seeds; the standard deviations are over only six.

## Next steps
A principal-point offset and per-camera focals on the wide rig; the same fit on an openly licensed multi-view set with a published calibration (not reachable from this container, whose egress allows few hosts); a rig that widens the angle of view at a fixed range, to separate it from perspective.

## Owner steps
None needed.

## Outside dependencies
Open-source Python packages only (numpy, scipy; pytest to test).
