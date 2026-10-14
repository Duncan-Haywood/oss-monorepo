# Loop-closure twin: what does a too-clean odometry twin do to a SLAM loop-closure gate?

Pure Python, no dependencies. A SLAM back end accepts a candidate loop closure when its squared residual is below a gate `g`. True closures have residual `N(0, s²I)`; false ones (perceptual aliasing) have `N(0, (s²+τ²)I)`. The cost is `A·P(reject true) + B·P(accept false)`. The digital twin's odometry noise is `s_t = 0.10 m` per axis; the gate it optimises (closed form for a 2-D residual, `g = 2 s² v/τ² · ln(A v/(B s²))`, `v = s²+τ²`) has radius 0.278 m and claims a cost of 0.094 (2.1% of true closures rejected). Results (stylised): if the real residual is twice as noisy (`ρ = 2`) that gate rejects 38.2% of true closures (exact; Monte Carlo 38.0%), the real cost is 0.416 = 4.4× the claim, and regret against the real-optimal gate is 61.8% (ρ = 3: 54%); a gate designed at α = 1% rejects `α^{1/ρ²}` of true closures (31.6% at ρ = 2). A too-pessimistic twin (ρ = 0.5) is not safe either: its gate misses the optimum by 145% while the claimed cost overstates reality. The damage depends on how costly a false closure is (regret 396% of optimum at `c_false = 2`, 3% at 100, and the gate degenerates to "reject all" by 1000). Re-fitting the residual variance from `n` ground-truthed real closures cuts expected regret to 6% of the twin's at n = 10 and below 1% at n = 59; a fixed inflation factor is only right when the guess matches the truth. See `paper/whitepaper.md`.

```bash
cd research/loopclosure-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~5 s; output in experiments/results.txt
```

**Builds on.** The multi-robot mapping, SLAM and sim-to-real-for-perception direction of the ARPG lab (<https://arpg.colorado.edu/>); no specific ARPG paper is reproduced and nothing here is affiliated with or endorsed by that lab. The gating rule is the standard chi-square (Mahalanobis) compatibility test (Bar-Shalom & Fortmann 1988; Neira & Tardós 2001, *IEEE Trans. Robotics & Automation* 17(6)); false closures from aliasing and robust back ends are surveyed in Cadena et al. (2016, *IEEE T-RO* 32(6)) and Sünderhauf & Protzel (2012, IROS). Companion to `occupancy-twin`, `radar-clutter-twin` (sensor twins) and `latency-twin` in this repository.

Stylised: isotropic Gaussian residuals in 2-D (3-D checked by Monte Carlo only), known false-closure offset scale τ, known costs and prior, a hard gate rather than a robust kernel, no pose-graph optimisation, and no real or simulated odometry logs. MIT.
