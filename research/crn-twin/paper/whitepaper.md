# Common random numbers in a digital twin: seeds pair two policies only while their random streams stay in step

*Stylised: per-step noise `z ~ N(0,1)` from a seeded stream, return `R = m + σ Σ_t w_t z_{read(t)}`, `T=20` steps, `σ=1`. Pure Python; every number is from `experiments/results.txt` (seeded, ~40 s). Simulations use 4,000–60,000 repetitions (correlations carry ≈0.01 sampling error), and "real" plays no part: this is about twin-side evaluation.*

## Question
Unlike reality, a twin can run two policies on identical random inputs, and the standard advice is to do so (common random numbers) when ranking them. When does a shared seed really pair the policies, how much does it save, and what happens to a comparison sized on the hope of full pairing?

## Method
Policy A reads draw `z_t` at step `t`. Policy B, with probability `q` at each step, first consumes one extra draw (replan, re-sampled noise), so it reads `z_{t+D_t}` with `D_t ~ Bin(t,q)`; its read indices are strictly increasing, so both returns have variance `σ²Σw²`. Since `E[z_t z_s]=1{t=s}`,
`ρ = Σ_t Σ_d P(D_t=d) w_t w_{t+d} / Σ_t w_t²`  (`w_s=0` for `s>T`),
and `Var(R_A−R_B) = 2σ_R²(1−ρ)` versus `2σ_R²` for independent streams. For a terminal-only score this is `ρ=(1−q)^T`. The episodes needed for a two-sided level-0.05, power-0.9 comparison of a gap `Δ` is `(z_{0.975}+z_{0.9})²·Var(R_A−R_B)/Δ²`. The repair draws the noise for step `t` from a counter keyed by (episode, step) and sends extras to a separate stream, so the pointers never move.

## Results
1. **Exact correlation.** Formula | simulation at `q`=0.01/0.05/0.1/0.3: flat weights 0.990|0.990, 0.952|0.953, 0.909|0.909, 0.767|0.766; discount `γ=0.9`: 0.994, 0.973, 0.946, 0.851 (simulated 0.994, 0.973, 0.948, 0.853); ramp `w_t=t`: 0.981, 0.910, 0.831, 0.599 (0.981, 0.910, 0.830, 0.597); terminal-only: 0.818|0.816, 0.358|0.352, 0.122|0.121, 0.001|0.003. Terminal scores (final distance, success at the last step) are the most fragile: one replan in 100 steps already costs a fifth of the correlation at `T=20`.
2. **What pairing buys.** Independent streams need 233 episodes for a 0.3σ_R gap. Seed-paired: flat 2.3/11.1/21.3/54.5 at `q`=0.01/0.05/0.1/0.3; terminal 42.5/149.8/205.1/233.3. Simulated `Var(R_A−R_B)/(2σ_R²)` matches `1−ρ` (e.g. 0.046 vs 0.048, 0.990 vs 0.999).
3. **Sizing trap.** Planning as if streams stay synchronised (`ρ=0.95`) gives `n=12` paired episodes. The paired t-test remains valid, but its power is 0.850 (flat, `q=0.05`, true `ρ` 0.952), 0.285 (flat, `q=0.3`, needs ≈55), 0.156 (terminal `q=0.05`, needs ≈150) and 0.111 (terminal `q=0.1`, needs ≈206), against 0.90 nominal: the failure is a missed real gap, not a false alarm.
4. **Repair.** With (episode, step)-keyed draws `ρ=1.000000` and the paired difference is identically zero in the equal-means case; with a true 0.3σ_R gap 3 paired episodes reach power 1.000 (terminal, `q=0.3`), where stream mode needs ≈233.
5. **Binary success** (`1{R>0}`, policy means ±0.15σ_R): variance of the paired success difference relative to independent streams is 0.263/0.459 (flat, `q`=0.05/0.3, stream), 0.718/1.006 (terminal), and 0.216/0.214 with counter-keyed draws. No closed form; values are simulations (60,000 episodes). Pairing helps less for indicators than for the Gaussian score (0.216 at `ρ=1` is the floor from differing means), and at `q=0.3` terminal it gives no benefit at all.

## Limitations
The only difference between policies is how many draws they consume (plus a mean gap); real policies also diverge in state and therefore in which noise matters, which the model does not capture, and the pure repair result (difference exactly zero) is an artefact of that. Extras arrive independently of the noise; adaptive replanning triggered by the noise itself would change `ρ` and is not analysed. Weights are non-negative, so `ρ ≥ 0`; signed weights can give negative `ρ` and are not studied. Nothing uses simulator or robot data. Preliminary.

## Next steps
Policies whose events depend on the noise; measuring desynchronisation in a real simulator's RNG (MuJoCo/PyBullet seeding) for two real controllers; combining CRN with the control-variate estimator of `twin-evaluation`; diagnosing desynchronisation online from the per-step correlation of paired rollouts.

## References
- Law, A. M. & Kelton, W. D. (2000). *Simulation Modeling and Analysis* (3rd ed.). McGraw-Hill.
- Glasserman, P. & Yao, D. D. (1992). Some guidelines and guarantees for common random numbers. *Management Science* 38(6), 884–908.
- Salmon, J. K., Moraes, M. A., Dror, R. O. & Shaw, D. E. (2011). Parallel random numbers: as easy as 1, 2, 3. *Proc. SC '11*.
