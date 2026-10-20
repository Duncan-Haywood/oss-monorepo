# Validating a digital twin's failure rate against real trials: passing a difference test is not validation

*Scope: stylised Bernoulli-failure model, exact computation, no real twin data.*

## Abstract
A twin of a robot, vehicle or workcell states that a trial fails with probability `q`. Before that number is used, it is checked against `n` real trials with real failure probability `p = c·q`. We compute exactly, by binomial enumeration, what two validators do. A difference test (exact two-sided test of `p = q`) "passes" a twin that is 2× wrong 92% of the time at 500 trials and 22% at 10 000 (q = 10⁻³); rejecting a 2× error with 80% power takes about 11 real failures, 3× about 3.5, a 1.5× error about 38. Because most twins in a plausible prior are not far off, passing lowers the chance of a 2× error only from 0.325 to 0.31 at 0.3 expected failures. An equivalence test (TOST) caps false validation at α but needs about `20/q` real trials for margin 2 and `178/q` for margin 1.25. The binding resource is real failures, not real trials.

## 1. Setting
The twin claims per-trial failure probability `q`; the real system has `p = c·q`. The validator observes `X ~ Bin(n, p)`. *Difference test*: exact minimum-likelihood two-sided binomial test of `H0: p = q` at α = 0.05; the twin "passes" if `H0` is not rejected. *Equivalence test*: two exact one-sided tests (Schuirmann 1987): reject `p ≤ q/D` when `P(X ≥ x | q/D) ≤ α` and reject `p ≥ qD` when `P(X ≤ x | qD) ≤ α`; the twin is "validated" only if both reject, i.e. `x ∈ [x_l, x_h]`. All probabilities below are sums of binomial masses; they are not simulated, except a cross-check (§2 of the results).

## 2. Results (`experiments/results.txt`)
**Exactness.** Pass probability from enumeration vs 20 000 simulated validations: 0.8161/0.8153 (q = 0.005, n = 300, c = 2), 0.4454/0.4459 (q = 10⁻³, n = 2000, c = 3), 0.8658/0.8652 (q = 0.02, n = 200, c = ½).

**A difference test validates wrong twins.** At q = 10⁻³ a twin that is 2× off passes with probability 0.983 / 0.920 / 0.785 / 0.221 at n = 100 / 500 / 2000 / 10 000; 3× off: 0.963 / 0.809 / 0.445 / 0.004; 5× off at n = 500: 0.543. A twin that overstates the failure rate is protected the same way (c = ½ passes with probability ≥ 0.998 up to n = 2000). The perfect twin passes with ≥ 0.963, as it must.

**Failures, not trials.** The trials needed for 80% power to reject scale as `1/q`; in expected failures of the twin, `n·q`, they are 10.7 (c = 2), 3.5 (c = 3), 26.0 (c = ½), 38.2 (c = 1.5) at q = 10⁻³ and 10⁻⁴, matching the Poisson limit (q = 10⁻² is slightly larger: 10.8, 3.4, 27.8, 39.7). The normal approximation `(z₀.₀₂₅ + z₀.₂√c)²/(c−1)²` gives 9.9, 2.9, 26.1, 35.8.

**Passing is weak evidence.** With `ln c ~ N(0, 0.7²)` (an arbitrary prior, sd a factor 2.0) and "bad" meaning off by ≥ 2× (prior probability 0.325), `P(bad | passed)` is 0.308 / 0.292 / 0.254 / 0.137 / 0.013 at `n·q` = 0.3 / 1 / 3 / 10 / 30, and `P(pass | bad)` is 0.882 / 0.827 / 0.652 / 0.267 / 0.015.

**Equivalence testing.** The real failures needed to validate a perfect twin within margin D with 80% power are `n·q` = 10.5 / 19.8 / 55–58 / 178 for D = 3 / 2 / 1.5 / 1.25; the large-count rule `((z₀.₀₅+z₀.₂)/ln D)²` gives 5.1 / 12.9 / 37.6 / 124, i.e. it understates the need by 30–50% at these counts. False validation is at most α at the margin by construction: at q = 10⁻³, D = 2, n = 20 000 the validation probability is 0.049 at c = ½ and 0.043 at c = 2, and 0.82 at c = 1 (validating region 16 ≤ x ≤ 29). The tightest margin a perfect twin can be validated to with 80% power is D = 6.5 / 3.0 / 2.0 / 1.5 / 1.35 / 1.16 at `n·q` = 5 / 10 / 20 / 50 / 100 / 400. Under the same prior, twins validated by TOST(D = 2) at `n·q` = 10 / 30 / 100 are off by ≥ 2× with probability 0.017 / 0.005 / 0.003 (validated with probability 0.14 / 0.39 / 0.54).

## 3. Interpretation
A twin evaluated on a rare failure cannot be validated by a modest real test campaign: the information about `p` is the number of real failures, with relative sd `1/√(n·q)`. With few real failures a difference test cannot reject anything and "passes" everything; the result tells the reader about the campaign size, not the twin. The equivalence framing forces the margin to be stated and prices it in real failures. A rare-failure twin (q = 10⁻³) validated to within 2× needs on the order of 20 000 real trials.

## 4. Limitations
One Bernoulli parameter and independent trials; scenario mix, covariate shift and dependence between trials are not modelled (see `scenario-twin`). `q` is treated as known, though a twin's own `q` is estimated (see `input-twin`, `tilt-twin`). The prior over `c` and the 2× "bad" threshold are illustrative and drive the conditional probabilities in §2. The exact two-sided test is conservative in the lattice sense; power curves have a sawtooth in `n`, handled by requiring the target to hold on the next six grid points (3–5% grid steps), so sample sizes are accurate to a few percent. No Bayesian or sequential validator is compared (see `twin-audit`, `sequential-slashing`), no real data.

## 5. Next steps
Sequential equivalence tests; validation with the twin's own uncertainty in `q`; choosing the margin `D` from a downstream decision loss (see `decision-regret-transfer`); stratified real trials across scenarios; real twin-vs-field failure logs.

## References
- Clopper, C. J. & Pearson, E. S. (1934). The use of confidence or fiducial limits illustrated in the case of the binomial. *Biometrika* 26, 404–413.
- Schuirmann, D. J. (1987). A comparison of the two one-sided tests procedure and the power approach for assessing the equivalence of average bioavailability. *Journal of Pharmacokinetics and Biopharmaceutics* 15, 657–680.
- Kalra, N. & Paddock, S. M. (2016). Driving to safety: how many miles of driving would it take to demonstrate autonomous vehicle reliability? *Transportation Research Part A* 94, 182–193.
- Zhao, D. et al. (2016). Accelerated evaluation of automated vehicles safety in lane-change scenarios based on importance sampling techniques. *IEEE Transactions on ITS* 18, 595–607.
