# Mixing twin and real samples: what a biased simulator is worth, and why equal pooling breaks

*Stylised: estimating one real parameter `θ` from `n` real samples `y~N(θ,σ²)` and `m` twin samples `z~N(θ+δ,τ²)`, twin bias `δ`. Pure Python; all numbers are from `experiments/results.txt` (deterministic). Preliminary, no robot data.*

## Question
Simulation samples are cheap but biased; real samples are scarce and unbiased. How should they be weighted, how many real samples is the twin worth, and when does simply concatenating the two datasets hurt?

## Model
With `a=σ²/n`, `b=τ²/m`, the means `ȳ`, `z̄` are independent normals. For `θ̂(w)=(1−w)ȳ+wz̄`, `MSE(w)=(1−w)²a+w²(b+δ²)`. Hence `w*=a/(a+b+δ²)` and `MSE*=a(b+δ²)/(a+b+δ²)`, i.e. `1/MSE* = 1/a + 1/(b+δ²)`: the twin acts like `σ²/(b+δ²)` extra real samples, at most `σ²/δ²` however large `m`. Equal-weight pooling has `MSE=(m²δ²+nσ²+mτ²)/(n+m)²`; for `τ=σ` it beats real-only iff `δ²<a+b`. In loss-weight terms, the optimal per-sample weight of a twin sample relative to a real one is `σ²/(τ²+mδ²)`. When `δ` is unknown, `D=z̄−ȳ~N(δ,a+b)` sets `w` adaptively; the MSE is integrated on a fine grid (checked against Monte Carlo within 2% in the tests).

## Results
(`σ=τ=1`, `n`=10, so `a`=0.1.)
1. **Worth.** With `m`=1000, `δ`=0.5√a: `w*`=0.79, MSE 0.21a, equivalent to 48.5 real samples (cap 50). `δ`=√a: 19.9 (cap 20). At `δ`=0.25√a the twin is worth 137.9 extra samples at `m`=1000 and 157.5 at `m`=10⁴ against a cap of 160.0 (99.8% at `m`=10⁵): more twin rollouts buy almost nothing near the cap.
2. **Naive pooling.** Exact threshold `δ²<a+b`: at `m`=10 pooling helps up to `δ`=1.41√a, at `m`=100 only to 1.05√a, and as `m→∞` only to √a. At `δ`=√a·1.2, pooling `m`=10⁴ twin samples gives MSE 1.44× real-only; at `δ`=2√a, 3.99× (`m`=10⁴), and 98× at `δ`=10√a (`m`=1000).
3. **Loss weights.** Twin samples should be down-weighted by `σ²/(τ²+mδ²)`: 0.138 at `m`=1000, `δ`=0.25√a; 0.0099 at `δ`=√a. The twin's total weight saturates, so the weight per sample scales as `1/m`.
4. **Unknown bias** (`m`=1000, exact MSE/`a` over `δ/√a`∈{0,…,10}). Real-only is 1.000. The plug-in `w=a/(a+b+D²)` gives 0.47 at `δ`=0 (oracle 0.010) and 0.78 at `δ`=√a, but is *worse than real-only* for `δ`≥1.5√a, peaking at 1.243 (`δ`=3√a). A debiased plug-in (`D²−(a+b)`, floored at 0) peaks at 1.445; a 5% pretest at 2.412; naive pooling at 98. None approaches the oracle: the price of not knowing `δ` is large (0.47 vs 0.01 at `δ`=0), and among these the plug-in has the smallest worst-case regret on the grid.

## Limitations
One scalar parameter, Gaussian noise, twin bias treated as a fixed constant, independent twin samples with known variances `σ²`, `τ²`. Real sim-to-real error is structured, state-dependent and correlated across rollouts, so the effective `m` is smaller. The adaptive estimators are a small family, not minimax-optimal; a grid, not a proof, of worst-case regret. The nominal 5% pretest level and the debiasing rule were not tuned.

## Next steps
Vector parameters with a learned bias model (twin residual regression); rollout correlation (effective `m`); the same trade-off inside SGD with a sim-loss weight schedule; link to `ladder-twin`, which uses multilevel differences rather than a bias-weighted mix.

## References
- Stein, C. (1956). Inadmissibility of the usual estimator for the mean of a multivariate normal distribution. *Berkeley Symposium*.
- Giles, M. B. (2015). Multilevel Monte Carlo methods. *Acta Numerica* 24.
- Tobin, J. et al. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. *IEEE/RSJ IROS*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
