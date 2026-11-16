# Slashing without peeking bias: anytime-valid tests for verifier calibration

*Working note, MIT licensed. Pure-Python, stdlib only; R1 to R4 are exact (dynamic programme), R5 is Monte Carlo with stated error. The fault rates, effect sizes and the spread of claimed rates are assumed, not measured from any protocol, and are swept rather than fixed where it matters (R4). No claims about any deployed protocol.*

## Motivation
`spot-check-slashing`, `verification-game` and `decision-regret-transfer` treat slashing as a one-shot decision.
A live protocol instead sees outcomes stream in and would like to slash *as soon as* evidence is strong. Naively re-running a fixed-sample test after every outcome ("peeking") breaks the false-positive guarantee, which in a staked system means honest verifiers lose stake more often than the stated rate.
This note applies e-processes / test martingales [1, 4, 6, 7] to verifier calibration. The link to proper scoring is direct: the log of the LR e-process after t rounds is the cumulative logarithmic-score difference Σ[ln q(y_s) − ln p(y_s)] between forecasts q and p [10].

**Position and novelty.** The method is not new. Ville [1] gives the guarantee, Wald [2] the delay bound, Robbins [3] the mixture, and the betting form and its time-varying version are standard [6, 8]. Sequentially valid tests of forecast calibration are developed in full by Arnold, Henzi and Ziegel [9] and, for comparing forecasters, by Choe and Ramdas [11]; this note should be read as an application of that work to staked verifiers, with exact (dynamic-programming) operating characteristics, not as a new test. What it adds is narrow: exact false-slash and delay numbers for the slashing setting, a sweep over the claimed fault rate showing where a naive bet grid fails (R4), and the time-varying claim case a protocol actually faces (R5).

## Model (`src/sequential_slashing/model.py`)
A verifier reports fault probability p each round; y_t∈{0,1} is the audited outcome. H0: y_t~Bern(p) (calibrated). A cheater's true rate is q>p (it under-reports faults).
Slash when an e-process E_t (nonnegative, E[E_t | past] ≤ E_{t−1} under H0) reaches 1/α.
- **LR e-process**: factors q/p or (1−q)/(1−p); needs q.
- **Mixture e-process**: equal-weight mixture over K bet sizes λ∈(0,1/p) in factors 1+λ(y−p); needs no q. The grid is uniform in λ (original) or log-spaced from 10⁻³/p to 1/p (`spacing="log"`, added 2026-11-16).
- **Time-varying mixture** (`run_mixture_tv`): the verifier announces p_t before y_t; factors 1+c(y_t−p_t)/p_t for c∈(0,1), optionally averaged with the down-bets 1−c(y_t−p_t)/(1−p_t) to also catch over-reporting. Each factor has conditional mean one under H0 and is ≥ 1−c > 0, so Ville applies. The bet family (`family=`, added 2026-11-16) says how c is chosen each round: `additive` keeps c fixed, so each component is the likelihood ratio of a true rate p_t + c(1−p_t); `scale` sets c = (r−1)p_t/(1−p_t) (down: c = 1 − 1/r) for ratios r log-spaced in (1, 20], so each component is the likelihood ratio of a true rate r·p_t (or p_t/r); `both` averages the two. Any predictable c_t keeps validity, so the family changes power only.
- **Exact operating characteristics** (`exact.py`): with constant p every rule depends on the data only through (t, s_t) and is monotone in s_t, so it is a boundary c(t); propagating the Binomial mass gives exact P(slash by T) and the exact delay distribution. A test checks that the boundary reproduces the shipped `run_*` stopping times on 240 sequences.
- **Peeking z-test**: one-sided z-test at level α re-run every round from t=30.

## Results (p=0.2, q=0.3, α=0.05, KL=0.0282 nats)
Exact values are from `experiments/results_exact.txt` (`exact_and_tv.py`); Monte Carlo values from `experiments/results.txt` (`run.py`) are kept for comparison and carry the stated sampling error.

**R1 (Ville: the guarantee survives continuous monitoring).** For any e-process, P_H0(∃t: E_t ≥ 1/α) ≤ α. Hence an honest verifier's expected slashed stake is ≤ α·S regardless of how often the protocol looks. Exact false-slash probability within 2000 rounds: LR **0.0432**, mixture (K=32) **0.0310**; the peeking z-test slashes **0.3731** of honest verifiers, 7.5× nominal. (The Monte Carlo figures 0.038 and 0.020 are within their sampling error; the 0.020 rested on 300 trials, ±0.008.)

