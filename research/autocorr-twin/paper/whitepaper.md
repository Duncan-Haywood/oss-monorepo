# One long twin run is worth a fraction of its length: naive confidence intervals from autocorrelated twin output cover only 9–53% of the time for M/M/1 waits

*Stylised: stationary Gaussian AR(1) output and the M/M/1 waiting time of a shared lab instrument (service rate 1). Pure Python; every number is from `experiments/results.txt` (seeded, ~2 min). The "real" system is itself simulated; no lab data. The M/M/1 asymptotic-variance formula is a literature result (Daley 1968; Whitt 1989), checked here by simulation, not derived.*

## Question
A digital twin is cheap to run, so a common way to certify a performance claim ("mean wait ≤ SLA", "mean tracking error ≤ x") is one long run summarised as `mean ± 1.96 s/√n`. That interval assumes the `n` outputs are independent. Twin output is not: queue waits, battery states and estimator errors are serially correlated. How much narrower than the truth is the naive interval, how often does it wrongly certify, and what repairs it?

## Model
(i) Stationary AR(1) with marginal variance `σ²` and lag-one correlation `φ`. The run mean of `n` consecutive draws has exact variance `(σ²/n²)[n + 2Σ_{k<n}(n−k)φ^k]`, which tends to `σ²(1+φ)/(1−φ)/n`; the effective sample size is `n` divided by that inflation. (ii) The M/M/1 waiting time at load `ρ` has mean `ρ/(1−ρ)`, variance `ρ(2−ρ)/(1−ρ)²`, and asymptotic variance of the run mean `ρ(2+5ρ−4ρ²+ρ³)/(1−ρ)⁴` per job, so the iid interval is too narrow in variance by `(2+5ρ−4ρ²+ρ³)/((2−ρ)(1−ρ)²)`, which grows like `(1−ρ)⁻²`. Repair: split the run into `b=30` contiguous batches and use a Student-t interval on the batch means.

## Results
1. **AR(1) variance is exact** (n=1000, 4000 runs): `n·Var(mean)` exact/simulated is 2.996/2.855 (φ=0.5), 18.82/19.15 (0.9), 179.2/176.8 (0.99). The effective sample size of 1000 draws is 334, 53 and 6. The naive 95% interval covers the true mean 76%, 34% and 10% of the time (exact with known variance: 74%, 35%, 12%).
2. **Batch means repair it only when batches outlast the correlation** (same runs): coverage 0.949 (φ=0), 0.949 (0.5), 0.904 (0.9), but only 0.535 at φ=0.99, where a batch of 33 draws is shorter than the correlation time (~100). The repair has a validity condition, not a free pass.
3. **M/M/1 waits** (one run of 10⁴ jobs, 1000 runs): the naive interval covers the true mean wait 53%, 26% and 9% of the time at ρ=0.5, 0.7, 0.9 (true means 1.0, 2.33, 9.0); batch means cover 94.7%, 93.7% and 82.5%. Half-widths: naive 0.034/0.062/0.185 vs batch 0.108/0.354/2.52, so at ρ=0.9 the honest interval is 14× wider than the claim. Inflation over iid is 9.7×, 33×, 363×.
4. **False certification.** True mean wait 9 (ρ=0.9), SLA 8 (the instrument violates it). Certifying when `mean + half-width < 8` from 10⁴ jobs passes the violating system in 26.0% of runs with the naive interval and 4.8% with batch means.
5. **Run length.** For a half-width of 10% of the mean the iid formula asks for 1152/713/470 jobs at ρ=0.5/0.7/0.9; the exact asymptotic variance asks for 11 141/23 678/170 268 (9.7×/33×/363×): a higher load needs a *longer* run, the opposite of what the iid formula suggests. At the exact length for ρ=0.7 (23 677 jobs) the batch interval covers 94.2% with mean half-width 0.236 (target 0.233) while the naive one covers 26.8%.
6. **Formula check (noisy).** Single long-run estimates of the asymptotic variance (100 batches) are 33.9/415/37 700 vs exact 29.0/336/35 900 at ρ=0.5/0.7/0.9; a 100-batch variance estimate has ~14% relative standard error, so these are consistent with the formula but do not pin it to better than that; the run-length check in item 5 (half-width within 1.3%, variance within ~3%) is the tighter test. A start from an empty queue biases the mean little at these lengths (8.97 vs 9.07 with a 1000-job burn-in at ρ=0.9 is within noise).

## Limitations
Gaussian AR(1) and M/M/1 only; real twin output may have long memory or heavy tails (see `queue-twin`: infinite-variance service makes the run mean's variance infinite and no batch size helps); `b=30` batches and a single interval rule, no comparison with spectral, overlapping-batch or regenerative estimators; a fixed-length run, not sequential stopping; the false-certification example is one configuration; the asymptotic run length ignores the t-quantile and the batch-count penalty. Coverage numbers come from 1000–4000 runs (standard error 0.7–1.5 points).

## Next steps
Sequential stopping with an anytime-valid interval on the batch means (cf. `twin-audit`); heavy-tailed output; multi-server instruments; estimating the correlation time from the run to choose `b`; combining with `twin-evaluation` (a twin as a control variate) so correlated twin noise is cancelled rather than averaged.

## References
- Daley, D. J. (1968). The serial correlation coefficients of waiting times in a stationary single server queue. *Journal of the Australian Mathematical Society* 8, 683–699.
- Whitt, W. (1989). Planning queueing simulations. *Management Science* 35(11), 1341–1366.
- Law, A. M. & Kelton, W. D. (2000). *Simulation Modeling and Analysis*, 3rd ed. McGraw-Hill.
- Schmeiser, B. (1982). Batch size effects in the analysis of simulation output. *Operations Research* 30(3), 556–568.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
