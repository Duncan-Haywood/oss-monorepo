# A twin with Gaussian range noise understates localisation error 4–7×: non-line-of-sight bias, a variance law, and a trimming fix

*Stylised: 2-D ring of anchors, exponential NLOS excess path, Gaussian base noise, linearised error model checked against Gauss–Newton fixes. Pure Python; every number is from `experiments/results.txt` (seeded, ~1 min). The "real" site is itself simulated; no UWB, radar or lidar data. Negative results are reported as such.*

## Question
Range-based localisation (UWB anchors, radar or lidar beacons) is simulated in a twin by drawing each range as true distance plus Gaussian noise. Real sites also have non-line-of-sight (NLOS) ranges, which are biased long. How wrong is the twin's position error, when does the error become a bias rather than extra spread, and how much does a cheap robust fix recover?

## Model
`n` anchors at unit directions `u_i` from the tag. With range errors `e_i`, the linearised least-squares (LS) position error is `(HᵀH)⁻¹Hᵀe`, `H` the matrix of unit vectors. The twin has `e_i ~ N(0,σ²)`, so rms error `σ·GDOP`, GDOP = `√tr(HᵀH)⁻¹` (`2/√n` on a centred ring). The real site adds, w.p. `p` per range, an Exp(mean `m`) excess. Then (i) with iid NLOS the excess has variance `p(2−p)m²`, so rms error is `GDOP·√(σ²+p(2−p)m²)`; (ii) with anchor-dependent mean excess `μ_i` the bias is `(HᵀH)⁻¹Hᵀμ`, zero on a centred ring if `μ_i` is uniform. Fixes are Gauss–Newton LS and a trimmed fix that drops the largest-residual anchor once or twice and refits.

## Results (σ=0.3 m, m=3 m, ring radius 50 m, 20 000 draws unless noted)
1. **Variance law holds; the twin is off by 4–7×.** n=6: twin 0.245 m, law 1.095 / 1.766 m, simulated 1.105 / 1.793 m at p=0.1 / 0.3 (ratio 4.5× / 7.3×). n=4 and n=12 agree with the law to 2% and show the same ratios (4.4–4.6× at p=0.1, 7.3–7.4× at p=0.3). Uniform NLOS leaves the mean at zero (|mean| ≤ 0.013 m): it is a spread problem, and adding anchors only scales it down by `√n`.
2. **Structured NLOS is a bias, and the linear formula predicts it.** n=8 ring, the first `k` adjacent anchors always NLOS with mean excess 2 m: predicted bias 0.500, 0.924, 1.207 m for k=1,2,3; simulated mean (−0.501,0.001), (−0.861,−0.352), (−0.859,−0.872), i.e. within about 0.02 m per coordinate. The twin predicts zero. A single blocked anchor shifts the fix by `2μ/n`.
3. **Safety sizing.** To keep 95% of fixes inside 1 m, the twin says 4 anchors at every p. Simulating the NLOS site (2000 draws per size, first size reaching the target, so ±a few anchors of noise) needs 28 anchors at p=0.1 and 46 at p=0.2. A twin-sized 4-anchor ring at p=0.2 has a 95th-percentile error of 4.11 m and leaves the corridor 34.7% of the time against the intended 5%.
4. **Trimming pays, at a price when there is no NLOS** (n=8, rms m): p=0: LS 0.212, drop-1 0.263, drop-2 0.307; p=0.1: 0.947, 0.414, 0.345; p=0.2: 1.304, 0.697, 0.521; p=0.4: 1.753, 1.232, 1.087. The 95th-percentile error at p=0.1 falls 2.11→0.74 m (drop-1). The premium when NLOS is absent is 24% (drop-1) to 45% (drop-2); trimming a known-good site is a loss.

## Limitations
Linearised around the true position; results 1–2 are checked against full Gauss–Newton fixes but only at the ring centre and for 4–12 anchors. NLOS is iid per range and exponential; real NLOS is spatially correlated with geometry (result 2 is the only place this enters) and often has a minimum excess. The trimmed fix is a simple largest-residual rule with no outlier test, and with few anchors it cannot identify which range is wrong. Finding 3 uses 2000 draws per candidate size and a first-crossing search, so the counts 28 and 46 are approximate. No real data, no estimation of `p` or `m` from logs.

## Next steps
Estimate `p` and `m` from a short calibration walk and size the anchor count with an upper confidence bound (cf. `fusion-twin`); NLOS maps from a geometry-aware radar/lidar simulator instead of iid draws; sequential-residual tests (cf. `sequential-slashing` machinery) for NLOS detection; joint fixes with odometry (`odometry-twin`).

## References
- Guvenc, I. & Chong, C.-C. (2009). A survey on TOA based wireless localization and NLOS mitigation techniques. *IEEE Communications Surveys & Tutorials* 11(3), 107–124.
- Langley, R. B. (1999). Dilution of precision. *GPS World* 10(5), 52–59.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
