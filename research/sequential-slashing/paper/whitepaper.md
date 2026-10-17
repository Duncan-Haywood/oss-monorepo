# Slashing without peeking bias: anytime-valid tests for verifier calibration

*Working note, MIT licensed. Stylised; pure-Python numerical checks, no claims about any deployed protocol.*

## Motivation
`spot-check-slashing`, `verification-game` and `decision-regret-transfer` treat slashing as a one-shot decision.
A live protocol instead sees outcomes stream in and would like to slash *as soon as* evidence is strong. Naively re-running a fixed-sample test after every outcome ("peeking") breaks the false-positive guarantee, which in a staked system means honest verifiers lose stake more often than the stated rate.
This note applies e-processes / test martingales (Ville 1939; Shafer–Vovk game-theoretic probability; Ramdas et al. 2023 survey) to verifier calibration, connecting to Frongillo–Waggoner-style proper scoring: the betting factor is a (shifted) score.

## Model (`src/sequential_slashing/model.py`)
A verifier reports fault probability p each round; y_t∈{0,1} is the audited outcome. H0: y_t~Bern(p) (calibrated). A cheater's true rate is q>p (it under-reports faults).
Slash when an e-process E_t (nonnegative, E[E_t | past] ≤ E_{t−1} under H0) reaches 1/α.
- **LR e-process**: factors q/p or (1−q)/(1−p); needs q.
- **Mixture e-process**: uniform mixture over bet sizes λ∈(0,1/p) in factors 1+λ(y−p); needs no q.
- **Peeking z-test**: one-sided z-test at level α re-run every round from t=30.

## Results (`experiments/results.txt`; p=0.2, q=0.3, α=0.05, KL=0.0282 nats)
**R1 (Ville: the guarantee survives continuous monitoring).** For any e-process, P_H0(∃t: E_t ≥ 1/α) ≤ α. Hence an honest verifier's expected slashed stake is ≤ α·S regardless of how often the protocol looks. Measured false-slash rate over 2000 rounds: LR 0.038, mixture 0.020 (both ≤0.05); the peeking z-test slashes **0.371** of honest verifiers, 7× nominal.

**R2 (detection delay ≈ ln(1/α)/KL).** Wald's bound says any level-α test has E_q[τ] ≥ ln(1/α)/KL(q‖p). The LR e-process attains it up to overshoot: mean τ = 108 vs 106 (α=0.05), 252 vs 245 (α=0.001), 409 vs 406 (q=0.25); at most 12% above across all settings tried (E2–E4; larger relative overshoot only at large effect sizes where τ<10). Delay is logarithmic in 1/α: 20× more conservative costs about 2× the rounds (59→108→169→252 as α=0.2→0.001).

**R3 (price of ignorance).** The q-free mixture slashes the same cheater after 162 rounds on average vs 119 (same-run oracle), a factor 1.36 — the usual ≈½ln n regret of learning one parameter — yet still detects 100% by T=3000.

## Implications
1. State slashing guarantees as *anytime-valid*: "honest loss ≤ αS at any monitoring schedule" is a theorem for e-processes and false for repeated z/p-value tests.
2. The protocol can price the trade-off directly: stake needed to deter is a function of α (false-slash insurance, ≤αS) and expected detection delay ln(1/α)/KL times the per-round cheating gain; the log dependence means small α is cheap.
3. Effect size dominates: delay scales as 1/KL, so subtle miscalibration (q=0.25) takes ~4× longer than q=0.3 — small biases are only deterred if the per-round gain is also small (cf. `spot-check-slashing`).

## Limits
Constant p and q, i.i.d. outcomes, one-sided test; no adaptive adversary who chooses which rounds to be honest in (a non-stationary cheater is an open extension via the mixture/adaptive bets); Wald's bound is stated with ~ equality ignoring the binary-KL correction for detection probability <1; no stake or incentive model layered on top. Seeds fixed; results are simulation means, not proofs of tightness.
