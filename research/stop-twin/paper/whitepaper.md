# Stop on failures, not on width: a twin run that stops when its interval looks narrow claims zero risk 90% of the time

*Stylised: Bernoulli failures with a fixed, known-to-the-simulator rate `p` (a safety twin's per-rollout failure probability). Pure Python; every number is from `experiments/results.txt` (seeded, ~1 min). The twin is assumed faithful for this note; twin-versus-real bias is the subject of `safety-twin` and `scenario-twin`. No lab data.*

## Question
A digital twin is used to estimate a rare failure probability, and the run length is chosen by the cheapest-looking rule: keep simulating until the Wald interval `p̂ ± 1.96√(p̂(1−p̂)/n)` is narrower than a target `ε`. How does that rule behave when failures are rare, and what should the stopping rule be instead?

## Model
Draws are iid Bernoulli(`p`). (i) *Sequential Wald*: check every 100 draws from `n₀=100`, stop when the half-width is `≤ ε`. (ii) *Inverse sampling*: run until the `m`-th failure, at draw `N`. Then `P(N=n)=C(n−1,m−1)pᵐ(1−p)ⁿ⁻ᵐ` and `P(N≤n)=P(Bin(n,p)≥m)`. The estimator `(m−1)/(N−1)` is exactly unbiased (Haldane 1945), `m/N` is biased up by about `m/(m−1)`, and the relative standard deviation of the unbiased estimator is about `1/√(m−2)`, so relative precision `r` needs `m=2+1/r²` failures whatever `p` is. An exact conservative interval inverts the binomial identity above (lower limit solves `P(Bin(n,p)≥m)=α/2`, upper solves `P(Bin(n−1,p)≤m−1)=α/2`).

## Results
1. **Moments are exact.** Summing the negative-binomial pmf gives `E[(m−1)/(N−1)]/p=1.000000` for every `(m,p)` tried; `E[m/N]/p` is 1.2496/1.0344/1.0101 at `m`=5/30/100, `p`=10⁻³ (`m/(m−1)`: 1.25/1.0345/1.0101); the sd of the unbiased estimator over `p` is 0.5768/0.1889/0.1010 vs `1/√(m−2)`=0.5774/0.1890/0.1010.
2. **Sequential Wald stops on zero failures.** A run with no failures has `p̂=0` and half-width 0, so it stops at the first check. With `ε=p/5`: 37.2% of runs stop with zero failures at `p`=10⁻² (exact `(1−p)¹⁰⁰`=36.6%), 90.1% at 10⁻³ (90.5%), 99.1% at 10⁻⁴ (99.0%). The interval covers `p` in 59.7%, 9.6% and 0.9% of runs; at 10⁻³ the mean reported `p̂` is 9.8×10⁻⁵ (10× too low) with median run length 100 draws where 95 940 are needed.
3. **The guard, not the sequential peek, is what matters here.** Requiring at least `f` failures before stopping is allowed restores coverage at `p`=10⁻³, `ε`=2×10⁻⁴: 0.938/0.938/0.942/0.941 at `f`=1/5/10/30 (0.100 at `f`=0), mean `p̂/p` 0.99. This does not show a sequential Wald rule is safe in general: `ε` here already forces ~96 failures, so the guard rarely binds after the first failure (single configuration, 2000 runs, standard error ~0.5 points).
4. **Inverse sampling** (`p`=10⁻³, 2000 runs): mean unbiased estimate/`p` = 0.994/0.996/1.000/1.001 at `m`=10/30/100/400, vs naive `m/N`: 1.104/1.031/1.010/1.003. The exact interval covers 95.0%/95.3%/95.5%/95.5%, with mean upper/lower ratio 3.56/2.06/1.48/1.22; empirical relative sd 0.359/0.186/0.101/0.049.
5. **Precision does not depend on knowing `p`.** `m`=14/27/102/402 gives relative sd 0.3/0.2/0.1/0.05. A fixed `n=95 940` planned for a 20% half-width at `p₀`=10⁻³ delivers 6%, 20%, 37%, 63%, 200% at `p`=10⁻², 10⁻³, 3×10⁻⁴, 10⁻⁴, 10⁻⁵ (38% chance of zero failures at 10⁻⁵). Inverse sampling with `m`=102 takes `102/p` draws (10 200 to 10.2M) and always has relative sd 0.10.

## Limitations
Iid Bernoulli draws with a known-faithful twin; no autocorrelation (`autocorr-twin`), no twin bias or heavy-tailed real gusts (`safety-twin`), no importance sampling (`scenario-twin`). The exact interval is conservative (coverage 95.0–95.5%, not lower). Sequential Wald is shown at one grid (`n₀=step=100`); other check schedules change the numbers but not the zero-failure trap. The `1/√(m−2)` law is asymptotic in small `p` (exact sd is within 6% at `m`=5, `p`=0.05). Expected run length `m/p` is unbounded if `p` is far smaller than believed, so a cap is needed in practice and a capped run is a different (censored) design not analysed here.

## Next steps
Cap and censoring; inverse sampling under the importance-weighted twin of `scenario-twin`; a two-sample version for comparing twin and real failure rates; combining with `twin-audit`'s sequential audit of the twin itself.

## References
- Haldane, J. B. S. (1945). On a method of estimating frequencies. *Biometrika* 33(3), 222–225.
- Chow, Y. S. & Robbins, H. (1965). On the asymptotic theory of fixed-width sequential confidence intervals for the mean. *Annals of Mathematical Statistics* 36(2), 457–462.
- Brown, L. D., Cai, T. T. & DasGupta, A. (2001). Interval estimation for a binomial proportion. *Statistical Science* 16(2), 101–133.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
