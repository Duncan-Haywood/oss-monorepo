# A loop-closure gate tuned in a too-clean odometry twin rejects a third of true closures and delivers four times its claimed cost

*Stylised: 2-D residuals, Gaussian, hard chi-square gate. Pure Python; every number is from `experiments/results.txt`. Gate probabilities are exact chi-square CDFs, checked against Monte Carlo (200,000 draws; 3-D case included); the repair rows are exact expectations over the fitted variance, checked against a 20,000-run simulation in `tests/`.*

## Question
Simulated SLAM pipelines are used to tune loop-closure acceptance before deployment, and simulated odometry is often cleaner than a real platform's. The gate is a Mahalanobis test (Bar-Shalom & Fortmann 1988; Neira & Tardós 2001): accept a closure whose squared residual is below `g`. Perceptual aliasing makes some closures false and expensive (Sünderhauf & Protzel 2012; Cadena et al. 2016). If the twin's residual noise is too small, what does the twin-tuned gate cost the real system, and how much real data repairs it?

## Model
Residual `r ∈ R^k`. True closure: `r ~ N(0, s²I)`. False closure: `r ~ N(0, (s²+τ²)I)`. Accept iff `‖r‖² ≤ g`. Cost `L(g) = A·P(reject|true) + B·P(accept|false)` with `A = c_miss·P(true) = 0.9`, `B = c_false·P(false) = 2.0` (`c_miss=1`, `c_false=20`, `P(false)=0.1`), `τ = 1 m`, twin `s_t = 0.1 m`. Both probabilities are chi-square CDFs: `P(reject|true) = 1−F_k(g/s²)`, `P(accept|false) = F_k(g/(s²+τ²))`. For `k=2`, `F_2(x)=1−e^{−x/2}`, so `L' = 0` gives the closed form `g* = (2 s² v/τ²)·ln(A v/(B s²))`, `v=s²+τ²`. A gate designed at false-rejection α for the twin, `g = −2 s_t² ln α`, rejects true closures at `α^{1/ρ²}` when the real noise is `ρ` times larger.

## Results
1. **Exact, and checked.** At the twin gate (`g_t = 0.0771`, radius 2.78 twin σ): `k=2`, ρ=1 reject-true 0.0212 vs MC 0.0211, accept-false 0.0374 vs 0.0371; ρ=2 0.3815 vs 0.3802 and 0.0364 vs 0.0360; `k=3`, ρ=2 0.5876 vs 0.5887 and 0.0053 vs 0.0052.
2. **The twin's claim is wrong.** The twin claims cost 0.094 with 2.1% of true closures rejected. At ρ=1.5/2/3 the real cost is 0.236/0.416/0.656, i.e. 2.5×/4.4×/7.0× the claim, and 18%/38%/65% of true closures are rejected. The false-accept rate barely moves (0.037→0.036→0.035), so the loss is all missed closures, i.e. uncorrected drift. For the conventional α=1% gate, rejection is 12.9%/31.6%/59.9% at ρ=1.5/2/3.
3. **Regret.** Against the real-optimal gate (radius 3.73/4.52/5.77 twin σ, versus the twin's 2.78): regret 37%/62%/54% of the optimal cost at ρ=1.5/2/3 (0.064/0.159/0.231 absolute), 35% at ρ=4.
4. **A pessimistic twin is not safe.** ρ=0.5: the real cost at the twin gate (0.075) is *below* the claim, but the real-optimal gate is much tighter (1.61 twin σ) and cost 0.031, so regret is 145%; ρ=0.75 gives 28%. Over-estimating noise wastes the false-closure protection.
5. **Dependence on the false-closure cost** (ρ=2). Regret is 396%/204%/62%/3.0% of the optimal cost for `c_false` = 2/5/20/100 (twin gate 0.352/0.324/0.278/0.211 m, real-optimal 0.629/0.566/0.452/0.266 m). At `c_false=1000` `A v/(B s²) ≤ 1` for both, the optimum is the boundary `g=0` (reject every closure) and regret is 0: when false closures are prohibitive the gate stops mattering, but SLAM then has no loop closures at all.
6. **Repair from real data.** Re-fit `ŝ² = s²·χ²_{nk}/(nk)` from `n` ground-truthed real closures and re-optimise (ρ=2, twin-gate regret 0.159): expected regret 0.107/0.054/0.035/0.020/0.0097/0.0031/0.0009 for n=1/2/3/5/10/30/100 (67%/34%/22%/13%/6.1%/2.0%/0.6% of the twin's); n=59 is the smallest count below 1%.
7. **A fixed inflation factor `c` is a bet on ρ².** Regret at real ρ=2: 0.159/0.044/0.0077/0/0.014/0.053/0.127 for c=1/2/3/4/6/9/16; if the twin was in fact right (ρ=1) the same inflation costs 0/0.030/0.067/0.099/0.151/0.210/0.297.

## Limitations
Isotropic Gaussian residuals (real odometry drift is anisotropic, heavy-tailed and correlated with the trajectory); `τ`, the costs and the prior are known and the same in twin and reality; a hard gate rather than switchable constraints or mixture back ends; one closure at a time, no pose-graph feedback of accepted closures into later residuals; no real or simulated odometry data, so `ρ` is a knob, not a measurement. The 3-D case is checked by Monte Carlo only; the closed-form optimum is 2-D. Not evidence about any particular SLAM system.

## Next steps
Anisotropic and heavy-tailed residuals; measuring `ρ` from a high-fidelity simulator against logged field data; robust back ends (switchable constraints, max-mixtures) under the same twin mismatch; multi-robot inter-robot closures where the twin's relative-pose noise is the unknown; anytime-valid audit of the twin's residual scale (`twin-audit`); sensor-twin companions `occupancy-twin`, `radar-clutter-twin`.

## References
- Bar-Shalom, Y. & Fortmann, T. E. (1988). *Tracking and Data Association*. Academic Press.
- Neira, J. & Tardós, J. D. (2001). Data association in stochastic mapping using the joint compatibility test. *IEEE Transactions on Robotics and Automation* 17(6), 890–897.
- Sünderhauf, N. & Protzel, P. (2012). Switchable constraints for robust pose graph SLAM. *IEEE/RSJ IROS*, 1879–1884.
- Cadena, C. et al. (2016). Past, present, and future of simultaneous localization and mapping. *IEEE Transactions on Robotics* 32(6), 1309–1332.
