# sensing-bapp: what does an unmodelled principal-point offset cost a self-calibrating bundle adjustment, and does a wide field of view help or hurt?

`sensing-bak2wide` listed a principal-point offset as the obvious next failure on the wide rig. This tests it. **On the wide rig (camera distance 2, f = 400 px) a true principal-point offset of 10 px that the solver holds at the image centre raises the surface error from 0.0019 to 0.0043 object radii and the fitted focal length ends 3.5% off (0.7% when the point is fitted); at 20 px it is 0.0079 and 10%. Fitting the principal point recovers `dx` to within 0.1 px and removes the cost (0.0019 at every offset). The narrow rig (distance 4, f = 800) is much less sensitive: 0.0019 against 0.0015 at 10 px. So a wider view makes the offset matter more, not less** (numpy and scipy; 3 tests).

**Live page:** https://marisstella.app/research/sensing-bapp/

**Builds on.** `sensing-bak2wide` (rig, `wide_rig`), `sensing-bak2` (scoring and the `k1`, `k2` law), `sensing-bafocal`, `sensing-ba`, `sensing-recon`. Brown (1966), "Decentering distortion of lenses", *Photogrammetric Engineering* 32(3); Triggs, McLauchlan, Hartley and Fitzgibbon (2000), "Bundle adjustment: a modern synthesis", LNCS 1883. Track 15 (`sensing`). No lab in `prompt.md` fits.

