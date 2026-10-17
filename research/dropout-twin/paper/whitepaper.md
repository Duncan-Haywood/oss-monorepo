# A lidar twin that drops beams independently over-certifies thin-obstacle detection by a factor of four to eight in range when real dropout is clustered

*Stylised: one scan, a sequence of beams dropped as an i.i.d. Bernoulli(`p=0.10`) process in the twin and as a stationary two-state Markov chain with the same marginal `p` and lag-1 correlation `λ` in the "real" sensor; a thin obstacle covers `m` adjacent beams and is detected iff at least `k` return. Pure Python; every number is from `experiments/results.txt` (seeded, ~60 s). The "real" sensor is a simulation, not lidar data.*

## Question
Sensor twins for perception testing often model missing returns as independent per-beam Bernoulli dropout fitted to the overall dropout rate. Real dropout comes in bursts. A safety case then asks for the smallest obstacle the sensor reliably detects (equivalently, the farthest range at which a pole of fixed width still covers enough beams). How wrong is that width when the twin is right about the marginal rate, and what can be fitted from cheap logs to repair it?

## Model
Beams are dropped with chain `P(drop | previous dropped)=q=p+λ(1−p)`, `P(drop | previous returned)=r=p(1−λ)`, started at its stationary law, so the marginal is `p` and the lag-1 correlation `λ` for every beam; `λ=0` is the twin. Detection needs `≥k` returns among `m` adjacent beams. The exact miss probability is a DP over (state, returns so far). For `k=1` it is `p q^{m−1}` and the ratio to the i.i.d. value `p^m` is `(1+λ(1−p)/p)^{m−1}`, geometric in the width. The certified width `m*(δ)` is the smallest `m` with miss `≤δ`; at fixed angular resolution the detection range for a given obstacle size scales as `1/m`, so the range the twin claims over the range the real sensor supports is `m_real/m_twin`. The DP matches full enumeration (tests) and 200,000 simulated 720-beam scans with a random obstacle offset (e.g. `k=1,m=3,λ=0.6`: exact 0.04096, Monte Carlo 0.04160±0.00045; `k=2,m=10,λ=0.8`: 0.02484 vs 0.02463±0.00035).

## Results (`p=0.10`, `δ=10⁻³`)
1. **The certificate fails by one to two orders of magnitude.** The twin certifies `m=3` (`k=1`; miss exactly 0.001) or `m=5` (`k=2`; 0.00046). Real miss at that width is, for `λ`=0.3/0.6/0.8, 0.0137/0.0410/0.0672 (`k=1`; 14×/41×/67×) and 0.0101/0.0374/0.0658 (`k=2`; 22×/81×/143×). The marginal dropout rate is identical throughout.
2. **The detection range is over-claimed by `m_real/m_twin`.** The real sensor needs `m`=6/12/25 (`k=1`) and 8/14/27 (`k=2`), so the twin's range is 2.0×/4.0×/8.3× (`k=1`) and 1.6×/2.8×/5.4× (`k=2`) too long.
3. **Rarer targets are worse.** The ratio to the i.i.d. law is geometric in `m`: at `λ=0.6` it is 41× at `m=3`, 1.1×10⁴ at `m=6`, 7.4×10⁸ at `m=12`.
4. **Inflating the drop rate at one width does not transfer.** Choosing the i.i.d. rate `p'` to match the real miss at width `m₀` (`λ=0.6`): `m₀`=2/4/8 gives `p'`=0.25/0.40/0.51 and is wrong in opposite directions on either side of `m₀` (e.g. `m₀=4`: twin 0.065 vs real 0.041 at `m=3`, twin 4.2×10⁻³ vs real 1.1×10⁻² at `m=6`). The `m₀=4` twin certifies `m=8` at `δ=10⁻³`; the real miss there is 4.4×10⁻³ (real needs 12). Same lesson as safety-twin and odometry-twin: calibrating at one level does not fix a wrong shape.
5. **Repair from a flat-target log (`k=1`, `λ=0.6`, needs 12).** Unlike the odometry bias in `odometry-twin`, persistence *is* identifiable from one-step transition counts. Fitting `(q,r)` by MLE from an `n`-beam log gives the correct median width 12 at all `n` tested (200–20,000), but the certificate is discrete and `δ` sits between widths 11 (miss 1.7×10⁻³ at true parameters) and 12 (7.4×10⁻⁴), so the share of repeats whose real miss exceeds `δ` is 0.46/0.45/0.40/0.21 at `n`=200/1,000/5,000/20,000 (10th–90th percentile of real miss at `n=5,000`: 4.7×10⁻⁴–1.1×10⁻³). Adding two beams of width gives 0.31/0.12/0.01/0.00. A fit of `p` alone (the i.i.d. twin) certifies `m=3` in every repeat and fails in all of them. The fit is therefore not a guarantee at small `n`; the 2-beam margin is a hand-picked heuristic, not derived.

## Limitations
One scan, one obstacle, a 2-state chain along the beam index (real dropout also depends on range, incidence angle and reflectivity, and is correlated across scans, which would make repeated scans less helpful still); the "real" sensor is the same model family as the repair, so the repair experiment is optimistic about model-form error; `p`, `λ`, `k`, `δ` are chosen, not measured; range ∝ `1/m` ignores beam divergence and range-dependent dropout. Preliminary; no lidar data.

## Next steps
Persistence across scans (a chain in time as well as angle) and how many scans buy independence; a derived margin for the fitted width (a confidence set on `λ`); range-dependent dropout; scoring the twin's miss claim with proper scoring rules for tolerance quantities (`twin-elicitation`, `tail-risk-elicitation`); anytime-valid audit of the dropout law in the loop (`twin-audit`).

## References
- Gilbert, E. N. (1960). Capacity of a burst-noise channel. *Bell System Technical Journal* 39(5), 1253–1265.
- Elliott, E. O. (1963). Estimates of error rates for codes on burst-noise channels. *Bell System Technical Journal* 42(5), 1977–1997.
- Balakrishnan, N. & Koutras, M. V. (2002). *Runs and Scans with Applications*. Wiley.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
