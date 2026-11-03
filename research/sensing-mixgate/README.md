# sensing-mixgate: does the epipolar gate help bundle adjustment under the mismatch mix a real SIFT matcher produces?

`sensing-epigate` found that an epipolar gate was no better than a RANSAC start against its *invented* mismatches, and `sensing-matchreal` then measured what real SIFT mismatches look like. This project closes the loop the second one left open: it runs the epigate trial with each measured mix (mismatch rate and the share of along-epipolar, near and far errors at each ratio-test threshold). **Headline: on the measured mixes the gate plus a Cauchy loss is the best of three methods at ratio tests of 0.8 and tighter (0.0078 against 0.0207 for a RANSAC start at 0.8; 0.0026 against 0.0032 at 0.6), and worse than the RANSAC start only at a loose 0.9 ratio test (0.130 against 0.082), where every method is above 0.08 object radii.** It is the opposite of the ordering `sensing-epigate` reported at 10% uniform mismatches, The 24-seed rerun shows the all-uniform control (table B) does not reproduce that earlier picture: the gate still wins at 0.8 and tighter.

**Live page:** https://marisstella.app/research/sensing-mixgate/

Lab tag: none fits (ARPG does perception; this builds on none of its work). Builds on `sensing-epigate` (rig, gate, trial) and `sensing-matchreal` (the measured mixes).

