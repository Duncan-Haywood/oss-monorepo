# A controller planned in a twin that overstates the plant pole is better off looking less far ahead

*Stylised: scalar linear-Gaussian plant, stationary regime. Pure Python; every number is from `experiments/results.txt` (~1 s). E1–E5 are exact formulas; E6 is simulation.*

## Question
Model-predictive control plans `H` steps ahead in a twin. If the twin's dynamics are wrong, does a longer horizon help, and can the twin itself say how long the horizon should be?

## Method
Real plant `x' = a x + b u + w`, `w~N(0,W)`, cost `q x² + r u²` per step. The twin has pole `a_t = m·a` (`b` known). The `H`-step controller runs the Riccati recursion `P₀=P_T`, `K = a_t b P/(r+b²P)`, `P ← q + a_t²P − a_t b P K` for `H` steps and applies the last gain `K_H` (`P_T=0` unless stated; `K₁=0`, `K₂ = a_t b q/(r+b²q)`). A fixed gain gives real cost `J(K) = (q+rK²)W/(1−(a−bK)²)` if `|a−bK|<1`, else infinity; the twin's claim is the same formula with `a_t`. Tests confirm `K_H` is nondecreasing in `H` (grid of poles and costs), so `K_H` climbs from below to `K_∞(a_t)`.

## Results
1. **Non-monotone in H** (`a`=0.9, `b`=1, `q`=1, `r`=1, `J*`=1.484). `m`=1.5: `J` = 1.533/1.786/1.862/1.879 at `H`=2/3/4/10; `m`=2: 1.810/3.219/3.822/3.966 at `H`=2/3/4/10; `m`=3: 3.539 at `H`=2, unstable for `H`≥3. For `m`=0.5 it falls with `H` (1.930 at `H`=2, 1.887 from `H`=4). Mechanism: when `K_∞(a_t)` exceeds the real optimal gain (1.402 vs 0.538 at `m`=2), the horizon at which `K_H` crosses the real optimum is best, and it is short.
2. **Size of the effect** (best horizon on `H`≤60 vs `H`=60, real cost known): at `m`=2 the saving is 12%/54%/79%/91% for `r`=0.1/1/5/20 with `H*`=2; at `m`=1.2 it is 0.3%/3.7%/8.4%/21%; understated poles (`m`=0.5, 0.8) give no saving and a long `H*`. In some cells the short horizon is within 1% of the true optimum only because `K_H` happens to cross `K*` (e.g. `m`=3, `r`=20: 1.0000; `m`=1.2, `r`=1: 1.0000); this is coincidence of one crossing, not a property.
3. **The twin ranks horizons backwards** (`m`=2, `r`=1): claim 9.53/3.58/3.53/3.52 at `H`=2/3/6/60 against real 1.81/3.22/3.96/3.97. Choosing `H` by the twin's own claim always selects the longest horizon.
4. **Instability edge.** The long-horizon controller is unstable from `m`=2.263/2.510/2.570 (`r`=0.1/1/5, `H`=60, bisection). For `H`=2 the edge is exactly `m = (1+a)(r+b²q)/(abq)`: 2.322/4.222/12.667, confirmed by bisection to 3 digits and tested. `H`=3 is in between (2.264/2.658/3.345). At `r`=0.1, `m`=3 only `H`=1 (open loop, `K`=0) survives.
5. **Terminal cost.** With `P_T` set to the twin's own `P_∞`, `K_H` equals `K_∞(a_t)` for every `H` (1.4021 for `H`=1, 2, 5, 20 at `m`=2, `r`=1), real cost 3.966: the robustness of a short horizon comes from the *missing* terminal cost, not from the horizon as such.
6. **Simulation** (400,000 steps): exact vs simulated 1.8100/1.8119 (`m`=2, `H`=2), 3.9657/3.9784 (`H`=60), 1.8869/1.8918 (`m`=0.5, `H`=6).

## Limitations
Scalar plant, only the pole wrong, `b` known and exact; multivariable plants, unmodelled input error (see `control-twin`) and process-noise mismatch are not covered. The best horizon is picked using the real cost, which a practitioner lacks; how to choose `H` from a few real rollouts, and its variance, are not studied. Terminal cost is 0 or `P_∞`; intermediate terminal costs interpolate but were not scanned. No constraints, no estimator, no robot data. Preliminary.

## Next steps
Choosing `H` (or a terminal cost) from a few real rollouts with a confidence guarantee; the min-max terminal cost over a twin uncertainty set; the multivariable case where `K_H` need not be monotone; the same question for sampling-based planners with a learned twin.

## References
- Kwon, W. H., Pearson, A. E. (1977). A modified quadratic cost problem and feedback stabilization of a linear system. *IEEE Trans. Automatic Control* 22(5).
- Mayne, D. Q., Rawlings, J. B., Rao, C. V., Scokaert, P. O. M. (2000). Constrained model predictive control: stability and optimality. *Automatica* 36(6).
- Rawlings, J. B., Mayne, D. Q. (2009). *Model Predictive Control: Theory and Design*. Nob Hill.
- Janner, M., Fu, J., Zhang, M., Levine, S. (2019). When to trust your model: model-based policy optimization. *NeurIPS*.
- Anderson, B. D. O., Moore, J. B. (1971). *Linear Optimal Control*. Prentice-Hall.
