# Smoothing a twin's contact edge makes it trainable inside a window `[τ_c, R/(8cm)]`, and the resulting overshoot is a safety margin you cannot set independently

*Stylised: one pose parameter, one hard success edge, logistic smoothing, deterministic gradient ascent. Pure Python; every number is from `experiments/results.txt` (deterministic, no random numbers, ~6 s). The "real" plant is itself simulated; no robot data.*

## Question
Differentiable simulators give gradients through contact only after the discontinuity is smoothed. When the real success event is a hard edge (a grasp is either aligned or not), the real reward has zero gradient almost everywhere, so a smoothed twin is the only source of a learning signal. How much smoothing is needed, what does it cost in real performance, and what happens when the twin's edge is not where the real edge is?

## Model
Real reward `J(θ)=R·1{θ≥0} − c(θ+m)²`, start at the nominal pose `θ=−m`, real optimum `θ=0` with value `R−cm²` (normalised `R=c=1`, `m=0.5`: 0.75). Twin objective `f(θ)=R·σ((θ−e)/τ) − c(θ+m)²` with `σ` the logistic function, width `τ`, twin edge at `e` (0 unless stated). Stationary points solve `(R/τ)σ(1−σ)=2c(θ+m)` (all roots found on a grid and refined by bisection; the global maximiser is checked against a 4·10⁵-point brute-force argmax to 10⁻⁶).

## Results
1. **Overshoot.** With `e=0` the twin optimum lies past the edge: `θ̂` = 0.0745/0.131/0.167/0.152/0.093 at `τ`=0.02/0.05/0.1/0.15/0.2, with real regret `cθ̂(θ̂+2m)` = 0.080/0.148/0.195/0.175/0.101. The small-`τ` law `θ̂≈τ ln(R/(2cmτ))` (from `e^{−k}≈2cmτ/R`) is within 5% at `τ=0.02` and 14% at 0.05, and fails by 1.4–3.5× by `τ=0.1`–0.2, where it is not meant to hold.
2. **Two-sided window.** The twin objective has a second local maximum at the nominal pose for `τ<τ_c=0.1048` (bisection on the number of local maxima). Gradient ascent from `−m` is then trapped: final pose −0.500/−0.4995/−0.440 at `τ`=0.02/0.05/0.10, real regret 0.75, whereas at `τ`≥0.11 it reaches the twin optimum in 237–648 steps (η=0.02). Above `τ_u` the optimum is below the real edge and the twin's "success" is never collected: `f′(0)=R/(4τ)−2cm` gives `τ_u=R/(8cm)=0.25` exactly (bisection: 0.2500); at `τ`=0.24 regret is 0.020 but at 0.26 it is 0.98, and at 0.3/0.5 it is 0.92/0.80. Real regret is smallest just under `τ_u`, on the cliff.
3. **Annealing.** Warm-started ascent while shrinking `τ` geometrically from 0.2 (40 stages) tracks the edge branch through the region where a fixed-`τ` run is trapped: real regret 0.195/0.148/0.080/0.054 at final `τ`=0.1/0.05/0.02/0.01, against 0.75 for fixed-`τ` ascent at 0.05, 0.02 and 0.01 (0.754 at 0.1). Regret falls only like `τ ln(1/τ)`.
4. **Without a twin.** A Gaussian perturbation of std `s` around the nominal pose first crosses the edge with probability 0.5·erfc(m/(s√2)): 0.16 (`s`=0.5), 6.2·10⁻³ (0.2, ≈161 evaluations), 2.9·10⁻⁷ (0.1, ≈3.5·10⁶).
5. **Smoothing as a margin.** Let the twin's edge be at 0 but the real edge at `ε~N(0,s²)`. A hard twin (pose 0) has expected regret ≈0.5 (it misses half the time; 0.499/0.497/0.489/0.460 for `s`=0.02/0.05/0.1/0.2). The Bayes-best fixed pose is 0.049/0.096/0.149/0.176 with expected regret 0.058/0.130/0.229/0.356. The best trainable smoothing (`τ∈[τ_c,τ_u]`, τ=0.225/0.195/0.155/0.105) reaches poses 0.049/0.101/0.148/0.168 and excess regret over the Bayes-best of 0.0001/0.0005/0.0006/0.0014, so a single width tuned to the edge uncertainty is as good as an explicit margin here. But the margin ceiling `max_τ θ̂=0.168` (at τ≈0.11) is below the Bayes-best pose at `s`=0.2, and annealing all the way to `τ=0.02` (pose 0.0745) is worse than the Bayes-best at every `s`: expected regret 0.080/0.146/0.298/0.395 vs 0.058/0.130/0.229/0.356 for `s`=0.02/0.05/0.1/0.2.

## Interpretation
Smoothing width is one knob that sets learnability (`τ_c`), a cliff (`τ_u`), and an implicit margin (`θ̂(τ)`). Anneal only until the twin optimum reaches the margin the edge uncertainty calls for, not to zero; the annealed end point is a design choice, not a convergence criterion. The margin is available for free but is capped by `R`, `c`, `m`.

## Limitations
One parameter and one edge; a logistic smoother only (Gaussian or other kernels shift `τ_c` and `τ_u`, and `τ_u=R/(8cm)` is specific to the logistic derivative `1/4`); deterministic full-batch ascent (stochastic gradients, learned policies and contact dynamics are not modelled); the edge-offset prior is Gaussian and known; normalised parameters were not varied beyond checking the closed form for `τ_u`; a single trap threshold found by bisection assumes one crossing (checked by the tests at ±0.005). No claim about high-dimensional contact.

## Next steps
Gaussian versus logistic smoothing and the resulting thresholds; stochastic-gradient variance through the smoothed edge; a multi-parameter contact task with learned policies in MuJoCo; coupling with `grasp-twin` (a friction twin) and `twin-transfer` (LQ regret).

## References
- Bengio, Y., Louradour, J., Collobert, R. & Weston, J. (2009). Curriculum learning. *ICML*.
- Mordatch, I., Todorov, E. & Popović, Z. (2012). Discovery of complex behaviors through contact-invariant optimization. *ACM Trans. Graphics* 31(4).
- Suh, H. J. T., Pang, T. & Tedrake, R. (2022). Do differentiable simulators give better policy gradients? *ICML*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
