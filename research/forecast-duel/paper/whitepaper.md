# Forecast duels: anytime-valid comparison of two verifiers

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A verification network often has to decide, while data keeps arriving, whether verifier A's reports beat verifier B's. Peeking at a fixed-sample test breaks its error guarantee. We treat the Brier score difference `D∈[-1,1]` as a bounded gamble: `K_t=∏(1+λD_s)` is a supermartingale under `H0: E D ≤ 0`, so rejecting when `K_t ≥ 1/α` is valid at all stopping times (Ville). For fixed reports and binary outcomes `Y~Bern(q)`, `D` takes two values and everything is closed form: the break-even frequency is the midpoint `π=(rA+rB)/2`, the optimal bet is `λ*=−μ/(d₀d₁)`, and its growth rate is exactly `KL(q‖π)`, so the expected decision time is `≈ ln(1/α)/KL(q‖π)`. A peeking z-test falsely favours A in 19%, 30% and 38% of null runs (T=50, 200, 1000) at nominal 5%; a uniform mixture over bets stayed at or below 3.8% and costs 15–41% more decisions than the oracle bet.

## 1. Setup
Reports `rA,rB` are fixed, `Y~Bern(q)`. With Brier loss, `D=(rB−Y)²−(rA−Y)²` equals `d₁=(1−rB)²−(1−rA)²` when `Y=1` and `d₀=rB²−rA²` when `Y=0`. Then `E D=q d₁+(1−q)d₀`, which is zero exactly at `q=π=(rA+rB)/2`. A is better iff `q` is on A's side of the midpoint of the two reports, a fact that makes the test about *which report is closer to the outcome frequency*.

## 2. The bet and its growth rate
`K_t=∏(1+λD_s)` with `λ∈[0,1/|d_min|)` is a nonnegative supermartingale under `H0`, so `P(sup_t K_t ≥ 1/α) ≤ α`. For a two-point `D` the growth `q ln(1+λd₁)+(1−q)ln(1+λd₀)` is maximised at `λ*=−μ/(d₀d₁)` and equals `KL(q‖π)` (verified to 1e-12 in the tests; E1). For small gaps it is `(q−π)²/(2π(1−π))` (E1: 0.02020 vs 0.02063 at `q=0.65`). Hence the expected stopping time of the oracle bet is `ln(1/α)/KL(q‖π)`; the tests confirm this within 3 tasks for `rA=.8,rB=.2,q=.75`. Cost is set by *how far the outcome frequency sits from the midpoint*, not by the payment scale: `(rA,rB)=(.9,.1)` at `q=0.6` grows at 0.0201 per task, four times the `(.7,.4)` pair at the same `q` (0.0051).

## 3. Peeking versus e-values
E2 (`rA=.7,rB=.4,q=π=.55`, 2000 runs, α=0.05): the e-process falsely rejects 0.4%, 2.1%, 3.8% at horizons 50, 200, 1000; the z-test checked at every step from t=20 rejects 19.4%, 29.6%, 38.2%. The z-test's error keeps growing with the horizon, as the law of the iterated logarithm predicts; the e-process's cannot exceed α.

## 4. The price of not knowing q
The oracle bet needs `q`. E3 uses a uniform mixture over 39 bets `λ∈{1/40,…,39/40}`, itself a valid e-process. Its mean stopping time is 1.15× the prediction at (.7,.4,q=.65), 1.20× at q=.6, 1.26× at (.8,.2,.6) and 1.41× at (.55,.45,.56); the last is inflated partly because the optimal bet there (λ*=1.2) lies above the grid's ceiling of 0.975. Power was 1.00 in all four at horizon 12× the prediction. E4 shows why a single guessed bet is risky: at (.7,.4,.65), half of λ* keeps 74% of the growth, 1.5×λ* keeps 72%, and 2×λ* has negative growth (−20%; the e-process drifts away from rejection).

## 5. Limits
Reports are fixed and outcomes i.i.d.; real verifiers update, so the null would be stated conditionally on each round's reports, where the same product remains a supermartingale but the growth analysis becomes a running average. Brier only; other proper scores need a bounded difference (log score needs clipping). One-sided test for A>B; two-sided use needs a two-sided mixture with a factor-2 union bound. Related: `sequential-slashing` (testing one verifier against a claim), `score-recalibration`, `noisy-referee`, `inference-substitution`.
