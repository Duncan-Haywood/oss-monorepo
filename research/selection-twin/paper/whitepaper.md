# The winner's curse in a digital twin: the best of K simulated controllers is optimistic by `τ²c_K/√(v²+τ²)`, and more candidates can make the deployed one worse

*Stylised: Gaussian closed forms, plus one scalar LQ plant (`x'=1.1x+u+w`, `s=0.2`, cost `x²+0.1u²`, rollouts of 100 steps, gains uniform on [0.5, 1.7]) in which the twin is the exact plant and the only error is Monte Carlo noise. Pure Python; every number is from `experiments/results.txt` (seeded, ~110 s). Not hardware data.*

## Question
Sim-to-real pipelines often generate many candidate controllers or planners, score each in a simulator, and deploy the best. Even a simulator that is right on average gives each score an error (finite rollouts, or model error that is specific to a candidate). Picking the minimum then selects candidates whose errors happened to be favourable. How optimistic is the winner's simulated cost, how much deployed performance is lost against the best candidate, and does adding candidates or splitting a fixed simulation budget more finely help?

## Model
Candidate `i` has deployed cost `μ_i ~ N(m, v²)` and twin score `s_i = μ_i + e_i`, `e_i ~ N(0, τ²)` i.i.d. The twin deploys `argmin s_i`. With `c_K = E[max of K standard normals] = ∫ xKφ(x)Φ(x)^{K−1}dx` (0 for K=1, `1/√π` for K=2), and using `E[μ | s] = m + ρ(s−m)`, `ρ=v²/(v²+τ²)`:

- claimed cost of the winner `m − √(v²+τ²) c_K`;
- deployed cost of the winner `m − v² c_K/√(v²+τ²)`;
- optimism `τ² c_K/√(v²+τ²)`; regret against the best of the K, `v c_K (1 − v/√(v²+τ²))`.

For fixed `τ`, `c_K ≈ √(2 ln K)`, so optimism grows without bound while deployed cost improves only up to the noiseless limit `m − v c_K`. Under a fixed budget `B` of rollouts spread over K candidates, `τ² = σ²K/B` and the deployed cost is `m − v² c_K/√(v²+σ²K/B)`. It has an interior optimum in K.

## Results
1. **The closed forms are exact in the Gaussian model.** Over `τ`∈{0.5,1,2}, K∈{2,10,100,1000} (`m=0, v=1`, 20,000 rounds; 4,000 at K=1000) claimed, deployed, optimism and regret match simulation to within 0.03 in every cell; e.g. `τ=1`, K=100: claimed −3.546 vs −3.554 simulated, real −1.773 vs −1.779, optimism 1.773 vs 1.775.
2. **Optimism grows without bound, deployed benefit does not.** At `τ=v=1`, K = 10 / 100 / 1000 / 10,000 gives optimism 1.09 / 1.77 / 2.29 / 2.72 and deployed gain 1.09 / 1.77 / 2.29 / 2.72 below the mean (exactly half the claimed gain, since `ρ=½`). Half of the claimed improvement is illusory at every K when `τ=v`.
3. **Under a fixed budget, more candidates can hurt.** With `σ²/B`=4 / 0.4 / 0.04 the deployed cost is minimised at K = 5 / 8 / 22 (values −0.254 / −0.695 / −1.393 in units of `v`); at K=5000 it is −0.026 / −0.082 / −0.259, i.e. the gain is 10× / 8.5× / 5.4× smaller than at the optimum. Screening thousands of candidates with one noisy rollout each is worse than screening a handful well.
4. **A concrete twin shows the same sign, with a bigger optimism than the Gaussian formula.** Twin = exact plant; K=50 gains, 10 rollouts each, 300 rounds: mean claimed cost 0.0414, deployed (exact Lyapunov cost) 0.0450, oracle best of the 50 0.0445. The claim is 8.0% below the deployed cost and below 0.0444, the lowest cost any gain in the range can achieve, so the claim is not just optimistic but *impossible*. The Gaussian formula with the population `m=0.0525, v=0.0086` and measured `τ̂=0.0026` predicts optimism 0.0017 and regret 0.0008; measured 0.0036 and 0.0005. It gets the sign but not the size: the cost population is right-skewed with a hard floor, and score noise differs 5× across candidates (0.0011–0.0057).
5. **The concrete fixed-budget curve has the predicted interior optimum.** 200 rollouts split over K: deployed cost 0.0482 / 0.0460 / 0.0451 / 0.0451 / 0.0453 / 0.0459 for K = 2 / 4 / 10 / 20 / 50 / 100, while the best-of-K oracle keeps improving (0.0482 → 0.0444). The claim keeps falling (0.0481 → 0.0358) so at K=100 it is 22% below the deployed cost.
6. **Repairs (K=50, 500 rollouts each, 400 rounds).** Re-scoring the winner on 10 fresh rollouts removes the claim bias (0.0000 ± 0.0001 vs 0.0036 ± 0.0001) but cannot change the choice. Empirical-Bayes shrinkage with plug-in per-candidate noise variances barely helps (claim bias 0.0031, regret unchanged at 0.0005): with equal noise variances shrinkage preserves the ranking, and here it did not measurably change the choice. Screen-then-verify (5 rollouts each, then 50 each for the top 5) reduces claim bias to 0.0008 and regret to 0.0003; deployed cost 0.0448 vs 0.0449 is within noise.
7. **In the Gaussian model the re-test size matters.** At K=100, `v=1`, equal precision budget (stage 1 at half precision on all K, stage 2 spends the other half on the top t): naive has claim bias 1.770, regret 0.734; t = 2 / 5 / 10 / 20 gives bias 0.027 / 0.126 / 0.314 / 0.686 and regret 0.705 / 0.418 / 0.336 / 0.387. Small t makes the claim honest but the screen too coarse to find the best; the best t (≈10) trades the two.

## Limitations
Closed forms need i.i.d. Gaussian score noise and a Gaussian population of true costs; item 4 shows they can understate optimism by 2× when the population is skewed. The concrete twin is the exact plant, so it isolates Monte Carlo noise and contains no systematic model error, which also biases scores (but in a candidate-correlated way; `twin-transfer` and `randomized-twin` cover that). Score noise is assumed independent across candidates; common random numbers would correlate it and reduce the noise in *differences*, an effect not measured here. One scalar plant, no hardware. The repair comparison is at one budget and one K.

## Next steps
Common random numbers and paired comparisons across candidates; sequential halving / racing instead of two-stage screening; a proper-scoring or e-value claim for the winner's cost (`twin-elicitation`, `sequential-slashing`); model error that varies by candidate (contact-model error in manipulation, perception error in navigation); a real benchmark of policy ranking in simulator versus hardware.

## References
- Capen, E. C., Clapp, R. V. & Campbell, W. M. (1971). Competitive bidding in high-risk situations. *Journal of Petroleum Technology* 23(6), 641–653.
- Smith, J. E. & Winkler, R. L. (2006). The optimizer's curse: skepticism and postdecision surprise in decision analysis. *Management Science* 52(3), 311–322.
- Efron, B. & Morris, C. (1973). Combining possibly related estimation problems. *JRSS B* 35(3), 379–421.
- Efron, B. (2011). Tweedie's formula and selection bias. *JASA* 106(496), 1602–1614.
- Bechhofer, R. E., Santner, T. J. & Goldsman, D. M. (1995). *Design and Analysis of Experiments for Statistical Selection, Screening, and Multiple Comparisons*. Wiley.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
