# Slashing without peeking bias: anytime-valid tests for verifier calibration

*Working note, MIT licensed. Pure-Python numerical checks, no claims about any deployed protocol. The method is textbook (Ville, Wald, Robbins, testing by betting); what this note adds is listed under "What is new here, and what is not".*

## Motivation
`spot-check-slashing`, `verification-game` and `decision-regret-transfer` treat slashing as a one-shot decision.
A live protocol instead sees outcomes stream in and would like to slash *as soon as* evidence is strong. Naively re-running a fixed-sample test after every outcome ("peeking") breaks the false-positive guarantee, which in a staked system means honest verifiers lose stake more often than the stated rate.
This note applies e-processes / test martingales [1, 4, 5] to verifier calibration.

## Model (`src/sequential_slashing/model.py`)
A verifier reports fault probability p_t before round t; y_t∈{0,1} is the audited outcome. H0: y_t~Bern(p_t) given the past (calibrated). A cheater's true rate is above p_t (it under-reports faults); an over-reporter's is below.
Slash when an e-process E_t (nonnegative, E[E_t | past] ≤ E_{t−1} under H0, E_0 = 1) reaches 1/α.
- **LR e-process** (constant p): factors q/p or (1−q)/(1−p); needs q.
- **Mixture e-process** (constant p): uniform mixture over K bet sizes λ = c/p, c on a midpoint grid in (0,1), in factors 1+λ(y−p); needs no q.
- **Per-round mixture** (`run_mixture_varying`, reports p_t): factors 1 + c(y−p_t)/p_t (one-sided, "faults exceed reports"), 1 − c(y−p_t)/(1−p_t) ("faults fall short"), or the average of the two mixtures (two-sided). Each factor has conditional mean one for any predictable p_t, so the product is a test martingale. With constant p_t it is identical to the constant-p mixture (checked in the tests).
- **Peeking z-test**: one-sided z-test at level α re-run every round from t=30.

For constant p every statistic above depends on the outcomes only through (t, s), the step and the fault count, and is increasing in s. `exact_stop_dist` therefore computes the exact distribution of the stopping time by a dynamic program over (t, s) that calls the same decision rule (`stopped`) the simulators use. It agrees with brute-force enumeration of all 2^12 paths through the simulators to 12 decimal places, and with an independent recomputation made for the 2026-11-07 quality audit (0.3731, 0.0432, 111.8). E1–E4 and E6 are exact; only E5 (reports varying by round) is Monte Carlo, quoted with Wilson 95% intervals.

## Results (`experiments/results.txt`; p=0.2, q=0.3, α=0.05, KL=0.0282 nats unless stated)
**R1 (Ville: the guarantee survives continuous monitoring).** For any e-process, P_H0(∃t: E_t ≥ 1/α) ≤ α [1, 5]. Hence an honest verifier's expected slashed stake is ≤ α·S regardless of how often the protocol looks. Exact false-slash probability over 2000 rounds: LR 0.0432, mixture (K=32) 0.0310, both ≤ 0.05; the peeking z-test slashes **0.373** of honest verifiers, 7.5× nominal. (An earlier version quoted 0.038 and 0.020 from 2000 and 300 simulated trials.)

**R2 (detection delay ≈ ln(1/α)/KL).** For the LR e-process, E[τ] ≥ ln(1/α)/KL(q‖p) when it detects with probability one: this is Wald's identity applied to the stopped log-likelihood ratio [2], not an empirical finding, and for a general level-α test the bound carries a power term (it is [(1−β)ln((1−β)/α) + β ln(β/(1−α))]/KL for power 1−β). The exact numbers show how small the overshoot over that bound is: mean τ = 111.8 vs 106.4 (5.1% over) at α=0.05; 251.0 vs 245.2 (2.3%) at α=0.001; 415.7 vs 405.8 (2.4%) at q=0.25. Relative overshoot grows only when τ is small (9.3% at q=0.4, τ≈31; 13.1% at q=0.6, τ≈9), because the last step's jump is a larger share of the threshold. Delay is logarithmic in 1/α: 200× more conservative costs 4× the rounds (62→112→169→251 as α=0.2→0.001).

**R3 (price of ignorance).** The q-free mixture slashes the same cheater after 159.2 rounds on average vs 111.8 for the oracle, a factor 1.43 (an earlier simulated estimate was 1.36), and still detects with probability 1 − 10⁻¹⁴ by T=3000. A sweep over p (E6, q = 1.5p, exact) puts the factor between 1.16 (p=0.4) and 1.93 (p=0.05): the uniform grid over the betting fraction wastes most of its weight when the useful bet is small, which is the low-p case. At p=0.02 the mixture detects only 84% of cheaters within 6000 rounds (the LR 99%), so its conditional mean there is optimistic. Mixture false-slash rates stay between 0.020 and 0.036 for p from 0.02 to 0.4; the peeking z-test falsely slashes 0.32 to 0.44.