**R2 (detection delay ≈ ln(1/α)/KL).** Wald's bound says a level-α test that detects with probability ≈1 has E_q[τ] ≳ ln(1/α)/KL(q‖p) (the exact form carries a binary-KL term in the detection probability). For the LR e-process this is not an empirical finding: by Wald's identity E[τ]·KL = E[ln E_τ] ≥ ln(1/α), so it can only exceed the bound, by the overshoot of the last step. The exact overshoot is +5.1% at the headline setting (111.8 vs 106.4), +3% to +9% across α = 0.2 … 0.001 (62.4/57.1, 111.8/106.4, 169.2/163.5, 251.0/245.2) and +3% to +14% across q = 0.25 … 0.6, the largest where τ < 10. Delay is logarithmic in 1/α: 200× more conservative costs about 4× the rounds.

**R3 (price of ignorance).** The q-free mixture slashes the same cheater after **159.2** rounds on average (exact) vs 111.8 for the oracle LR, a factor **1.42**, and detects with probability ≈1 by T=3000. (The Monte Carlo run gives 162 vs 119, ×1.36, from 300 and 600 trials.)

**R4 (the bet grid matters at small fault rates).** Sweeping the claimed rate p ∈ {0.01, 0.05, 0.2, 0.5} with a cheater at 1.5p (exact, horizon 12× Wald's bound): the peeking z-test's false-slash rate stays 0.36 to 0.38 at every p, LR stays 0.041 to 0.044, and both mixtures stay ≤ 0.035. But the uniform grid's smallest bet is 1/(2K) of the maximum, while the growth-optimal (Kelly) bet for q = 1.5p at p = 1% is about 0.005 of it; every bet on the grid then loses on average, and the mixture detects only **26%** of cheaters within 33,000 rounds. A log-spaced grid detects essentially all of them at 1.40× the oracle delay (4018 vs 2865 rounds), and at p = 0.05 cuts the price from 1.94× to 1.40×; it costs at p = 0.5 (1.51× vs 1.14×). The uniform grid is the wrong default for rare-fault verifiers.

**R5 (time-varying claims).** With p_t log-uniform on [0.01, 0.3] each round (T=1000, 400 trials, ±1 SE): the peeking z-test (heterogeneous variance) falsely slashes 0.345±0.024 of honest verifiers; the time-varying mixture 0.028±0.008 one-sided, 0.022±0.007 two-sided, 0.005±0.004 two-sided log-grid. A verifier under-reporting faults by a factor 1.5 is caught within 1000 rounds only 45–54% of the time by the valid tests (the effect is small at the low-p_t rounds); one over-reporting by 2× is caught 99.8% of the time by the two-sided mixture and never by the one-sided one, which by construction only bets on more faults.
**R6 (pooling drifting reports breaks even a valid e-process).** An honest verifier reports 0.4 for 300 rounds and 0.1 for the next 1700, and is calibrated throughout. A constant-p mixture run at the average report (0.145) is a valid e-process for a verifier whose rate really is 0.145, but not for this one: it slashes with probability **1.000000** within 2000 rounds (exact; the boundary DP with the per-round rate). The per-round mixture slashes 4.5% [3.7, 5.6] one-sided and 4.0% [3.2, 5.0] two-sided (2000 trials, Wilson 95%). R5's peeking z-test fails for a different reason (optional stopping); this failure is the misspecified null, and continuous monitoring is not needed to cause it. (`experiments/drift.py`, `results_drift.txt`, E8.)

**R7 (the per-round test's bet family must match how the cheater misreports).** Reports i.i.d., T = 3000, 400 trials per cell, α = 0.05, K = 32 per family (E9). With reports log-uniform on [0.01, 0.3]:

| test | cheater, true rate 1.5 p_t: detected, median delay | cheater, true rate p_t + 0.02: detected, median delay | honest: false slash |
|---|---|---|---|
| pooled constant-p mixture, uniform grid | 1.000, 476 | 0.652, 1794 | 0.020 |
| pooled constant-p mixture, log grid | 1.000, 354 | 0.840, 1316 | 0.025 |
| per-round additive, uniform grid (R5's test) | 0.980, 1124 | 0.958, 1188 | 0.033 |
| per-round additive, log grid | 0.993, 722 | 0.983, 740 | 0.028 |
| per-round scale | 1.000, 328 | 0.708, 1509 | 0.037 |
| per-round both (additive log + scale) | 1.000, 388 | 0.980, 910 | 0.035 |

The per-round additive test is slow against a cheater who scales its reports because the growth-optimal fraction for q_t = 1.5p_t is c_t = 0.5p_t/(1−p_t), which moves with p_t, while each additive component holds c fixed; it is the right family for a cheater who adds a fixed amount. The scale family is the mirror image. Neither wins both columns; mixing them (`family="both"`) costs at most a factor 2 in evidence (ln 2 nats of threshold) and has a median delay within about a quarter of the matched family's in both columns at these rates (388 vs 328, 910 vs 740). With reports U[0.05, 0.35] the same ordering holds with smaller gaps (scaling cheater: additive uniform 160, scale 131, both 136; additive cheater +0.02 detected by T: additive log 0.615, scale 0.350, both 0.575). Two-sided, all three families catch a verifier whose true rate is p_t/2 in every trial (median 224 to 263 rounds at the low rates). The pooled tests look strong in the scaling column only because i.i.d. reports make pooling valid; R6 is what they do when reports drift. Honest false-slash rates stay between 0.020 and 0.037 in every cell. The two cheater shapes and their sizes are illustrative, not observed.

## Implications
1. State slashing guarantees as *anytime-valid*: "honest loss ≤ αS at any monitoring schedule" is a theorem for e-processes and false for repeated z/p-value tests.
2. The protocol can price the trade-off directly: stake needed to deter is a function of α (false-slash insurance, ≤αS) and expected detection delay ln(1/α)/KL times the per-round cheating gain; the log dependence means small α is cheap.
3. Test each round against that round's report, never a pooled average (R6), and bet with a family that covers both proportional and additive misreporting (R7, `family="both"`, log grid).
4. Effect size dominates: delay scales as 1/KL, so subtle miscalibration (q=0.25) takes ~4× longer than q=0.3 — small biases are only deterred if the per-round gain is also small (cf. `spot-check-slashing`).

## Limits
i.i.d. outcomes given the claims; no adaptive adversary who chooses which rounds to be honest in (the mixture is valid against any H0 sequence, but its power against a strategic cheater is not studied); no stake or incentive model layered on top; the p_t distribution in R5 is an assumed log-uniform spread, not measured verifier data, and the 1.5× and 2× miscalibrations are illustrative effect sizes, not observed ones. The mixtures are fixed grids, not the conjugate Beta mixture of Robbins [3] or a predictable plug-in bet [8]; either may beat both grids here, and that comparison is not made. The exact DP covers constant p only; R5 and R7 are Monte Carlo (R6's pooled rule is exact). R7 tests two cheater shapes; a cheater who misreports in some third way (e.g. only at high p_t) is not covered by either family's design, though validity holds regardless.

## References
[9] and [11], the nearest prior work, were checked by web search on 2026-11-16 (DOIs below); the others are given from memory and were not re-opened (the registries were unreachable from the session).
1. J. Ville (1939). *Étude critique de la notion de collectif.* Gauthier-Villars.
2. A. Wald (1945). Sequential tests of statistical hypotheses. *Annals of Mathematical Statistics* 16(2), 117–186.
3. H. Robbins (1970). Statistical methods related to the law of the iterated logarithm. *Annals of Mathematical Statistics* 41(5), 1397–1409.
4. G. Shafer, A. Shen, N. Vereshchagin, V. Vovk (2011). Test martingales, Bayes factors and p-values. *Statistical Science* 26(1), 84–101.
5. S. R. Howard, A. Ramdas, J. McAuliffe, J. Sekhon (2021). Time-uniform, nonparametric, nonasymptotic confidence sequences. *Annals of Statistics* 49(2), 1055–1080.
6. G. Shafer, V. Vovk (2019). *Game-Theoretic Foundations for Probability and Finance.* Wiley.
7. A. Ramdas, P. Grünwald, V. Vovk, G. Shafer (2023). Game-theoretic statistics and safe anytime-valid inference. *Statistical Science* 38(4), 576–601.
8. I. Waudby-Smith, A. Ramdas (2024). Estimating means of bounded random variables by betting. *Journal of the Royal Statistical Society, Series B* 86(1), 1–27.
9. S. Arnold, A. Henzi, J. F. Ziegel (2023). Sequentially valid tests for forecast calibration. *Annals of Applied Statistics* 17(3), 1909–1935. doi:10.1214/22-AOAS1697
10. T. Gneiting, A. E. Raftery (2007). Strictly proper scoring rules, prediction, and estimation. *Journal of the American Statistical Association* 102(477), 359–378.
11. Y. J. Choe, A. Ramdas (2024). Comparing sequential forecasters. *Operations Research* 72(4), 1368–1387. doi:10.1287/opre.2021.0792
