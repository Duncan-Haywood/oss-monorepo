# Paying risk-averse verifiers with proper scoring rules: exact tempering laws, exact debiasing, and a lottery fix

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verification and forecasting markets pay reports with proper scoring rules, which are truthful only for risk-neutral agents. We ask what a risk-averse verifier reports. For a binary event, a verifier with CARA utility `−e^{−αx}`, belief `p` and payment `a + b·s(r,y)` reports (`k = αb`): (i) under the log score, exactly odds `= (p/(1−p))^{1/(1+k)}`; (ii) under the Brier score, the unique `r` with `logit p = logit r + k(2r−1)`, which is monotone and therefore *exactly invertible* by the principal when `k` is known, with first-order distortion `−k p(1−p)(2p−1)`. Both shrink toward ½ and shrink more as `k` grows. Consequences: (iii) summing reported logits under-extremises; multiplying by `1+k` restores the Bayes-optimal log-loss exactly (5 conditionally independent verifiers, `k=2`: 0.332 → 0.214 nats) but, with heterogeneous verifiers, correcting with the *mean* `k` is worse than not correcting (0.307 vs 0.290); (iv) a log-score verifier's report reaches an accept threshold `τ` only if its true belief reaches `expit((1+k)·logit τ)` (`τ=0.9, k=0.5` → 0.964); (v) capping distortion at `δ` caps the score scale at `αb ≤ δ/(1−δ)`, which conflicts with paying enough to induce effort; (vi) a binarised rule (prize with probability equal to the Brier score) is truthful for *every* increasing utility, at a certainty-equivalent cost of 2.6%, 5.9%, 26.7% of the mean payment for `α = 0.5, 1, 3`. Stylised: binary event, CARA, single verifier; the sign of the distortion for other utilities is checked only numerically (square-root utility).

## 1. Model
Event `y ∈ {0,1}`; the verifier believes `P(y=1) = p`, reports `r`, and receives `S = a + b·s(r,y)` with `s = ln r` or `ln(1−r)` (log) or `1 − (r−y)²` (Brier). It maximises `E u(S)` with `u(x) = −e^{−αx}`. Only `k = αb` matters (`a` is a constant factor). `k = 0` is risk-neutral and truthful.

## 2. Exact laws
**Log score.** Minimise `p r^{−k} + (1−p)(1−r)^{−k}` (convex in `r`). The FOC is `p r^{−k−1} = (1−p)(1−r)^{−k−1}`, i.e. `(r/(1−r))^{k+1} = p/(1−p)`: reported odds are true odds to the power `1/(1+k)`. Example: `p = 0.9`, `k = 1` reports 0.75; `p = 0.99, k = 3` reports 0.759 (E1, numeric optimiser matches to 6 digits).

**Brier score.** Minimise `p e^{k(1−r)²} + (1−p) e^{k r²}` (convex). The FOC gives `p(1−r)e^{k(1−r)²} = (1−p) r e^{kr²}`, i.e.
`logit p = logit r + k(2r−1)`.
The right side is increasing in `r`, so the report is unique and the map `r ↦ p` is explicit: **a principal who knows `k` recovers the belief exactly**, `p = expit(logit r + k(2r−1))` (E2: debias returns 0.900000 for every tested `k`). Expanding, `r ≈ p − k p(1−p)(2p−1)`: the first-order distortion vanishes at `p = ½`, is largest in the tails in odds terms, and the expansion is poor for `k ≥ 1` in the tails (`p=0.99, k=2`: true 0.944, first-order 0.971).

*Reading.* Log tempers log-odds by the factor `1/(1+k)`, so distortion grows without bound in the tails; Brier shifts log-odds by at most `k`, so it distorts less at extreme beliefs (`p=0.99, k=2`: Brier reports 0.944, log reports 0.822).

## 3. Consequences
**Aggregation (E4).** Verifier `i` sees an independent Gaussian signal, posterior logit `L_i`, and reports `L_i/(1+k_i)` under log score. The Bayes-optimal pool is `ΣL_i`. Naive summing of reports has log-loss 0.233 (`k=0.5`) and 0.332 (`k=2`) vs Bayes 0.214; multiplying each report by `1+k_i` restores 0.2137 exactly (an identity, not an estimate). With heterogeneous `k ∈ {0,0.5,1,2,4}` the mean-`k` correction (`k̄ = 1.5`) *over-corrects* the low-`k` verifiers and scores 0.307, worse than naive 0.290. So reputation or wagering systems must learn each verifier's `k`, not a population average; this complements the extremisation results in `expert-pooling`.

**Decisions (E5).** A rule "accept if reported probability ≥ τ" is equivalent, for a log-score verifier, to "accept iff true belief ≥ `expit((1+k)logit τ)`". For `τ = 0.9`: 0.964 (`k=0.5`), 0.988 (`k=1`), 0.999 (`k=2`). Under `p ~ U(0,1)` and regret `|p−τ|` on wrong calls, expected regret is `(τ' − τ)²/2` (0.0021 at `τ=0.9, k=0.5`). Certified regret transfers (see `decision-regret-transfer`) assume truthful reports and inherit this bias.

**Scale cap (E6).** If distortion in the odds exponent must be at most `δ`, then `αb ≤ δ/(1−δ)`: 0.020 for `δ = 2%`, 0.111 for 10%. A principal who must pay `b` large to induce costly effort (see `effort-contracts`, `effort-elicitation`) therefore pays for it in distorted reports, unless it removes the risk.

## 4. Removing the risk: the binarised rule
Pay a fixed prize `Π` with probability `P = 1 − p(1−r)² − (1−p)r²` (the Brier score in `[0,1]`). Expected utility is `P u(Π) + (1−P) u(0)`, increasing in `P` for any increasing `u`, and `P` is maximised at `r = p`. So truthfulness holds for every increasing utility (E3: neutral, CARA(2), square root all report exactly 0.1/0.5/0.9). The cost is variance. A truthful `p = 0.9` verifier wins with probability 0.91; under CARA the certainty equivalent of the lottery (prize 1) is 0.8865, 0.8562, 0.6667 for `α = 0.5, 1, 3`, a risk premium of 2.6%, 5.9%, 26.7% of the mean, which the principal must add to satisfy participation. The lottery removes the reporting distortion but not the participation cost; it also gives no accuracy signal at the level of a single report.

## 5. Limitations
(1) Binary event, one report, CARA; no wealth effects, no outside option, no learning of `k`. (2) The tempering formulas are proved for CARA only. For square-root utility we verified numerically that a Brier verifier shrinks toward ½ (0.9 → below 0.9, above 0.5); we do not prove a general shrinkage theorem. (3) Aggregation assumes conditionally independent Gaussian signals and a known common prior of ½; correlated signals need the extremisation of `expert-pooling`. (4) The decision-regret model uses a uniform `p` and linear regret. (5) A verifier can also manipulate through the payoff scale it accepts, or bet across markets; none is modelled. (6) Stylised; not a claim about a deployed network. Contributions: the closed-form log-score law, the implicit but exactly invertible Brier law, the heterogeneous-`k` over-correction result, and the scale-cap and binarisation trade-off.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (12 tests, <1 s) and `PYTHONPATH=src python3 experiments/run.py` (deterministic apart from a seeded Monte Carlo).
