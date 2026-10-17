# A loop-closure gate tuned in a too-clean odometry twin rejects the closures that would rescue it

*Stylised: a scalar position error. Between loop closures it gains real drift variance `R`; the twin the filter was tuned in says `T=0.25` (`R=ρ²T`); landmark noise `m=1`. Pure Python; every number is from `experiments/results.txt` (seeded Monte Carlo, 400 chains unless stated, 300 cycles with 60 discarded). The ungated real variance and the design-gate pass probability are exact closed forms.*

## Question
Simulated odometry is usually cleaner than real odometry. A mapper tuned in such a twin sets its innovation gate for loop closures from the twin's covariance. What does that do to accepted closures, real error, and robustness to aliased (wrong-place) closures, and how much real data repairs it? Related to the ARPG SLAM direction; no paper of that group is reproduced.

## Model
Each cycle the error grows, `e ← e + w`, `w~N(0,R)`. A closure gives `ν=e+v`, `v~N(0,m²)`; with probability π it is aliased and `ν` also carries `Δ~N(0,D²)`. The robot tracks `P` (predict `+T_f`, `T_f` the drift it believes), computes `K=P⁻/(P⁻+m²)`, and accepts iff `ν² ≤ g(P⁻+m²)`, `g` the χ²₁ quantile at 0.99 (6.635). Accepting sets `e←e−Kν`, `P←(1−K)P⁻`; rejecting leaves `e` and sets `P←P⁻`. The twin's stationary prior variance solves `x²−Tx−Tm²=0` (0.640), gain `K=0.390`, claimed posterior 0.390. If every closure is accepted the real posterior variance obeys `V=(1−K)²(V+R)+K²m²`, and a genuine closure passes the gate with probability `2Φ(√(g(x+m²)/(V+R+m²)))−1`.

## Results
1. **Exact, and the promise is missed.** Real ungated variance (exact / simulated / ratio to the claim 0.390): ρ=1 0.390/0.394/1.00×; ρ=1.5 0.575/0.578/1.47×; ρ=2 0.834/0.837/2.14×; ρ=3 1.573/1.577/4.03×; ρ=4 2.608/2.612/6.68×. A genuine closure passes the design-99% gate with probability 0.990/0.976/0.950/0.867/0.768 (exact, assuming all earlier closures were accepted). In the gated simulation the measured rate is lower (0.990/0.967/0.889/0.565/0.318), because rejections feed back.
2. **Lock-out.** Gate on, genuine closures only, real MSE (gated vs ungated) at horizons 150 and 600 cycles: ρ=1: 0.43 vs 0.39, no horizon dependence; ρ=1.5: 0.96–1.00 vs 0.58; ρ=2: 7.9→13.1 vs 0.84 (time with |error|>5m: 4.8%→5.4%); ρ=3: 88→287 vs 1.57 (30%→39%); ρ=4: 245→926 vs 2.61 (52%→65%). The robot's own covariance does grow under rejection (claimed variance 0.70→1.00 at ρ=2, 2.7→9.4 at ρ=3), but the real error grows faster (`R>T`), so the gate reopens too late for some chains and the average is dominated by them. The growth with horizon shows the process is not in a stationary regime over these horizons; the values are horizon-specific, not limits.
3. **Aliasing (π=0.1, D=6m).** With a correct twin (ρ=1) the gate cuts MSE 1.27→0.52 and passes only 41% of aliased closures. With ρ=2 the twin-tuned gate is 13.9 against 1.72 with no gate (8×); at ρ=3, 167.5 vs 2.45. Retuning the filter with the real drift and keeping the gate gives 1.52 (ρ=2) and 3.49 (ρ=3); with real tuning and no gate it is 2.25/2.94, so at ρ=3 the gate does not pay in this setup (aliased pass rate 58%, more than the twin gate's 31%, because the real gate is wider). The unrepaired twin's *no-gate* filter is the safest here (1.72/2.45), since its small gain also damps aliased offsets.
4. **Repair from real drifts (ρ=2, π=0.1).** Oracle MSE 1.32 (lost fraction 0.6%), unrepaired twin 11.6 (6.8%). Fitting `R̂` as the mean square of n measured cycle drifts (200 trials per n; `R̂` unbiased: mean `R̂/R` 1.00): mean/median/90th-percentile MSE 10.1/1.60/21.5 at n=3, 1.99/1.36/3.33 at n=10, 1.62/1.30/2.40 at n=30, 1.56/1.27/2.13 at n=100; the fraction of trials with more than 2% of time lost is 28%/13.5%/2.5%/2.0%, and `P(R̂<R/2)` is 31%/15%/0.5%/0. The median is nearly repaired by n=10 but the tail (an underestimate leaves the gate too tight) needs n≈30.

## Limitations
Scalar error, one landmark per cycle, i.i.d. Gaussian drift, aliasing as an independent Gaussian offset, a fixed 0.99 gate, one `T` and `m`; horizon-dependent lock-out statistics from Monte Carlo without a stationary analysis; a robust (switchable or max-mixture) back-end would change the aliasing comparison. Drift in the repair is measured against perfect ground truth. Not evidence about any real SLAM system.

## Next steps
A pose graph with heteroscedastic drift; analysis of the lock-out as a random walk with a state-dependent reset (recurrence and hitting times); an anytime-valid test for twin/real drift mismatch from accepted-closure statistics (`twin-audit`, `sequential-slashing`); randomising the twin's drift over a prior (`randomized-twin`); radar odometry noise from `radar-clutter-twin`.

## References
- Kalman, R. E. (1960). A new approach to linear filtering and prediction problems. *Journal of Basic Engineering* 82(1), 35–45.
- Bar-Shalom, Y., Li, X. R. & Kirubarajan, T. (2001). *Estimation with Applications to Tracking and Navigation*. Wiley.
- Mehra, R. K. (1970). On the identification of variances and adaptive Kalman filtering. *IEEE Transactions on Automatic Control* 15(2), 175–184.
- Sünderhauf, N. & Protzel, P. (2012). Switchable constraints for robust pose graph SLAM. *IROS*.
- Cadena, C. et al. (2016). Past, present, and future of simultaneous localization and mapping. *IEEE Transactions on Robotics* 32(6), 1309–1332.
