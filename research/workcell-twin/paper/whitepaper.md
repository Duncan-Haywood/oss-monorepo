# A workcell twin that runs every step at its mean promises a makespan the real cell almost never meets

*Stylised: a fork-join stage. `W=64` min of work is split over `k` parallel stations; each branch time is random with mean `W/k`; a shared arm pays a serial handover `a=1` min per branch; the batch ends when the slowest branch does. The twin uses branch means only. Pure Python; every number is from `experiments/results.txt`. Expected maxima are exact quadrature of `1−F(x)^k` and are checked against Monte Carlo (40,000 draws) and the harmonic numbers; the repair rows use 300 replications.*

## Question
Simulated lab and manipulation workcells are used to plan experiments, and simulators commonly run each step at its nominal duration. Deterministic critical-path times are known to be optimistic when work joins (Fulkerson 1962; Elmaghraby 1977). How large is the gap for a workcell, does it change *how many stations the twin buys*, and how much real data repairs it?

## Model
Twin cost `W/k + a k` with optimum `k_t=√(W/a)=8` and promise 16.0 min. Real cost `(W/k)·e_k + a k`, where `e_k=E[max of k iid unit-mean branch factors]`. Model A (task-level variability): the branch factor is Gamma(κ) with mean 1 for every `k` (CV `κ^{−1/2}`). Model B (chain of steps): a branch is `N/k` unit steps of `N=64`, each Gamma(1/c²) with mean 1, so the branch shape is `N/(k c²)` and splitting the work makes each branch relatively more variable. The parallel part of the makespan has CDF `F(x)^k`, so its quantile is exact, `F^{−1}(q^{1/k})`. For exponential branches `e_k=H_k`, and continuous stationarity is `(k/k_t)²=H_k−1` (below, `ln k+γ−1`).

## Results
1. **Exact, and checked.** Quadrature versus Monte Carlo: `k=8`, κ=1: 2.7179 vs 2.7199±0.0062 (H₈=2.7179); κ=4: 1.8079 vs 1.8051±0.0023; κ=0.5: 3.4574 vs 3.4729±0.0104; `k=16`, κ=16: 1.4893 vs 1.4894±0.0009; `k=64`, κ=1: 4.7439 vs 4.7411±0.0064 (H₆₄=4.7439).
2. **The promise is missed.** At `k=8` the twin claims 16.0 min. Model A: real mean 29.74/22.46/19.06/17.48 for κ=1/4/16/64 (1.86×/1.40×/1.19×/1.09×); the chance that every branch finishes within its mean is only 2.6%/1.1%/0.65%/0.51% (it tends to `2^{−k}`, not 1, as variance vanishes, because the mean of a skewed branch exceeds its median). The 95% quantile is 48.4/29.3/21.8/18.7 min, i.e. 3.03×/1.83×/1.36×/1.17× the promise. Model B, step CV `c`=0.25/0.5/1/2: real mean 17.03/18.12/20.44/25.44 (1.06×–1.59×), 95% quantile 1.12×–2.29×.
3. **Right decision or wrong depends on the variability model.** Model A: real optimum `k`=12/10/9/8 for κ=1/4/16/64, so the twin under-buys stations; regret of `k=8` is 4.2%/1.6%/0.5%/0.0% on the mean, but on the 95% quantile (optimum 18/13/10/9) it is 24.7%/8.9%/2.8%/0.8%. The continuous condition gives 11.33 for κ=1 against the discrete 12. Model B: `k=8` is optimal for every `c` (0.25–2) with zero regret and a flat cost curve (c=1: 21.10/20.44/20.80 at k=6/8/10): the extra saving from smaller branch means is cancelled by their higher relative variability. So the twin can pick the right layout and still mis-state its makespan by 6–59%; the layout is safe only if the promise is not used.
4. **Repair from real durations.** Moment-fit of κ from n unit-normalised branch durations, then plan with the fitted model. True κ=1 (twin regret 4.2%, twin claim error −46%): regret 0.47/0.24/0.16/0.08/0.05/0.02% and predicted-cost error −10.0/−5.8/−4.4/−1.8/−0.8/−0.1% for n=3/5/10/20/50/200 (mean `κ̂` 3.75 with sd 10.1 at n=3, 1.09 with sd 0.29 at n=50). κ=4 (twin regret 1.6%, claim error −29%): regret 0.29→0.00%, claim error −4.0→−0.2%. The decision needs a handful of durations; a trustworthy makespan number needs tens.
5. **Robustness.** Lognormal branches with unit mean and CV 1: real mean cost 29.20±0.07 at `k=8` (exponential prediction 29.74) and 28.59±0.05 at `k=12` (28.55); real optimum in 6–16 is `k`=11, twin's 8 costs 3.0% more. A gamma moment fit of 50 lognormal samples gives κ̂ 1.26 on average, close to but not equal to the CV-matched 1, so the fitted-gamma repair is approximate for a different family.

## Limitations
One fork-join stage with i.i.d. branches; handover cost linear in `k`; no queueing across batches, no failures, no reagent or timing constraints between steps; gamma and lognormal durations rather than measured logs; the two variability models bracket, but do not measure, how a real workcell's variability scales with splitting. The repair assumes the branch family; only one non-gamma check. Not evidence about any real lab automation system.

## Next steps
Measure branch-time laws from a real or high-fidelity simulated workcell; general DAG schedules with resource conflicts (critical-path optimism in networks); robust and quantile-based planning inside the twin; stochastic durations as part of domain randomisation (`randomized-twin`); scoring a twin's makespan claim with a proper scoring rule (`twin-elicitation`, `twin-audit`).

## References
- Fulkerson, D. R. (1962). Expected critical path lengths in PERT networks. *Operations Research* 10(6), 808–817.
- Elmaghraby, S. E. (1977). *Activity Networks: Project Planning and Control by Network Models*. Wiley.
- David, H. A. & Nagaraja, H. N. (2003). *Order Statistics*, 3rd ed. Wiley.
