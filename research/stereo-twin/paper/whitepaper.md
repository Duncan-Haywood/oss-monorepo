# A Gaussian-depth stereo twin has the median right and the tails wrong, and averaging depth floors where averaging disparity converges

## Question
Simulators commonly model a stereo depth sensor as the true depth plus Gaussian noise whose standard deviation grows as `Z²σ/(fB)` (first-order error propagation of disparity noise `σ`). Real matchers add noise to *disparity*, and depth is its reciprocal. Once the twin's noise level has been calibrated, how wrong is the twin for the quantities a planner or learned policy actually uses: the frequency of large over-estimates of distance, the bias after averaging frames, and the frames lost at long range?

## Model
Rectified pair, focal length `f` px, baseline `B` m, `k = fB`. A point at depth `Z` has disparity `d0 = k/Z`. Real sensor: `d = d0 + σε`, `ε ~ N(0,1)`; depth `k/d` is reported only if `d ≥ d_min` (the matcher's search floor), otherwise "no match". Relative noise `s = σ/d0 = σZ/k`. Twin: `Z + (Z²σ/k)ε`, i.e. relative noise `s`, symmetric, unbounded. Numbers: `f = 700` px, `B = 0.12` m, `σ = 0.25` px, `d_min = 1` px (`k = 84` px·m, `Z_max = 84` m); these are chosen to be typical of a small stereo camera, not fitted to a device.

Exact results: `P(valid, depth ≤ z) = 1 − Φ((k/z − d0)/σ)`, so the median depth is `Z` (exactly, when the floor is far); `P(depth > Z(1+a)) = Φ(−a/((1+a)s)) − Φ((d_min−d0)/σ)`; `P(depth < Z(1−a)) = Φ(−a/((1−a)s))`; the twin gives `Φ(−a/s)` for both. Without the floor the mean depth does not exist (density of `d` at 0 is positive, `1/d` is not integrable); with the floor `E[depth^n | valid]` is a one-dimensional integral over disparity, evaluated by Simpson's rule (tests check it against simulation and its zeroth moment against 1). For small `s`, `E[depth]/Z − 1 ≈ s²`, and the harmonic estimator `k/mean(d)` over `N` looks has relative bias `≈ s²/N`.

## Results
(all numbers from `experiments/results.txt`; 200 000 looks per cell; averaging uses 4 000 trials)
1. **Median right, mean biased by about `s²`.** Exact median equals `Z` (5.000, 10.000, 20.000, 40.000 m; simulated within 0.014 m). The gated mean relative bias is +0.00022, +0.00089, +0.00358, +0.01482 at 5, 10, 20, 40 m, against `s²` = 0.00022, 0.00089, 0.00354, 0.01417. The twin's mean bias is 0.
2. **Over-estimates are more frequent than the twin says, under-estimates less.** At 40 m (`s = 0.119`), `P(depth > 1.25 Z)`: real 0.0465 (simulated 0.0459), twin 0.0179 (2.6×); `P(depth > 1.5 Z)`: real 0.00255, twin 0.00001 (191×); `P(depth < 0.75 Z)`: real 0.00256, twin 0.0179 (7× too many). At 20 m, `a = 0.25`: real 0.00039 vs twin 0.00001 (29×).
3. **Safety margin at twin mean + 3σ_Z.** Fraction of looks above the margin: 2.2× the twin's 0.00135 at 10 m, 4.0× at 20 m, 10× at 40 m (0.0135). At `k = 2` the factors are 1.3, 1.6, 2.3. At 60 m the margin lies beyond `Z_max` and the real fraction is 0 (k = 3) or below the twin's (k = 2: 0.0155 vs 0.0228).
4. **Matching the variance does not fix the tails.** A Gaussian with the real gated mean and sd gives, at 40 m, `P(> 1.25 Z)` 0.0315 against real 0.0465 (1.5×) and `P(> 1.5 Z)` 6·10⁻⁵ against 0.00255 (41×). At 60 m the matched Gaussian is *too high* at `a = 0.5` (0.00078 vs 0): the sign of the error depends on whether the floor binds.
5. **Range floor.** At 60 m `d0 = 1.4` px and 5.5% of looks are lost (the median of valid depths shifts to 59.27 m); the twin's Gaussian puts 1.25% beyond `Z_max`.
6. **Averaging.** At 40 m the relative RMS error of the mean of `N` depths goes 0.127, 0.065, 0.035, 0.022, 0.017, 0.015 for `N` = 1, 4, 16, 64, 256, 1024 (exact `√(bias²+var/N)` agrees to 4 digits) against the twin's 0.119 … 0.0037: the real error floors at the gated bias (0.0148). The harmonic estimator `k/mean(d)` goes 0.127 … 0.0038 (its bias +0.016, +0.0045, +0.0011, +0.00018 vs `s²/N` 0.014, 0.0035, 0.0009, 0.0002), and the sample median depth 0.127 … 0.0047. **Negative at 60 m:** with 5.5% of looks lost, conditioning on valid looks truncates the disparity distribution and the harmonic estimator floors at a bias of −0.0206 (RMS 0.0211 at `N` = 1024); there the mean of depths is smaller (0.0062) only because the floor cuts the heavy tail, and the twin's prediction (0.0056) is by coincidence close.

## Limitations
Stylised, no camera data. Disparity noise is Gaussian, independent between looks, and homoscedastic; real block-matching errors include pixel locking, correlated and outlier (false-match) errors, occlusion and textureless regions, which this model excludes, so the real tails are likely heavier than shown. Calibration error (baseline, principal point) is a bias in `d0` that averaging cannot remove and is not modelled. A twin that adds noise in disparity space and inverts reproduces everything here by construction; the point is what the common depth-space shortcut loses. The thresholds are for one parameter set; the gate (`d_min`) matters and flips signs near `Z_max`.

## Next steps
Heteroscedastic/outlier disparity noise fitted to a matcher's confidence; a stopping-distance policy trained in each twin and scored against the disparity-space system (`twin-certification` style); pair with `range-twin` and `lens-twin`.

## References
- Matthies, L. & Shafer, S. A. (1987). Error modeling in stereo navigation. *IEEE Journal of Robotics and Automation* RA-3(3), 239–248.
- Hartley, R. & Zisserman, A. (2003). *Multiple View Geometry in Computer Vision*, 2nd ed. Cambridge University Press.
- Scharstein, D. & Szeliski, R. (2002). A taxonomy and evaluation of dense two-frame stereo correspondence algorithms. *International Journal of Computer Vision* 47, 7–42.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
