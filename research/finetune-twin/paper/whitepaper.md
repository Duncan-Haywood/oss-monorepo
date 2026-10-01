# Fine-tuning a twin-pretrained policy: what the twin start saves, and why its errors in flat directions persist

*Stylised: real loss `L(θ)=½Σλᵢeᵢ²`, `e=θ−θ*`, SGD with additive Gaussian gradient noise of standard deviation `s` per coordinate, constant step `η`. The twin start is a fixed offset `b` from `θ*`; a cold start is `e₀`. Pure Python; all numbers are from `experiments/results.txt` (deterministic). Preliminary, no robot data.*

## Question
A policy trained in a digital twin is deployed and fine-tuned on the real system. How many real gradient steps does the twin start save, when is it worse than no twin, and which twin errors does fine-tuning fail to remove?

## Model
Per eigen-direction `i`, `eᵢ ← eᵢ − η(λᵢeᵢ + sξ)`. With `rᵢ=1−ηλᵢ`: `E eᵢ(k)² = rᵢ²ᵏeᵢ(0)² + ηs²/(λᵢ(2−ηλᵢ))(1−rᵢ²ᵏ)`, so the expected real loss is exact and converges to the floor `½Σηs²/(2−ηλᵢ)` regardless of the start. The bias part of a twin error `b` after `k` steps is `½Σλᵢrᵢ²ᵏbᵢ²`. Since `rᵢ²ᵏ ≤ exp(−2ηλᵢk)` and `max_λ λe^{−2ηλk}=1/(2eηk)`, it is at most `‖b‖²/(4eηk)` for every spectrum (the bound is a continuous-`λ` maximum and requires `ηλ≤1`).

## Results
1. **Exact law.** Simulation/exact ratio 0.997–1.001 at `k`=5–320 (20,000 runs; `d`=10, `λ` geometric in [0.01,1], `η`=0.1, `s`=0.3, floor 0.02279).
2. **Steps saved.** Target 2× the floor: cold start needs 141 steps. Twin error `b` per direction (cold `e₀`=1): 0.3 → 130 saved; 0.6 → 90 (64%); 1.0 → 0; 1.5 → −138; 3.0 → −523. So negative transfer appears as soon as the twin is worse than the zero start; there is no safety margin.
3. **Saving is a near-constant fraction.** With `b`=0.6, savings are 18/27, 37/58, 90/141, 147/231, 258/406 steps at targets 8×, 4×, 2×, 1.5×, 1.2× the floor (64–67%): the twin shortens the transient by a fraction, it does not change the rate.
4. **1/k residual.** For a unit-norm twin error, the loss left at `k`=10/50/200/1000 is 6.1e−2/1.3e−5/2.5e−19/1.5e−92 if the error is in the stiffest direction, 4.9e−3/4.5e−3/3.4e−3/6.8e−4 in the flattest, and 9.0e−2/1.8e−2/4.6e−3/9.2e−4 in the worst single direction `λ*=1/(2ηk)`, against the bound 9.2e−2/1.8e−2/4.6e−3/9.2e−4 (ratio 0.97–1.00).
5. **Placement matters more than size.** At an identical initial real loss of 0.5, steps to 2× the floor are 13 (stiff), 599 (isotropic in loss) and 1,541 (flat).

## Limitations
Quadratic loss with isotropic noise and a prescribed offset: real twin error is structured by the physics (a mass error perturbs a feedback gain in specific directions) and the map from model mismatch to `b` is not modelled. Constant-step SGD only; Adam, decaying steps, and non-convex policies can behave differently. The result 2 crossover at `‖b‖=‖e₀‖` assumes the same spectrum and isotropic error directions; with other geometries it is the ratio of loss-weighted, not parameter, errors. No real data.

## Next steps
Derive `b` from a physical parameter mismatch in `twin-transfer`'s LQ setting; add decaying steps and momentum; a curvature-aware early-stopping rule that detects flat-direction inheritance from real-loss traces; combine with `twin-shrinkage`-style blockwise shrinkage toward the twin.

## References
- Bach, F. & Moulines, E. (2013). Non-strongly-convex smooth stochastic approximation with convergence rate O(1/n). *NeurIPS*.
- Défossez, A. & Bach, F. (2015). Averaged least-mean-squares: bias-variance trade-offs and optimal sampling distributions. *AISTATS*.
- Tobin, J. et al. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. *IEEE/RSJ IROS*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
