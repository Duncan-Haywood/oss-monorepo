# sensing-bak2: if the lens has a second radial term the solver does not model, does self-calibrating bundle adjustment still recover the surface?

Real lenses bend rays by more than one radial term. `sensing-bafocal` fitted `k1` to images rendered with exactly `k1`; this asks what happens when the rendering law (`k1`, `k2`) is richer than the fitted one. On the `sensing-ba` rig (12 views, 0.5 px noise, every camera pose wrong), **with `k1 = −0.2` and `k2` from −0.2 to +0.4, solving for the focal and `k1` only returns 0.0015 object radii in every case, the same as also solving for `k2`, against 0.0022 to 0.0030 with no distortion model. The lens parameters are not separately identified: the `k1` estimate sits near −0.16 whatever the true `k2`, and the `k2` estimate is about 0.16 below the truth. The gain disappears at 2 px of noise (0.0061 for all three), and at 6 views the focal is 4% off** (numpy and scipy; 5 tests).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/sensing-bak2/

**Builds on.** `sensing-bafocal` (solver and triangulation, imported unchanged), `sensing-ba` and `sensing-recon` (rig, pose perturbation, Umeyama scoring). Triggs, McLauchlan, Hartley and Fitzgibbon (2000), "Bundle adjustment: a modern synthesis", LNCS 1883; Brown (1966), "Decentering distortion of lenses", *Photogrammetric Engineering* 32(3), for the radial polynomial `x_d = x (1 + k1 r² + k2 r⁴)`. Solver: SciPy `least_squares` (trust-region reflective, sparse Jacobian pattern). Track 15 (`sensing`). No lab in `prompt.md` fits.

## Method
- **Images.** True focal 800 px, `x_d = x (1 + k1 r² + k2 r⁴)` on normalised coordinates, Gaussian pixel noise.
- **Four adjustments from the same wrong-pose triangulation** (made with the true focal and no distortion): `fixed` (focal held, no distortion), `none` (focal free), `k1` (focal and `k1` free), `k1k2` (focal, `k1`, `k2` free, the rendering model). 80 evaluations at most.
- **Scoring.** Mean distance to the exact surface after a similarity alignment to the true points. 6 seeds per cell, 300 features.
- **Sweeps.** (A) `k2` at `k1 = −0.2`; (B) `k1` with `k2 = +0.5|k1|` (barrel centre, pincushion edge); (C) pixel noise; (D) number of views.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/sensing-bak2
PYTHONPATH=src python -m pytest -q tests   # 5 tests
python experiments/run.py                  # writes experiments/results.txt (about 1 min)
```

## Results (from `experiments/results.txt`)
- **A one-term model absorbs a second term for surface accuracy.** At `k1 = −0.2`, `k2` of −0.2, −0.1, 0, +0.1, +0.2, +0.4: `k1` and `k1k2` both give 0.0015; `none` gives 0.0030 to 0.0024; `fixed` 0.0027 to 0.0022 (note `fixed` beats `none` here, a focal left free with no distortion model drifts to compensate).
- **The parameters are not identified separately.** `k1` from the `k1k2` fit is −0.158 in every row of A; its `k2` estimate tracks the truth but sits 0.155 to 0.168 below it. The `k1`-only fit estimates `k1` from −0.194 to −0.134 as `k2` goes from −0.2 to +0.4. Only a combination that fixes the image displacement over the sampled radii is constrained, so a calibration reported as (`k1`, `k2`) would not transfer to a rig with another field of view. The focal also ends 1.1% off in every row of A and B.
- **Larger `k1`, same picture (B).** From `k1 = −0.05` to −0.4 `fixed` rises 0.0015 to 0.0042 and `none` 0.0015 to 0.0049, while `k1` and `k1k2` stay at 0.0015 to 0.0016.
- **Noise removes the gain (C).** At 0.1 px: `fixed` 0.0020, `k1k2` 0.0003; 1 px: 0.0035 against 0.0030; 2 px: 0.0061 for `fixed`, `none`, `k1` and `k1k2`. The `k2` estimate is −0.44 against a true +0.1 at 2 px.
- **Views (D).** At 6 views `k1` 0.0024 and `k1k2` 0.0026 (focal 4.2% off); 8 views 0.0017; 24 views 0.0010, focal 0.2% off.
- **Why `k2` is invisible (`experiments/k2_pixels.py`, output in `k2_pixels.txt`).** Over the visible points of the rig the normalised radius reaches 0.337 (95th percentile 0.266). A `k2 = 0.2` moves a point by at most 0.69 px (95th percentile 0.21 px), against 6.10 px (3.01 px) for `k1 = 0.2`: `k2` is at or under the 0.5 px noise, which is why it cannot be separated from `k1` and why a one-term fit is enough on this narrow field of view. A wide-angle rig would change that.

## Tests
`k2 = 0` equals the `sensing-bafocal` projection; `k2` displaces edge points more than central ones; with the matched model `k1` is recovered to 0.05; `k1k2` beats ignoring distortion; runs are deterministic.

## Limitations
- **Synthetic, one object, no real images.** The `k1`, `k2` ranges are swept, not taken from a lens database or measured; no single figure applies.
- **Image field of view is small** (the object fills the middle of the frame), so `r⁴` is small and `k2` weakly constrained; a wide-angle lens with points near the corners would make the second term matter more and was not tried.
- **Surface error is tested, not downstream use.** If the calibration itself is the product, these results say the parameters are unreliable.
- One shared focal and `k1`, correct matches, good start for poses, six seeds; no decentring term or principal-point error.

## Next steps
Points placed near the image corners (a wide field of view), where `k2` should become identifiable; per-camera focal lengths; a principal-point offset; an openly licensed multi-view set with a known calibration.

## Owner steps
None needed.

## Outside dependencies
Open-source Python packages only (numpy, scipy; pytest to test).
