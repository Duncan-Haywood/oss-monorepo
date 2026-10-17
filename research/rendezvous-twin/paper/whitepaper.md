# A white-noise odometry twin makes a mapping team rendezvous too rarely and understate its error

*Stylised: one-dimensional dead-reckoning error, `V(t)=s²t+b²t²` since the last reset, `s²=1`, rendezvous cost `c=50`, error cost `λ=1` per unit mean variance, budget `ε=3`. Pure Python; every number is from `experiments/results.txt`. The variance law is checked against Monte Carlo (40,000 runs per row) and the pairwise law against 30,000 simulated pairs.*

## Question
Robots that map together drift between rendezvous or loop closures. A digital twin of the team is typically fitted on short-horizon odometry increments, which look like white noise; a slowly varying or constant bias (calibration, wheel slip, gyro bias) is invisible there but dominates at long horizons. How wrong is the rendezvous schedule the twin plans, and how much long-horizon data fixes it? Variance-versus-averaging-time analysis of this kind is standard for inertial sensors (Allan 1966); the point here is the planning consequence for a team.

## Model
Error variance after `t` time units without a reset is `V(t)=s²t+b²t²`, where each run has an independent bias rate `~N(0,b²)`. Rendezvous every `T` has long-run cost `c/T+λ(s²T/2+b²T²/3)`. The twin (`b²=0`) picks `T_t=√(2c/(λs²))=10` and claims peak std `√(s²T)`; the real optimum solves `(2/3)λb²T³+(λs²/2)T²=c`. Under an error-budget rule `V(T)≤ε²` the twin gives `T=ε²/s²=9` and the real interval is `(−s²+√(s⁴+4b²ε²))/(2b²)`. For two robots with bias correlation `κ` the relative frame is `V_rel(t)=2s²t+2(1−κ)b²t²`. The dimensionless measure of the twin's blind spot is `ρ=b²T_t/s²`.

## Results
1. **The law holds.** Variance at `(t,b²)`: (1,0.1) 1.100 vs 1.090±0.008; (10,0.1) 20.000 vs 20.117±0.142; (10,0.3) 40.000 vs 39.831±0.285; (20,0.03) 32.000 vs 31.826±0.223.
2. **Claim and schedule (cost rule).** For `ρ`=0.1/0.3/1/3 the real optimum interval is 9.43/8.62/7.15/5.57 (0.94–0.56 of the twin's 10), i.e. 6%/16%/40%/80% more rendezvous. The real peak std at the twin's interval is 3.32/3.61/4.47/6.32 against the claim 3.16, exactly `√(1+ρ)` (1.05×–2.0×). Regret of the twin's interval is 0.19/1.35/8.65/34.55%. The twin is nearly right for small bias and its error grows fast once the quadratic term matches the linear one at the twin's own interval.
3. **Error budget.** With `ε=3` the twin's interval 9.0 is safe in the twin. For `b²`=0.01/0.03/0.1/0.3 the real interval is 8.31/7.37/5.72/4.06 and the real error exceeds the budget for 7.7/18.1/36.4/54.9% of each cycle; the peak std reaches 3.13/3.38/4.14/5.77.
4. **Shared bias cancels in the relative frame** (`b²=0.1`, pair). Twin regret with bias correlation `κ`=0/0.5/0.9/1 is 5.25/1.77/0.10/0.00%; the real optimum is 0.76/0.85/0.96/1.00 of the twin's interval. Robots of one make and calibration batch therefore need a much less biased twin than heterogeneous fleets — but absolute-frame claims (against a global reference) are still wrong by `√(1+ρ)`.
5. **Repair from ground-truth error at two lags** (`b²=0.1`, so `ρ=1`; method of moments from lag 1 and lag `L`, 400 replications, plan with the fitted `(ŝ²,b̂²)`). With `L=10`: mean regret 8.15/4.02/2.19/1.45/0.48/0.12% for `n`=3/5/10/20/50/200 runs, 95th percentile 32.3/14.6/9.0/6.1/1.8/0.4%. At `n=3` the fit is barely better than the twin on average (8.15% vs 8.65%) with a 32% tail; about `n=5–10` is needed to beat it reliably. `L=5` is worse at every `n` (e.g. 3.16% vs 2.19% at `n=10`). `b̂²` is biased slightly low (0.091 at `n=50`, `L=10`) because the lag-1 variance leaks `b²` into `ŝ²`.

## Limitations
One-dimensional Gaussian error; the bias is exactly constant within a run and independent across runs (real biases drift, giving a `t³` or Gauss–Markov term); the reset is perfect and free of measurement noise (which would add a constant to `V` and leave the optimum unchanged in this model); the cost is quadratic in variance; the repair assumes the two-parameter form and access to ground-truth error (motion capture or a simulator with truth), and the fitted-`b²` bias is not corrected. Not evidence about any real robot or SLAM system.

## Next steps
Gauss–Markov and random-walk-of-bias terms with Allan-variance identification; 2-D pose with heading error, where heading bias yields a cubic term; pose-graph rather than reset corrections; sequential testing for when the twin's `b²` is wrong (`twin-audit`); rendezvous events in a radar/lidar sensor twin (`radar-clutter-twin`).

## References
- Allan, D. W. (1966). Statistics of atomic frequency standards. *Proceedings of the IEEE* 54(2), 221–230.
- Thrun, S., Burgard, W. & Fox, D. (2005). *Probabilistic Robotics*. MIT Press.