## Method
- Images are rendered with `x_d = x (1 + k1 r² + k2 r⁴)`, focal `f`, and the principal point at `(CX + dx, CY + dy)`; the offset is `(dx, dy) = (o, −0.8 o)` px so both axes are tested.
- Two adjustments start from the same wrong-pose triangulation (made at the nominal centre): `pp_held` fits focal, `k1`, `k2`, poses and points with the principal point at the centre (wrong when `o ≠ 0`); `pp_free` also fits `(dx, dy)` (the rendering model).
- Defaults as `sensing-bak2wide`: 12 views, 0.5 px noise, 300 features, every pose wrong, 6 seeds, error in object radii after a similarity alignment. `k1 = −0.2`, `k2 = +0.1`.
- Sweeps: (A) offset 0 to 20 px at distance 2 and 4; (B) distance 4 to 2 at 10 px; (C) pixel noise at distance 2, 10 px.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/sensing-bapp
PYTHONPATH=src python -m pytest -q tests   # 3 tests
python experiments/run.py                  # writes experiments/results.txt (several minutes)
```

## Results (from `experiments/results.txt`)
- **Cost of a held principal point (A).** Distance 2: `pp_held` surface error 0.0018 / 0.0019 / 0.0026 / 0.0043 / 0.0079 at offsets 0 / 2 / 5 / 10 / 20 px; `pp_free` 0.0019 throughout. Fitted focal error with the point held: 0.75%, 0.76%, 1.1%, 3.5%, 10.3%; with it fitted 0.7% at every offset. At distance 4: 0.0015 / 0.0015 / 0.0016 / 0.0019 / 0.0025 held, 0.0015 fitted; focal error 2.5% at 10 px and 4.7% at 20 px held.
- **The offset is recovered (A, C).** `dx` is recovered to within 0.1 px at every offset on the wide rig (standard deviation over seeds 0.4 px at 0.5 px noise, 2.1 px at 2 px noise). `dy` is pulled toward zero: the truth at 10 px is −8, the mean estimate −7.1, and at 20 px −16 against −15.1; at 2 px noise it is −4.6 at 10 px. The narrow rig is noisier (`dx` standard deviation 2.3 px).
- **Why the wide view hurts (B).** Held-point error at 10 px is 0.0019 at distance 4, 0.0025 at 3, 0.0032 at 2.5, 0.0043 at 2, while the fitted error stays 0.0015 to 0.0019. A short focal length turns a fixed pixel offset into a larger angle, and the held solver absorbs it into the poses and the focal length (focal error 2.5% to 4.1%).
- **`k2` under a held point (A, B).** At distance 2 the held-point `k2` drifts from +0.096 to +0.158 at 20 px (true +0.1); at distance 4, where `k2` is not identified (`sensing-bak2`), both fits give unstable values (−0.07 to −0.25).
- **Noise (C).** At 10 px and distance 2 the held/fitted errors are 0.0040/0.0004 at 0.1 px, 0.0043/0.0019 at 0.5, 0.0053/0.0039 at 1 and 0.0083/0.0079 at 2 px: by 2 px of noise the benefit of fitting the point is gone, because noise dominates.

## Tests
The projection shifts by exactly `(dx, dy)`; with no offset both fits agree and the fitted offset is within 3 px of zero; with a (10, −8) px offset the fit recovers it within 3 px and is no worse than the held fit.

## Limitations
- **Synthetic, one object, no real images**; lens and offset values are swept, not measured. Real principal points sit a few to tens of pixels from the centre, which is the swept range, but no calibration dataset was used.
- Offset is the same for all views (one camera); no decentring/tangential distortion, correct matches, good starting poses, 6 seeds (the standard deviations are over six).
- The closer camera adds perspective, so field of view and range are still not separated (as in `sensing-bak2wide`).

## Next steps
Tangential distortion beside the principal point; the same fit on an openly licensed multi-view set with a published calibration (not reachable from this container); a rig that widens the angle at a fixed range.

## Extension: tangential (decentring) distortion
`sensing-bapp` listed tangential distortion beside the principal point as its next step. This tests it. **On the wide rig (camera distance 2, f = 400 px) a true tangential coefficient of p1 = 0.01 (p2 = −0.008) that the solver sets to zero raises the surface error from 0.0018 to 0.0041 object radii, and 0.02 raises it to 0.0077; fitting p1, p2 recovers them (0.0086/−0.0080 at 0.01) and holds the error at 0.0018. The narrow rig (distance 4, f = 800) is half as sensitive (0.0015 → 0.0020 at 0.01, 0.0033 at 0.02), and an unmodelled p corrupts the fitted `k2` far more there (+0.45 against a truth of +0.10 at p = 0.02; the fitted-p `k2` stays at −0.16)** (numpy and scipy; 4 tests, in the extension section).

Second experiment in this directory (`src/sensing_bapp/batan.py`, `experiments/run_tan.py`, `experiments/results_tan.txt`, `tests/test_batan.py`). Model: Brown (1966), *Photogrammetric Engineering* 32(3), 444–462.

### Method
- Images are rendered with the Brown–Conrady model, `x_d = x s + 2 p1 x y + p2 (r² + 2x²)`, `y_d = y s + p1 (r² + 2y²) + 2 p2 x y`, `s = 1 + k1 r² + k2 r⁴`, then scaled by `f` about the image centre. The coefficients are `(p1, p2) = (p, −0.8 p)` so both are exercised.
- Two adjustments start from the same wrong-pose triangulation: `held` fits focal, `k1`, `k2`, poses and points with `p1 = p2 = 0`; `free` also fits `p1, p2` (the rendering model).
- Defaults as `sensing-bapp`: 12 views, 0.5 px noise, 300 features, every pose wrong, 8 seeds, `k1 = −0.2`, `k2 = +0.1`, error in object radii after a similarity alignment.
- Sweeps: (A) `p` 0 to 0.02 at distance 2 and 4; (B) distance 4 to 2 at `p = 0.01`; (C) pixel noise at distance 2, `p = 0.01`.

#### Reproduce
```bash
pip install numpy scipy pytest
cd research/sensing-bapp
PYTHONPATH=src python -m pytest -q tests   # 4 tests
python experiments/run_tan.py              # writes experiments/results_tan.txt (about 1 minute)
```

#### Results (from `experiments/results.txt`)
- **Cost of ignoring p (A).** Distance 2: held surface error 0.0018 / 0.0018 / 0.0019 / 0.0025 / 0.0041 / 0.0077 at `p` = 0 / 0.001 / 0.002 / 0.005 / 0.01 / 0.02; fitted 0.0018 throughout. Distance 4: held 0.0015 / 0.0015 / 0.0015 / 0.0016 / 0.0020 / 0.0033, fitted 0.0015. Below `p` ≈ 0.002 the cost is not visible at 0.5 px noise.
- **The coefficients are recovered (A).** The mean fitted `p1` is 0.0086 and `p2` −0.0080 for a truth of 0.0100 and −0.0080 at distance 2, and 0.0094/−0.0081 at distance 4 (standard deviation of `p1` over seeds 0.0016 and 0.0027). A slight bias in `p1` toward zero is present in this run (at `p` = 0 the mean `p1` is −0.0014, within one standard deviation); I did not test whether it is systematic.
- **A held p leaks into `k2` and the focal length (A).** At distance 4 the held `k2` goes −0.160 (p = 0), −0.071 (0.005), +0.065 (0.01), +0.452 (0.02) while the fitted `k2` stays at −0.16: the `k2` at that range is not identified (`sensing-bak2`), and the missing tangential term is absorbed into it. At distance 2 the held `k2` drifts less (+0.091 to +0.111). Held focal error rises from 0.5–0.8% to 4.2–4.4% at `p` = 0.02 on both rigs.
- **Wider view, larger cost (B).** Held error at `p` = 0.01 is 0.0020 at distance 4, 0.0025 at 3, 0.0028 at 2.5 and 0.0041 at 2, while fitted stays 0.0015 to 0.0018. The tangential displacement grows with the squared normalised radius, which is larger on the wide rig. As in `sensing-bapp`, the closer camera also changes perspective, so field of view and range are not separated.
- **Noise (C).** At distance 2, `p` = 0.01 the held/fitted errors are 0.0039/0.0004 at 0.1 px, 0.0041/0.0018 at 0.5, 0.0050/0.0037 at 1 and 0.0077/0.0074 at 2 px: by 2 px of noise the benefit of fitting p is gone.
- **Compared with the principal-point offset.** `sensing-bapp` found the same ordering (wide worse) with similar magnitudes at a 10 px offset (0.0043); the two effects are of comparable size in this simulation for the swept values, but nothing here says which one a real lens has more of.

#### Tests
Zero tangential terms reproduce the radial-only projection; the tangential displacement equals the Brown expression exactly; with no tangential distortion both fits agree and the fitted `p` is near zero; with `p1 = 0.01, p2 = −0.008` the fit recovers them to within 0.004 and is no worse than the held fit.

#### Limitations
- **Synthetic, one object, no real images**; `p` is swept, not measured. The swept range (0.001 to 0.02) is a plausible span for consumer lenses, but I did not source measured values from a calibration dataset or paper, so treat which end is realistic as open.
- Principal point is at the centre in both fits (the joint principal-point/tangential confound, known in the literature, is not tested here and is the obvious next case).
- One camera, correct matches, good-but-wrong starting poses, 8 seeds (the standard deviations are over eight).

#### Next steps
Fit principal point and `p1, p2` together on the same renders to measure their confound; the same fit on an openly licensed multi-view set with a published calibration (not reachable from this container); a rig that widens the angle at a fixed range.


## Owner steps
None needed.

## Outside dependencies
Open-source Python packages only (numpy, scipy; pytest to test).
