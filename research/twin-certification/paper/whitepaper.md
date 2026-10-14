# A twin prior cannot buy real trials at a fixed level: certifying a failure rate with a digital twin

*Stylised: real trials i.i.d. Bernoulli(`p`); target `p < ε = 0.01` at `δ = 0.05`; the twin is summarised by `f = 2` failures in `N = 20000` rollouts (claim `p = 10⁻⁴`) unless stated. Pure Python; every number is from `experiments/results.txt`. Size and power are exact binomial sums, checked against 20000-run simulation (0.2366 exact vs 0.2371 simulated at `n = 400, c = 2`).*

## Question
Simulation is cheap; real trials are not. If a digital twin says the failure rate is far below `ε`, how many real trials does a certificate that `p < ε` still need, and what does trusting a wrong twin cost?

## Setup and a structural fact
Real trials give `k ~ Bin(n,p)`. A rule certifies iff `k ≤ c`. Since `P(Bin(n,p) ≤ c)` is decreasing in `p`, the worst-case false-certification probability over the composite null `p ≥ ε` is exactly `P(Bin(n,ε) ≤ c)`. By Karlin–Rubin the uniformly most powerful level-`δ` test uses the largest `c*` with `P(Bin(n,ε) ≤ c*) ≤ δ` (Clopper–Pearson). A Bayesian rule "certify iff `P(p ≥ ε | k,n) ≤ δ`" has threshold `c_B`; it is valid at worst case iff `c_B ≤ c*`. A prior is therefore a way to move `c`, and moving it up trades validity for power one-for-one. The Bayesian guarantee that does hold is prior-averaged: `P(certify and p ≥ ε) ≤ δ` when `p` is drawn from the prior (tested by exact enumeration; 0.0047 for `w = 0.01`, `n = 300`). The twin enters as a power prior `Beta(½ + wf, ½ + w(N − f))`.

## Results
1. **Baselines are already anti-conservative.** The exact zero-failure size is 299 trials (size 0.0495). The uniform prior gives 298 (size 0.0500, one trial fewer and just valid). Jeffreys gives 191 trials at worst-case size 0.147; at `n = 1000` it uses `c = 5` against the exact 4 (size 0.066 vs 0.029). Credible bounds with weak priors are known to under-cover (Brown–Cai–DasGupta 2001); the twin effect below is on top of this.
2. **Twin weight moves `c` and the size jumps.** At `n = 300` the exact and `w = 0.003` rules use `c = 0` (size 0.049), `w = 0.01` uses `c = 1` (0.198), `w = 0.03` uses `c = 4` (0.816). At `n = 500`: 0.040 (exact), 0.123 (`w` = 0.003, 0.01), 0.616 (0.03). At `w ≥ 0.01` the twin's claim alone certifies with `n = 0` real trials (size 1). The twin's zero-failure sample size falls to 172 (`w = 0.001`, size 0.178) and 133 (`w = 0.003`, size 0.263).
3. **No level-matched saving.** Real `n` for power 0.9 at `p = ε/3`: exact at level 0.05 needs 1441. Jeffreys uses 1116 at size 0.0713; the exact test held to level 0.0713 also needs 1116. Twin `w = 0.003` uses 1057 at size 0.0970; the exact test at level 0.0970 needs 1057. The whole "saving" is the level change.
4. **A wrong twin.** At `n = 400`, `w = 0.01`, a twin claiming ≤ ε/10 gives `c = 2`, size 0.237 and power 0.850 at `ε/3` (exact test: `c = 0`, size 0.018, power 0.263); claiming ε/2 gives `c = 1` (size 0.091); a twin claiming ε reproduces the exact test; claiming 2ε or 5ε gives `c = −1` (never certify, power 0 even at `p = ε/10` where the exact test has 0.670). Optimism costs validity, pessimism costs the entire certificate.
5. **Safe weight.** The largest `w` (twin claiming ε/100) with worst-case size ≤ 0.06 is 0.0046 at `n = 299` (91.6 twin-trial equivalents), 0.0026 at `n = 500` (52), and 0 at `n = 1000` where Jeffreys alone has size 0.066 (0.0058, 117 equivalents, for size ≤ 0.08). Tolerances 0.05–0.10 give the same weight at `n = 299, 500` because `c` and the size are discrete.

## Limitations
One scalar failure probability, i.i.d. trials, hard threshold. The twin is used only through failure counts; twin-side variance reduction (importance sampling, control variates on a continuous safety margin) is not covered and can genuinely reduce real-trial needs by making the statistic sharper, which this analysis does not exclude. A twin is not a Bernoulli source of the real failure law, and the discount `w` is chosen, not estimated. No real trial or robot data.

## Next steps
Continuous safety margins with the twin as a control variate (companion to the `twin-*` projects), sequential (SPRT / e-process) certification where the twin chooses the stopping plan, estimating `w` from paired twin/real trials, and rare-event importance sampling inside the twin.

## References
- Clopper, C. J. & Pearson, E. S. (1934). The use of confidence or fiducial limits illustrated in the case of the binomial. *Biometrika* 26(4), 404–413.
- Karlin, S. & Rubin, H. (1956). The theory of decision procedures for distributions with monotone likelihood ratio. *Ann. Math. Statist.* 27(2), 272–299.
- Brown, L. D., Cai, T. T. & DasGupta, A. (2001). Interval estimation for a binomial proportion. *Statistical Science* 16(2), 101–133.
- Ibrahim, J. G. & Chen, M.-H. (2000). Power prior distributions for regression models. *Statistical Science* 15(1), 46–60.
- Corso, A., Moss, R., Koren, M., Lee, R. & Kochenderfer, M. (2021). A survey of algorithms for black-box safety validation of cyber-physical systems. *J. Artificial Intelligence Research* 72, 377–428.
