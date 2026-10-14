# A human model that never gives up: timeout policies of a collaborative robot trained in a light-tailed twin

*Stylised: response time `T` scalar and i.i.d., a fixed timeout `τ`, cost `J(τ) = w·E[min(T,τ)] + c·P(T>τ)` with `w=1` per second and `c=5` per abort unless stated. The "real" human is a lognormal(μ=0, σ=1.2) (mean 2.054 s, median 1 s); this is a chosen model, not data. Pure Python; every number is from `experiments/results.txt`. Closed forms are checked against 400k-trial simulation (section 1 of the results and `tests/`).*

## Question
A robot policy trained inside a simulator with a simulated human inherits that human's response-time law. Simulated humans are usually given convenient laws (exponential, Gaussian, Weibull). What does the choice do to *when the robot gives up waiting*, a decision that matters in handovers and shared-workspace tasks?

## Results
1. **Hazard rule.** With survival `S` and hazard `h`, `dJ/dτ = S(τ)(w − c·h(τ))`. A timeout is locally optimal where `h` crosses `w/c` from above. For the lognormal, the hazard rises then falls; the optimum is the right-hand crossing, τ* = 9.401 s with `h(τ*) = 0.2000 = w/c`, J* = 1.9815 (grid + golden-section search agrees to 7 digits). Waiting forever costs `w·E[T]` = 2.0544; aborting at once costs 5.
2. **Corner theorem for monotone hazard.** If `h` is constant, `J'` has constant sign, so `τ=0` or `τ=∞` is optimal, decided by `c` versus `w·E[T]` (tested for two exponentials). For increasing hazard (Weibull k>1), `J` first rises then falls, so the interior stationary point is a maximum; the twin's best policy is again a corner. With mean 2.054 and c=5 > 2.054, exponential and Weibull (k=2, 1.5) twins all say never abort; their cost curves are flat to 3 decimals beyond ~8–16 s (Weibull k=2: 2.054 at τ=8, 16), so the numerical τ they report (18.6, 60) is arbitrary inside a plateau.
3. **Regret of the light-tailed twin.** Its real regret is `w·E[T] − J*` = 0.0729, or 3.7% of J*, whenever the twin's mean matches the real mean, the same for every monotone-hazard twin. Small in this base case. It grows with tail weight and cheaper aborts (regret of never aborting as % of J*): σ=0.8: 0.2% (c=1.5·w·E[T]), 0% at c=3·; σ=1.2: 10.0 / 2.3 / 0.1% at c/(w·E[T]) = 1.5 / 3 / 10; σ=1.6: 36.9 / 16.1 / 3.0%; σ=2.0: 80.8 / 44.9 / 15.0%.
4. **Getting the tail shape partly right is enough.** A mean-matched lognormal twin with σ_twin=0.4/0.6/0.8/1.0/1.4/1.6 (real 1.2) has real regret 3.21/3.13/1.84/0.50/0.42/1.41% of J*. σ_twin ≤ 0.6 already behaves almost like never-abort (τ_twin ≈ 48–51 s, regret close to 0.0729). Over- and under-estimating σ by 0.2 cost about the same (0.42% at 1.4, 0.50% at 1.0; one parameter point).
5. **Calibration budget.** Correctly specified lognormal MLE from `n` real trials, plug-in timeout, 2000 replications: mean regret 0.0323 (n=10), 0.0159 (20), 0.00657 (50), 0.00339 (100), 0.00173 (200), 0.00068 (500), 0.00034 (1000), standard errors ≤8% of the mean at `n=10` and ≤3% from n=50. The delta-method prediction `½·c·S(τ*)|h'(τ*)|·Var(τ̂)` (Fisher-information variances) is 0.0353, 0.0177, 0.00706, 0.00353, 0.00176, 0.00071, 0.00035, within 11% at every `n`; regret scales as `1/n`. The fraction of fits beating never-abort is 0.908, 0.976, 0.999 for n=10, 20, 50. Median regret is about half the mean at small `n` (skewed).

## Limitations
The heavy-tailed truth is assumed, not measured; the base-case gap (3.7%) is small and the large regrets need σ≥1.6 with cheap aborts. Correct model family in section 5 (misspecified fits are not run). One scalar timeout, no learning of a state-dependent policy, no adaptation of the human to the robot, no robot-side uncertainty about the human's attention state. Not evidence about any real collaborative task.

## Next steps
Fit response-time laws from a public human-robot interaction dataset; policy-gradient training inside twins with different human models to see whether a learner reaches the analytic corner; humans who speed up when the robot signals impatience (a game, cf. `twin-transfer`); mixtures (attentive vs distracted humans) where the hazard is bimodal.

## References
- Barlow, R. E. & Proschan, F. (1965). *Mathematical Theory of Reliability*. Wiley.
- Ulrich, R. & Miller, J. (1993). Information processing models generating lognormally distributed reaction times. *J. Mathematical Psychology* 37(4), 513–525.