**R4 (reports that vary by round; two-sided tests).** A verifier's reports change by round, and a test that pools them into one average rate is no longer valid. In E5(a) an honest verifier reports 0.4 for 300 rounds and then 0.1; the constant-p mixture at the average report (0.145) slashes it in every one of 2000 trials (mean 21 rounds), while the per-round mixture slashes 3.3% [2.6, 4.2] one-sided and 4.2% [3.4, 5.2] two-sided. With reports drawn i.i.d. from U[0.05, 0.35] (E5(b)), the honest false-slash rate of the two-sided per-round test is 4.4% [3.6, 5.4]. Using each round's report does **not** speed detection of a cheater whose true rate is 1.5 p_t: the constant-p mixture at the mean report (valid here, because i.i.d. reports make the outcomes i.i.d. Bernoulli(0.2) under H0) slashes after 157 rounds on average, the per-round one-sided mixture after 211, two-sided after 245. The reason is the bet family: a fraction c shared across rounds is the likelihood ratio for alternatives q_t = p_t + c(1−p_t), while this cheater scales its reports (q_t = 1.5 p_t), whose per-round optimal c = 0.5 p_t/(1−p_t) moves with p_t. The per-round test buys validity under drift, not power, unless the bet family matches how the cheater misreports. Only a two-sided test can slash a verifier that over-reports faults (true rate p_t/2): the one-sided test never fired in 500 trials, the two-sided one fired in all of them (mean 116 rounds). Validity with varying reports is also checked exactly in the tests, by enumerating all 2^14 outcome paths for a fixed report sequence (false-slash ≤ α on each side).

## What is new here, and what is not
Not new: the guarantee (Ville [1]), the delay bound (Wald [2]), the mixture method (Robbins [3]), betting e-processes for bounded means [6, 7], and sequential calibration testing of probability forecasts, which Arnold, Henzi and Ziegel treat with e-values in general [8] and Choe and Ramdas extend to comparing forecasters with confidence sequences [9]. This note's per-round mixture is a special case of those constructions, not an improvement on them.
What the note contributes is narrower: exact (not simulated) false-slash and delay numbers for the slashing setting, including how badly the peeking z-test fails and how much a q-free bet costs across p; the demonstration that pooling reports into an average rate is not just weak but invalid when reports drift, and that the per-round fix costs power when its bet family does not match the cheater; and an explicit list of what a stake model would need. A referee at a statistics venue would call it an application note.

## Implications
1. State slashing guarantees as *anytime-valid*: "honest loss ≤ αS at any monitoring schedule" is a theorem for e-processes and false for repeated z/p-value tests.
2. Test each round against that round's report, not against an average: pooling makes an honest verifier with drifting reports look like a cheater.
3. The protocol can price the trade-off directly: stake needed to deter is a function of α (false-slash insurance, ≤αS) and expected detection delay ≈ ln(1/α)/KL times the per-round cheating gain; the log dependence means small α is cheap.
4. Effect size dominates: delay scales as 1/KL, so subtle miscalibration (q=0.25) takes ~3.7× longer than q=0.3. Small biases are only deterred if the per-round gain is also small (cf. `spot-check-slashing`).

## Limits
The headline numbers are at one illustrative claimed rate (p=0.2, q=0.3); E6 sweeps p from 0.02 to 0.4, and q = 1.5p is an assumed effect, not a measured one; no rate here is taken from a deployed verifier, because no public data on verifier fault rates was found. No adaptive adversary who chooses which rounds to be honest in (the per-round mixture is valid against any predictable report sequence, but its power against a strategic cheater is not studied); the per-round bet family (a shared fraction c) is not matched to a cheater who scales its reports, and a mixture over c/(1−p_t)-type families is untested; no composite null and no confidence sequence for the fault rate; the mixture is a uniform grid over the betting fraction, not the conjugate Beta mixture or an online-learned bet [6]; no stake or incentive model layered on top.

## References
1. J. Ville. *Étude critique de la notion de collectif.* Gauthier-Villars, Paris, 1939.
2. A. Wald. Sequential tests of statistical hypotheses. *Annals of Mathematical Statistics* 16(2):117–186, 1945.
3. H. Robbins. Statistical methods related to the law of the iterated logarithm. *Annals of Mathematical Statistics* 41(5):1397–1409, 1970.
4. G. Shafer and V. Vovk. *Game-Theoretic Foundations for Probability and Finance.* Wiley, 2019.
5. A. Ramdas, P. Grünwald, V. Vovk and G. Shafer. Game-theoretic statistics and safe anytime-valid inference. *Statistical Science* 38(4):576–601, 2023. doi:10.1214/23-STS894.
6. I. Waudby-Smith and A. Ramdas. Estimating means of bounded random variables by betting. *Journal of the Royal Statistical Society, Series B* 86(1):1–27, 2024.
7. S. R. Howard, A. Ramdas, J. McAuliffe and J. Sekhon. Time-uniform, nonparametric, nonasymptotic confidence sequences. *Annals of Statistics* 49(2):1055–1080, 2021.
8. S. Arnold, A. Henzi and J. F. Ziegel. Sequentially valid tests for forecast calibration. *Annals of Applied Statistics* 17(3):1909–1935, 2023. doi:10.1214/22-AOAS1697.
9. Y. J. Choe and A. Ramdas. Comparing sequential forecasters. *Operations Research* 72(4):1368–1387, 2024. doi:10.1287/opre.2021.0792.
