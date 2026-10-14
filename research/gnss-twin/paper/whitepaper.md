# A white-noise twin of satellite positioning: geometry, bias propagation, the averaging gap, and integrity-test calibration under correlated multipath

## Question
Simulators of outdoor robots typically render GNSS as the true position plus white noise. A planner, filter or safety case tuned on that twin assumes (a) an error scale set by constellation geometry, (b) that averaging fixes shrinks error as `1/√T`, and (c) that a residual-based integrity test has its nominal false-alarm rate. Real pseudorange errors include multipath, which is persistent in time and differs by satellite. Which of (a)–(c) survive, and how large are the failures?

## Model
Unknowns `(x, y, b)` (position and clock). Satellite `i` at azimuth `θᵢ` gives the linearised row `hᵢ = (cos θᵢ, sin θᵢ, 1)` and measurement error `eᵢ`; the fix error is `(HᵀH)⁻¹Hᵀe`. Twin: `eᵢ ~ N(0, σ²)` iid, `σ = 1`. Real: `eᵢ` adds multipath, either a constant bias on one satellite or independent stationary AR(1) processes (marginal std `s`, lag-1 correlation `ρ`) on every satellite. "Evenly spread" means `n` azimuths at `2πi/n`, for which `Σcos = Σsin = Σcos sin = 0`, `Σcos² = Σsin² = n/2`, hence `HᵀH = diag(n/2, n/2, n)`. Everything is 2-D, linearised about the truth, pure Python.

## Results
(all numbers from `experiments/results.txt`)
1. **Geometry.** Evenly spread: `E‖position error‖² = σ²(Qxx+Qyy) = 4σ²/n`, so HDOP `= √(4/n)`: 1.000, 0.8165, 0.7071, 0.5774 for n = 4, 6, 8, 12, with Monte Carlo rms (20 000 draws) 0.9979, 0.8173, 0.7088, 0.5783. Eight satellites over a 360°, 180°, 90°, 60° arc give HDOP 0.71, 1.28, 4.25, 9.25, so a twin whose constellation is optimistic about sky view is optimistic by an order of magnitude in urban canyons.
2. **Bias propagation.** A range bias `b` on satellite `i` gives position error `(2b/n)(cos θᵢ, sin θᵢ)` and clock error `b/n`, verified to machine precision for n = 6, 8, 12 (for b = 5: 1.6667, 1.2500, 0.8333 m). It does not depend on `σ` and is not reduced by averaging. A reflecting building that biases one satellite therefore shifts the solution toward that satellite, which a white-noise twin never produces.
3. **Averaging.** With AR(1) multipath, `ρ = 0.99`, `s = 2 m` on all 8 satellites, the `T`-epoch mean has per-satellite variance `σ²/T + s² g(T,ρ)`, `g = (1/T²)[T + 2Σₖ(T−k)ρᵏ]`. Horizontal rms by simulation (1500 runs) against the twin's `1/√T` law: T = 1: 1.58 vs 0.71; T = 10: 1.44 vs 0.22; T = 100: 1.23 vs 0.07; T = 500: 0.80 vs 0.03 (exact 1.58, 1.41, 1.21, 0.80). Averaging one second of data at 100 Hz buys almost nothing when multipath decorrelates over ~100 epochs. The Monte Carlo at T = 10 is 2% above the exact value, which is within the sampling error of 1500 runs.
4. **Calibrated radius.** Suppose the twin is calibrated on single epochs (total variance `σ²+s²`, so it is correct at T = 1) and then claims the white-noise shrinkage for the mean. The claimed 95% circle covers `1 − 0.05^{v_twin/v_real}` of real fixes: 0.950, 0.314, 0.050 at T = 1, 10, 100 (simulated 0.950, 0.332, 0.051 over 3000 runs). Matching on the calibration statistic does not protect the quantity that is used downstream.
5. **Integrity test.** With `n = 9` the post-fit residual statistic has 6 degrees of freedom; a threshold for 1% false alarms under the twin (16.81 σ²) alarms at `P(χ²₆ > 16.81/(1+(s/σ)²))` when iid multipath of relative size `s/σ` is added: 0.0100, 0.0364, 0.2098, 0.7622 for s/σ = 0, 0.5, 1, 2 (simulated 0.0101, 0.0357, 0.2102, 0.7604). A bias on one satellite raises the mean statistic by exactly `b²(1 − 3/n)` (mean 12.06 vs exact 12.00 at b = 3; 29.97 vs 30.00 at b = 6) and is detected 19% and 91% of the time, while the position error it causes is `2b/n` = 0.67 and 1.33 at those settings. So detection is nearly blind to errors that matter at small `b`, and the twin-tuned threshold is unusable when multipath is widespread. I do not claim this is the actual RAIM test of any receiver.

## Limitations
2-D linearised geometry; constellations are evenly spread or a single arc; multipath is stationary Gaussian AR(1) with known parameters, not the intermittent, geometry-dependent errors of a real urban canyon; no ionosphere, troposphere, ephemeris error, carrier phase, or filter dynamics. The twin variants are fixed by construction, not fitted to data, and nothing here was compared with recorded pseudoranges, so no number transfers to a receiver.

## Next steps
Fit `(ρ, s)` from logged pseudoranges and check the closed forms against them; carry the multipath correlation into an EKF with an IMU and ask how the innovation-consistency test behaves (link to `twin-monitor`); elevation-dependent multipath variance; twin certification that reports coverage at the averaging horizon the planner actually uses.

## References
- Misra, P. & Enge, P. (2011). *Global Positioning System: Signals, Measurements, and Performance*, 2nd ed. Ganga-Jamuna Press.
- Parkinson, B. W. & Axelrad, P. (1988). Autonomous GPS integrity monitoring using the pseudorange residual. *Navigation* 35(2), 255–274.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