## Method
- **Mixes (from `sensing-matchreal/experiments/results.txt`, table A: Middlebury 2014 Motorcycle, OpenCV SIFT, no mutual check).** ratio test, mismatch rate, share along / near / far: none 0.563, 0.064/0.098/0.838; 0.9: 0.233, 0.187/0.211/0.602; 0.8: 0.102, 0.386/0.287/0.327; 0.7: 0.061, 0.623/0.264/0.113; 0.6: 0.047, 0.743/0.229/0.029.
- **Trial.** `sensing_epigate.run_trial` unchanged (12-view orbit, 300 features, 0.5 px noise, pose error 0.5 deg / 0.02 radii, gate 2 px Sampson, vote 0.5, 6 seeds). Only the mismatch generator is replaced: each corrupted observation is `along` (10 to 40 px on a random other view's epipolar line), `near` (10 to 40 px, random direction) or `far` (uniform random pixel) with the measured shares. The patch is restored after each trial.
- **Controls.** Same rates with all-uniform mismatches (B) and all-along mismatches (C).
- **Methods.** `cauchy`: Cauchy bundle adjustment from the all-view triangulation; `ri_cauchy`: RANSAC pair triangulation start then Cauchy; `g_cauchy`: epipolar gate, then Cauchy. Error is surface error in object radii on the same points; `clean_ba` is the floor (0.0014).

## Reproduce
```bash
pip install numpy scipy matplotlib pytest
cd research/sensing-mixgate
PYTHONPATH=src:../sensing-baoutlier/src python -m pytest -q tests   # 4 tests
PYTHONPATH=src python experiments/run.py                           # about 6 minutes on 4 cores, writes experiments/results.txt
python experiments/figure.py                                       # writes experiments/error_vs_ratio.svg
```

## Results (from `experiments/results.txt`; mean of 6 seeds)
A. Measured mixes:

| ratio | rate | cauchy | RANSAC start | gate + cauchy | gate recall | good lost |
|---|---|---|---|---|---|---|
| none | 0.563 | 0.857 | 0.720 | 0.813 | 0.69 | 0.66 |
| 0.9 | 0.233 | 0.257 | 0.082 | 0.130 | 0.83 | 0.21 |
| 0.8 | 0.102 | 0.427 | 0.021 | 0.0078 | 0.84 | 0.05 |
| 0.7 | 0.061 | 0.013 | 0.0058 | 0.0033 | 0.84 | 0.02 |
| 0.6 | 0.047 | 0.0057 | 0.0032 | 0.0026 | 0.83 | 0.02 |

- **At ratio tests people use (0.8 and tighter) the gate wins.** Its recall stays at 0.83 to 0.84 on the measured mixes, because the mixes are dominated by near and along errors, which it removes at 0.79 to 0.87 (`sensing-epigate`), while it fails more on a pure-uniform population at the same rates (table B, noisy, see below).
- **Plain Cauchy is the weakest** at 0.8 (0.43) even with 10% mismatches; the start matters more than the loss, as in `sensing-baoutlier`.
- **No method works with no ratio test** (56% wrong; the gate loses 66% of good observations and covers 43% of the points). The conclusion is a preprocessing one: use the ratio test; the gate then adds a modest, consistent gain.
- **At the tightest tests all three are within 0.0032 of each other** and about 2 times the floor, so little is left to gain.
- **Table B (all uniform, same rates) is erratic** (gate+cauchy 0.354, 0.126, 0.0055, 0.107 at 0.9 to 0.6): with 6 seeds a single failed seed dominates a mean, so the ordering among methods there is not established; I report it as a control, not a result. Table C (all along) has the gate at or beside the best at every ratio test except none (0.051 against 0.040), so even the "worst case" for an epipolar test is not bad for the gate-then-robust pipeline, because along-line errors of 10 to 40 px are mild for a robust loss (0.0025 to 0.0055 at ratio 0.8 and tighter).

![Surface error against ratio-test threshold for three pipelines](experiments/error_vs_ratio.svg)

## 24-seed rerun (from `experiments/results_seeds.txt`; medians with 95% bootstrap intervals)
`python experiments/run_seeds.py 24` (about 45 minutes on 4 cores) reruns all three tables with 24 seeds and reports the median, a bootstrap interval of the median, the share of seeds above 0.05 object radii ("fail") and in how many seeds the gate beats the RANSAC start. Per-seed scores are in `results_seeds.json`.

| ratio | rate | Cauchy | RANSAC start | gate + Cauchy | gate beats RANSAC start in |
|---|---|---|---|---|---|
| 0.9 | 0.233 | 0.186 [0.148, 0.439] | 0.071 [0.039, 0.084] | 0.057 [0.047, 0.098] | 11/24 |
| 0.8 | 0.102 | 0.178 [0.043, 0.426] | 0.0106 [0.0082, 0.023] | 0.0084 [0.0057, 0.013] | 17/24 |
| 0.7 | 0.061 | 0.0107 [0.0084, 0.014] | 0.0052 [0.0044, 0.0082] | 0.0036 [0.0030, 0.0048] | 20/24 |
| 0.6 | 0.047 | 0.0043 [0.0037, 0.0053] | 0.0040 [0.0032, 0.0046] | 0.0029 [0.0027, 0.0031] | 19/24 |

- **The ordering holds at ratio tests of 0.8 and tighter, with a smaller margin than 6 seeds suggested.** The gate wins in 17 to 20 of 24 seeds; the intervals of the two methods overlap at 0.8 (0.0057 to 0.013 against 0.0082 to 0.023) and separate only at 0.7 and 0.6. At 0.9 they are indistinguishable (11 of 24) and about 58% of seeds fail for both.
- **Plain Cauchy is the weakest** at 0.9 and 0.8 (median 0.18 with an interval from 0.04 to 0.43; 58% of seeds fail at 0.8).
- **Table B (all uniform) was not erratic once there were 24 seeds, and it corrects a claim above.** The gate still beats the RANSAC start at 0.8 to 0.6 (19, 18 and 17 of 24 seeds; medians 0.017, 0.0080 and 0.0075 against 0.030, 0.018 and 0.019). So the gate's advantage here is not specific to the measured mix; the earlier statement that this control "reproduces the `sensing-epigate` picture" (gate no better than a RANSAC start) came from 6-seed means and does not survive. Compare with `sensing-epigate`, which found no gain at a flat 10% uniform rate; the settings differ in pose error and seeds, which I did not reconcile.
- **Table C (all along) agrees**: the gate is best at 0.9 to 0.6 (20 to 23 of 24 seeds), and loses only with no ratio test.

## Tests
Mixes are distributions; the mixed generator corrupts only visible observations at the requested rate and leaves the rest bit-identical; shares select the displacement kind (10 to 40 px for near and along, beyond 60 px for far); `run_mixed` restores the epigate generator and returns finite scores.

## Limitations
- **The mixes come from one scene and one detector** (Motorcycle, SIFT). ORB, learned matchers, other scenes and wide baselines may differ (`sensing-matchreal` limitations).
- **The geometry is synthetic** (an orbit rig, my object); only the mismatch mix is measured. Applying a stereo-pair mix to a 12-view orbit assumes the same error kinds and offsets, and `near`/`along` use epigate's 10 to 40 px rather than the measured 14 to 17 px medians. Real mismatches are also correlated within tracks and clustered by texture, which independent draws ignore.
- **Mismatches are drawn independently per observation** at the pair's rate; matches that survive a ratio test in one view are not conditioned on the others.
- **Main tables: 6 seeds, no intervals (the 24-seed rerun above adds them);** differences below about a factor of two (for example 0.0033 against 0.0026) are not distinguishable here. The gate settings are untuned.
- The 24-seed intervals are bootstrap intervals of the median over seeds on one synthetic rig; they do not cover scene, detector or gate-setting variation.

## Next steps
Draw mismatches as texture-clustered tracks; take the mix from more scenes and from ORB; tune the gate threshold per ratio test.

## Owner steps
Capture a turntable image set of a known object, run COLMAP's matcher and bundle adjustment with and without a fundamental-matrix gate, and compare against a scanned reference. No hardware was bought or specified.

## Outside dependencies
Open-source Python packages only (numpy, scipy; matplotlib and pytest to plot and test). Nothing is downloaded; the mixes are copied from `sensing-matchreal`'s committed results.
