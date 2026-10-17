# Real data or more simulation? A fixed budget for a fitted digital twin, and why a simulation-only interval fails

*Stylised: the M/M/1 waiting time of a shared lab instrument (service rate 1), fitted from exponential data drawn from a simulated "real" system. Pure Python; every number is from `experiments/results.txt` (seeded, ~1.5 min). No lab data. Negative results are reported as such.*

## Question
A twin fitted to `n` real observations and simulated for `m` jobs has two error sources: input error (shrinks with `n` only) and simulation noise (shrinks with `m` only). `input-twin` measured the first. Given one budget, how should it be split, and what goes wrong if only the second is reported?

## Model
Real system M/M/1, `λ=ρ`, `μ=1`, mean wait `W=ρ/(1−ρ)`. The twin uses MLE rates from `n` interarrival and `n` service times and is simulated for `m` jobs by the Lindley recursion, started from the fitted stationary law (so the run mean is unbiased for the twin's wait). To first order the relative variance of the estimate about `W` is `a(ρ)/n + b(ρ)/m`, with `a=(1+(2−ρ)²)/(1−ρ)²` (delta method, exponential MLEs) and `b=(2+5ρ−4ρ²+ρ³)/(ρ(1−ρ)²)`, i.e. Whitt's asymptotic variance `ρ(2+5ρ−4ρ²+ρ³)/(1−ρ)⁴` of the mean delay divided by `W²`. With a real pair costing 2 units and a job `κ` units, minimising under `2n+κm=B` gives `f*=√(2a)/(√(2a)+√(κb))` as the share on real data and minimum variance `(√(2a)+√(κb))²/B`. A simulation-only interval (10 stationary replications of `m/10` jobs, t-interval) covers `W` with normal-theory probability `2Φ(1.96/√(1+r))−1`, `r=(a/n)/(b/m)`. The input-aware interval adds `Ŵ²a(ρ̂)/n` to the simulation variance.

## Results
1. **`b` is right**: simulated `m·Var/W²` is 30.4 vs 29.0 (ρ=0.5) and 61.2 vs 61.6 (ρ=0.7), 600 runs of 4000 jobs (standard error about 6%).
2. **Exchange rate.** `b/a` = 2.71, 2.23, 2.06, 2.03, 2.01, 2.00 at ρ = 0.3, 0.5, 0.7, 0.8, 0.9, 0.95: one real pair is worth about two simulated jobs at any load. Because a pair costs two observations, real data wins per unit cost when `κ` is above roughly a third, and simulation wins below it — but the optimum is interior, never a corner.
3. **Optimal split** (B=1000): real-data share 0.97 / 0.90 / 0.81 / 0.57 at κ = 0.001 / 0.01 / 0.05 / 0.5 (ρ=0.5; ρ=0.8 gives 0.97 / 0.91 / 0.82 / 0.58). Variance penalty of a 50/50 split: 1.87× / 1.65× / 1.38× / 1.02× (ρ=0.5); of putting 95% on simulation: 13–19× when jobs are cheap, still 6.8× at κ=0.5; of 5% on simulation, 1.0× to 4.0×.
4. **Full pipeline** (ρ=0.5, B=1000, κ=0.05, 500 fits, no unstable fits): real shares 0.2 / 0.5 / 0.81 / 0.95 (n=100/250/404/475, m=16 000/10 000/3821/1000) give sd of `ln Ŵ` 0.399 / 0.244 / 0.202 / 0.224 (predicted 0.363 / 0.234 / 0.199 / 0.237) and RMSE of `Ŵ/W` 0.520 / 0.272 / 0.212 / 0.238. The optimum beats the 20%-real design by 2.5× in RMSE and the extreme 95% design by 12%.
5. **Coverage of the real wait by 95% intervals** (500 fits per cell; simulation-only predicted / simulated / input-aware): ρ=0.5, n=200: m=200 0.90/0.79/0.86, m=1000 0.72/0.69/0.92, m=5000 0.43/0.47/0.95, m=20 000 0.23/0.23/0.93, m=50 000 0.15/0.17/0.93. n=1000: 0.94/0.85/0.85, 0.90/0.84/0.89, 0.72/0.75/0.94, 0.47/0.50/0.95, 0.32/0.35/0.97. ρ=0.7, n=400: 0.92/0.79/0.86, 0.81/0.76/0.90, 0.54/0.58/0.94, 0.30/0.31/0.92, 0.20/0.20/0.93. A longer run makes the reported interval narrower and the real coverage worse.

## Limitations
One model, exponential data, first-order variances. Runs of 200 jobs (20 per replication) are outside the asymptotic regime: even the twin's own interval under-covers (0.79–0.85), so the input-aware interval is 0.85–0.86 there, not 0.95; the predicted naive coverage is optimistic at m=200. Aware coverage at m ≥ 20 000 is 0.916–0.934 in four of five cells (standard error about 1 point), a real shortfall probably from skew of the ln-scale error at finite `n`. The budget model is linear in two costs; the split table uses only ρ=0.5 and 0.8 and the pipeline check one configuration. Warm-up (`warmup-twin`), autocorrelation (`autocorr-twin`), misspecified input families and unstable fits (`input-twin`) are excluded. Real instrument data are not used.

## Next steps
Replace the first-order variances by a bootstrap/posterior that draws a fresh fit per simulation batch (Ankenman–Nelson metamodel); heavy-tailed service; budget with a warm-up cost; apply the split to the workcell and radar twins in this repository.

## References
- Cheng, R. C. H. & Holland, W. (1997). Sensitivity of computer simulation experiments to errors in input data. *Journal of Statistical Computation and Simulation* 57, 219–241.
- Whitt, W. (1989). Planning queueing simulations. *Management Science* 35(11), 1341–1366.
- Ankenman, B. E. & Nelson, B. L. (2012). A quick assessment of input uncertainty. *Proceedings of the Winter Simulation Conference*.
- Barton, R. R. (2012). Input uncertainty in output analysis. *Proceedings of the Winter Simulation Conference*.
