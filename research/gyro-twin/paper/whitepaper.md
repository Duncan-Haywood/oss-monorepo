# A gyro twin calibrated on white noise hides the bias random walk: heading error grows as t³ᐟ² not t¹ᐟ², and the re-alignment interval is 24× too long

## Question
A simulator of an inertial sensor is usually tuned on the short-averaging-time end of the Allan deviation (angle random walk, `N`). A real MEMS gyro also has a slowly wandering bias (rate random walk `K`). How wrong is a dead-reckoning twin that keeps only `N`, how does that change the re-alignment schedule and the cross-track error budget, and does fitting the twin at a single Allan-variance point repair it?

## Model
Continuous time: `θ' = b + N ξ`, `b' = K η` (`b(0) = 0`), `ξ, η` independent white noises. `N = 0.005 °/√s` (0.3 °/√h), `K = 10⁻⁴ °/s/√s`; I chose these as plausible for a consumer-grade MEMS gyro, not measured from a device. Twin: `K = 0`. Closed forms (derived here, checked against simulation below):
- heading variance `N²t + K²t³/3`; ratio to the twin `1 + (t/t*)²` with `t* = √3 N/K = 86.6 s`;
- Allan variance `N²/τ + K²τ/3`, minimised at `τ = t*`;
- cross-track error `y = v∫θ` at constant speed `v`: variance `v²(N²t³/3 + K²t⁵/20)`;
- a single-point fit at `τ₀` sets `N_fit² = N² + K²τ₀²/3`.
The discrete recursion used in Monte Carlo has exact heading variance `N²·dt·n + K²dt³(n−1)n(2n−1)/6`.

## Results
(all numbers from `experiments/results.txt`)
1. **Heading variance.** Monte Carlo (2000 paths, `dt = 0.5 s`) matches the exact discrete variance within sampling error (heading std 0.0769° vs 0.0762° at 100 s; 1.892° vs 1.832° at 1000 s, a 3% gap at about 2 standard errors). The real/twin variance ratio is 1.013 at 10 s, 2.33 at 100 s, 13.0 at 300 s and 134 at 1000 s, exactly `1 + (t/t*)²`.
2. **Allan deviation.** From one simulated 20 000 s record the overlapping Allan deviation matches the closed form within 3% for `τ` ≤ 10 s, is 7% low at 86.6 s and 100 s, and is 33% low at 1000 s (only about 10 independent cluster pairs there; I did not repeat with more records). The smallest value on my coarse grid is at 100 s, consistent with `t* = 86.6 s`.
3. **Re-alignment interval.** To keep 2σ of heading within 1°, the real sensor needs a re-alignment every 415.8 s; the white-only twin allows 10 000 s (24×), at which point the real error exceeds 1° with probability 0.986 instead of 0.0455. An Allan fit at `τ₀` = 1 or 10 s does not help (interval 9999 s and 9868 s): `K²τ₀²/3` is negligible against `N²` there.
4. **Single-point fit is exact at one horizon only.** Fitting at `τ₀ = 100 s` inflates `N` to 0.00764 °/√s (+53%); the twin/real variance ratio is 2.33 at 1 s, 1.75 at 50 s, 1.00 at 100 s, 0.179 at 300 s and 0.017 at 1000 s, so the twin is over-conservative below `τ₀` (variance 2.3× too large) and over-confident beyond it (5.6× too small at 300 s). Fitting at `τ₀ = 1000 s` gives a 74 s interval, 5.6× shorter than needed.
5. **Dead reckoning.** To keep the 2σ cross-track error within 1 m, the real sensor supports 266 m at 1 m/s and 631 m at 5 m/s; the white-only twin reports 462 m and 790 m (1.74× and 1.25× too far). Monte Carlo at 1 m/s, `t = 266 s`: cross-track std 0.505 m vs closed form 0.501 m; the twin would predict 0.219 m at the same time.

## Limitations
Linear-Gaussian model, a single axis, a single `(N, K)` pair chosen by me, bias starting at exactly zero (an unknown turn-on bias would add a `t²` term as in `odometry-twin`), no scale-factor error, temperature dependence, vibration rectification, or flicker (1/f) bias, which real devices show and which is not a random walk. Heading is not corrected by any aiding sensor; with an aided filter the bias is partly observable and the conclusions change. No real IMU data were used; the Allan check is on simulated data from the same model, so it verifies the algebra and code, not the physical realism of the model. The 1000 s Allan point is noisy (single record).

## Next steps
Add a bias-estimating filter and see how much of the `t³ᐟ²` growth a twin-tuned EKF would hide; fit `N, K` jointly from an Allan plot with confidence intervals; replace the model with recorded IMU logs; combine with `odometry-twin` (persistent bias) and `rendezvous-twin` (reset cost) for multi-robot mapping schedules.

## References
- IEEE Std 952-1997. *IEEE Standard Specification Format Guide and Test Procedure for Single-Axis Interferometric Fiber Optic Gyros* (Allan variance and random-walk terms).
- El-Sheimy, N., Hou, H. & Niu, X. (2008). Analysis and modeling of inertial sensors using Allan variance. *IEEE Trans. Instrumentation and Measurement* 57(1).
- Woodman, O. J. (2007). *An introduction to inertial navigation*. University of Cambridge Computer Laboratory Tech. Report UCAM-CL-TR-696.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
