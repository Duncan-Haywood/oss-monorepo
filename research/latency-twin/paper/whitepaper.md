# Latency twin: what a twin that omits sensor delay does to a tuned controller

*Stylised: scalar plant `x⁺ = a x + b u + w`, `w ~ N(0, 1)`, cost `E[x² + r u²]`, `a = 1.1, b = 1, r = 1`; the controller reads `x_{t−d}`. Pure Python; 8 tests in `tests/`; every number below is printed by `experiments/run.py` into `experiments/results.txt`. Nothing is tuned.*

## Question
Simulators often give the controller its measurement instantly, while real sensing stacks (camera, lidar, radar processing, network) add tens of milliseconds. A policy or gain tuned in such a twin is a sim-to-real transfer problem in which the missing physics is latency. How much delay does a twin-tuned gain tolerate, what does the resulting mismatch cost, and how many real samples are needed to find the delay?

## Setup
The twin has `d̂ = 0`, so its LQR gain is `k0 = abP/(r+b²P)` with `P` the scalar Riccati solution (`k0 = 0.7034`). The real loop applies `u_t = −k x_{t−d}`. A delay-aware twin uses a `d̂`-step predictor `x̂ = a^{d̂} y + Σ a^{d̂−1−j} b u_{t−d̂+j}`. Closed-loop costs are exact: the loop is written on the stacked state `[x_t…x_{t−m}, u_{t−1}…u_{t−m}]` and the stationary covariance is obtained from the Lyapunov equation by doubling (`cost`). With the correct delay the cost has the closed form `σ²[P + (r+b²P)K² Σ_{j<d} a^{2j}]` (`smith_cost`); the Lyapunov cost matches it to 8 decimal places and matches a 4·10⁵-step simulation within 3% (tests).

## Results
1. **Exact stable-gain interval.** For a static gain on the delayed reading the characteristic polynomial is `z^{d+1} − a z^d + bk`. The lower edge is `(a−1)/b` for every `d` (root at `z=1`). The upper edge is the smallest `√(1+a²−2a cos ω)/b` over solutions of `dω + arg(e^{iω}−a) = π (mod 2π)` (unit-circle crossing), or `(1+a)/b` for `d=0`; for `d=1` it is exactly `1/b`. Tests confirm the spectral radius crosses 1 at both edges for `d = 0…4`. Intervals for `a = 1.1`: `(0.1, 2.1), (0.1, 1.0), (0.1, 0.591), (0.1, 0.408), (0.1, 0.305), (0.1, 0.239)` for `d = 0…5`.
2. **The twin-tuned gain has a one-step delay margin here.** `k0 = 0.703` is stable at `d = 1` (cost 5.08 vs the delay-aware optimum 3.15, **1.61×**) and unstable for `d ≥ 2` (spectral radius 1.05, 1.12, 1.14, 1.15 for `d = 2…5`). Across plants `a = 1.02, 1.05, 1.1, 1.2` the margin is 1; at `a = 1.5` and `2.0` it is 0 (the twin's LQR gain already exceeds the `d=1` edge `1/b`). Margins were checked against brute-force spectral radii for three plants (test).
3. **Retuning the static gain helps but does not close the gap.** Best static gain per delay `0.449, 0.316, 0.242, 0.197, 0.167` for `d = 1…5`, costing `1.13×, 1.34×, 1.62×, 2.02×, 2.63×` the predictor-based optimum; the gap grows because a delayed static feedback cannot use its own past inputs.
4. **Predictor mismatch is brittle.** With `d̂ ≠ d` the cost ratio is finite only for `(d̂,d) = (0,1)` (1.61×) and `(1,3)` (35×; a narrow stable island); all other off-diagonal cells in `0 ≤ d̂,d ≤ 5` are unstable. Overestimating the delay is not a safe direction for this plant.
5. **Identifying the delay.** With an i.i.d. probe of variance `s_u²`, known `a, b`, and least-squares choice between lags, the confusion probability of adjacent lags is `≈ Φ(−√(n / (2(1+1/snr))))`, `snr = b²s_u²/σ²`, i.e. `n ≈ z²·2(1+1/snr)` (a Gaussian approximation to the sum of squared-error differences). It needs `54, 22, 14` samples at `snr = 0.25, 1, 4` for `α = 10⁻²` and `96, 38, 24` for `α = 10⁻³`. Monte Carlo (4000 runs) is at or below the formula (for example `0.021` vs `0.057` at `snr=1, n=10`), so it is conservative at small `n`.

## Limitations
Scalar, exactly-known plant; integer delay; the identification experiment assumes an independent probe, not closed-loop data; one plant in the tables and the non-monotone island in item 4 is a property of this plant and not a general law. Continuous-time or jittering delay, multi-state plants and actuator delay are not treated. The results describe the model only and say nothing about a real simulator or sensor.

## Relevance
Measurement latency is a structural property a digital twin has to expose, not a noise level: omitting it turns a 1.6× cost penalty into instability within one step, and a wrongly specified predictor is not a safe repair. The cheap real-data check is a short probe experiment, which for moderate SNR needs tens of samples.

## References
- Smith, O. J. M. (1957). Closed control of loops with dead time. *Chem. Eng. Prog.* 53(5).
- Åström, K. J., Wittenmark, B. (1997). *Computer-Controlled Systems*, 3rd ed. Prentice Hall.
- Companion projects in this repo: `twin-transfer`, `twin-upkeep`, `occupancy-twin`.
