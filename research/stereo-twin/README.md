# Stereo twin: a Gaussian-depth-noise stereo twin has the median right and the tails wrong, and averaging depth floors where averaging disparity converges

Pure Python, no dependencies. Real system: rectified stereo pair (`f = 700` px, `B = 0.12` m, `σ = 0.25` px disparity noise, matches only for disparity ≥ 1 px, so `Z_max = 84` m). Depth is the reciprocal of a noisy disparity. The twin adds Gaussian noise to depth with the linearised sd `Z²σ/(fB)`. Results (all from `experiments/results.txt`; exact formulas checked against simulation): (1) the median depth is exactly `Z` but the mean (gated at the matcher floor; ungated it does not exist) is biased by `≈ s²`, `s = σZ/(fB)`: +0.0036 at 20 m, +0.0148 at 40 m, where the twin says 0; (2) over-estimates of distance are more frequent than the twin says and under-estimates less: at 40 m `P(depth > 1.25 Z)` is 0.0465 vs 0.0179 (2.6×), `P(depth > 1.5 Z)` 0.00255 vs 10⁻⁵ (191×), `P(depth < 0.75 Z)` 0.0026 vs 0.0179; (3) a safety margin at twin mean + 3σ is exceeded 2.2×, 4.0× and 10× as often as the twin's 0.00135 at 10, 20 and 40 m; (4) matching the real variance does not fix this (41× on the 1.5 Z tail at 40 m); (5) averaging `N` frames: mean depth floors at the bias (relative RMS 0.0153 at `N = 1024`, 40 m) against the twin's 0.0037, while `k/mean(disparity)` converges (0.0038); **negative:** at 60 m, where 5.5% of looks are lost to the floor, the harmonic estimator floors at −2.1% bias and the effects above change sign or vanish.

```bash
cd research/stereo-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 14 tests, about 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 7 s; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>) and the digital-twin simulation-fidelity direction of RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Stereo error propagation is classical (Matthies & Shafer 1987; Hartley & Zisserman 2003; Scharstein & Szeliski 2002). Companion to `glint-twin`, `range-twin` and `lens-twin` (what a simplified sensor twin gets wrong about the statistics, not just the mean).

Stylised: simulated "real" system, no camera data; Gaussian, independent, homoscedastic disparity noise with no outliers, pixel locking, occlusion or calibration error; one parameter set. A twin that adds noise in disparity space reproduces the real system by construction. MIT.
