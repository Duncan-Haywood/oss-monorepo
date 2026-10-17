# A twin with independent sensor errors under-counts the redundancy a robot needs: 30 sensors, not 16, at correlation 0.03

*Stylised: equal-variance Gaussian errors with one common factor (pairwise correlation `ρ`); the twin has `ρ=0`; the "real" fleet is itself simulated. Pure Python; every number is from `experiments/results.txt` (seeded, ~25 s). No sensor data.*

## Question
A digital twin of a robot's sensor suite is used to decide how many redundant sensors are needed to reach a target accuracy and how wide to set an outlier gate. Twins typically draw each sensor's noise independently. Real redundant sensors share error sources (a common calibration, multipath, weather, platform vibration). How wrong is the twin's fleet size and gate, and can the shared component be estimated from calibration logs?

## Model
`n` sensors, error variance `σ²`, pairwise correlation `ρ` (common factor `√ρ·c` plus independent part). The equal-weight mean has variance `σ²(1+(n−1)ρ)/n` exactly. Hence: inflation `k=1+(n−1)ρ` over the twin's `σ²/n`; effective independent sensors `n_eff=n/k<1/ρ`; a floor `σ²ρ`; fleet size for std `τ`: `n=σ²(1−ρ)/(τ²−σ²ρ)`, infinite when `τ²≤σ²ρ`; a gate at `z` twin stds false-alarms with probability `erfc(z/√(2k))`, restored by widening to `z√k`. For equicorrelated errors equal weights are the best linear unbiased fusion, so the loss is not a weighting mistake.

## Results (σ²=1, target std 0.25)
0. **Formula matches simulation** (2·10⁵ draws), e.g. `n=16, ρ=0.05`: 0.1094 exact vs 0.1095.
1. **Understatement.** Real/twin std is 1.07×/1.32×/2.04×/7.14× at `n`=4/16/64/1000 for `ρ=0.05` (`n_eff`=3.5/9.1/15.4/19.6 against the 20 ceiling); floor std 0.100/0.224/0.316/0.548 at `ρ`=0.01/0.05/0.1/0.3.
2. **Fleet size.** The twin says 16. Real: 19 (1.2×), 30 (1.9×), 77 (4.8×), 376 (23.5×) at `ρ`=0.01/0.03/0.05/0.06; infeasible for `ρ≥0.0625` (`=τ²/σ²`). The cost is a cliff, not a slope.
3. **Gate.** At `n=16` the 3-twin-std gate false-alarms at 0.0051/0.0233/0.0578/0.2008 for `ρ`=0.01/0.05/0.1/0.3 (simulated 0.0052/0.0231/0.0579/0.2010), i.e. 1.9×/8.6×/21×/74× the nominal 0.0027. Honest gate widths: 3.22/3.97/4.74/7.04 twin stds.
4. **Repair from logs (mixed).** With 8 calibration sensors and known truth, `ρ=0.03`, 200 repeats: the pooled `ρ̂` is nearly unbiased (mean 0.0282/0.0293/0.0295 at T=25/100/400 epochs). Sizing the fleet from `ρ̂` still misses the target in 105/200, 102/200, 103/200 repeats (built and missed; the rest either met it, 62/92/97, or declared it infeasible, 33/6/0), because `n(ρ)` is convex with a pole at `ρ=0.0625`, so half the estimates fall short. A 90% bootstrap upper bound (over epochs) at T=400 misses in 17/200, meets in 164/200, declares infeasible in 19/200, and builds a median 55 sensors (plug-in: 29). At T=25 it declares infeasible in 122/200, so short logs cannot support the target at all.

## Limitations
One common factor, equal variances and correlations, Gaussian errors (real correlation is structured per modality and range, and time-varying; heterogeneous sensors could be down-weighted or decorrelated by diversity, not derived here); the calibration needs ground truth on the same sensors; the bootstrap rule is one choice and the 90% level was not tuned, so coverage is empirical (miss rate 8.5% of all repeats, 9.4% of those built); the bound spends sensors to buy confidence.

## Next steps
Diverse-modality fleets (a lower-`ρ` radar+lidar pair vs identical lidars); estimating `ρ` without ground truth; time-varying correlation and anytime-valid audit of the gate (`twin-audit`); covariance intersection when `ρ` is unknown; linking to the filter tuned in the wrong twin in `filter-twin`.

## References
- Kish, L. (1965). *Survey Sampling*. Wiley.
- Bar-Shalom, Y. & Campo, L. (1986). The effect of the common process noise on the two-sensor fused-track covariance. *IEEE Trans. Aerospace and Electronic Systems* 22(6), 803–805.
- Julier, S. J. & Uhlmann, J. K. (1997). A non-divergent estimation algorithm in the presence of unknown correlations. *Proc. American Control Conference*.
- Efron, B. (1979). Bootstrap methods: another look at the jackknife. *Annals of Statistics* 7(1), 1–26.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
