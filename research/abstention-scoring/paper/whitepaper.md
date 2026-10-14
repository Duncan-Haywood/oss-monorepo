# Silence is evidence: selective reporting under proper scoring rules

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Proper scoring rules make truthful reporting optimal *conditional on reporting*, but verifiers in a decentralised protocol usually can decline to report, and reporting costs compute or attention. We take a verifier who is paid the score gain over a public anchor `α`, pays a cost `c` to report, and has a Gaussian signal about a binary state. (i) Truthful reporting is optimal exactly when the gain exceeds `c`, so the abstention region is an interval in signal space with closed-form endpoints for the Brier score (`|p−α| < √c`) and a one-dimensional root for the log score (`KL(p‖α) < c`). (ii) Silence is informative unless the anchor equals a symmetric prior: at prior `π = 0.1` the silence likelihood ratio is 0.37, and the outcome rate among reporters is 0.574 against a prior of 0.1. (iii) An aggregator that ignores silence loses badly as verifiers are added: at `π=0.1`, `μ=0.8`, `c=0.02` its log-loss is 0.62 against 0.02 for the silence-aware one at `n=12`. (iv) A stale anchor makes silence evidence for the wrong state (`α=0.6` vs `π=0.3`: silence gives `P(θ=1)=0.60`). (v) Raising the reward scale saturates the information (0.336 nats at `π=0.5`) while payment grows linearly. Numeric checks, quadrature and seeded Monte Carlo; stylised model.

## 1. Model
`θ ~ Bern(π)`; each verifier sees `s | θ ~ N((2θ−1)μ, 1)`, so `logit p(s) = logit π + 2μs`. A verifier who reports belief `r` is paid `S(r,y) − S(α,y)` for a proper `S`; the expected gain of truthful `p` is `(p−α)²` for Brier and `KL(p‖α)` for log. Reporting costs `c`; a verifier who does not report earns 0. A verifier with belief `p` reports iff gain(`p`) ≥ `c`, and then reports `p` (properness). The set of signals that abstain is `(a,b) = {s : gain(p(s)) < c}`, an interval because gain is quasi-convex in `p` and `p` is monotone in `s`.

## 2. Closed form
For Brier, `b = (logit(α+√c) − logit π)/(2μ)` and `a = (logit(α−√c) − logit π)/(2μ)`; an endpoint is infinite if `α±√c` leaves `(0,1)`, so at a small anchor nobody can report a low belief at all (E2, `π=0.1`: `a=−∞`). For log score the endpoints solve `KL(p‖α)=c` by bisection (tested). At `π=α=0.5, μ=1`: `c = 0.01, 0.04, 0.09, 0.16` gives abstention probability 9.8%, 20.5%, 33.4%, 52.1% and keeps 99.8%, 98.3%, 93.1%, 77.5% of the mutual information `I(θ; observation)` (E1; quadrature). For equal `c` the log score abstains less than Brier and keeps more information (E5: at `c=0.09`, 0.330 vs 0.314 nats).

## 3. Silence is evidence
Abstention has likelihood ratio `A = [Φ(b−μ)−Φ(a−μ)]/[Φ(b+μ)−Φ(a+μ)]`. By symmetry `A = 1` exactly when `π = α = ½` (tested to 1e-12). Otherwise silence shifts belief: E2 (`μ=1, c=0.03`) gives `A = 0.85, 0.58, 0.37` for `π = 0.3, 0.2, 0.1`, so `P(θ=1 | silence) = 0.268, 0.126, 0.039`. The flip side is selection: `P(θ=1 | reports) = 0.31, 0.26, 0.57` for the same priors, so pooling reported outcomes as a base-rate estimate is badly biased at low `π`. Each reported belief stays calibrated, since selection is on `p` itself.

## 4. Ignoring silence
With `k` silent verifiers the correct posterior adds `k ln A` to the log-odds. E3 (`π=0.1, μ=0.8, c=0.02`, 20,000 jobs per row) compares it with dropping silent verifiers, i.e. treating them as absent:

| n | silence-aware log-loss | ignoring silence | excess | P(all silent) |
|---|---|---|---|---|
| 1 | 0.256 | 0.270 | 0.013 | 0.878 |
| 3 | 0.153 | 0.238 | 0.084 | 0.730 |
| 6 | 0.078 | 0.320 | 0.241 | 0.576 |
| 12 | 0.021 | 0.622 | 0.602 | 0.365 |

The ignoring aggregator gets *worse* as verifiers are added, because every added silent verifier is evidence it discards. The silence-aware posterior was calibrated (mean posterior within 0.01 of the base rate; tested).

## 5. Stale anchors
If the anchor `α` is a published price that lags the true prior (E4, `π=0.3`), the abstention interval moves: `α = 0.3, 0.4, 0.5, 0.6` gives silence LR `0.85, 1.44, 2.25, 3.50`, so `P(θ=1 | silence) = 0.27, 0.38, 0.49, 0.60`. Silence now says the state is where the anchor points, which lets a party who controls the anchor (or its staleness) steer an aggregator that treats silence as evidence, and is missed entirely by one that ignores it.

## 6. Reward scale
Scaling the reward by `k` at unit cost sets `c = 1/k`. E6 (`π=0.5, μ=1`): information rises 0.200→0.336 nats as `k = 5→100` (asymptote 0.3368) while total payment rises 0.38→13.7 and verifier rent 0.05→12.8. Past `k≈20` (0.328 nats, 97%) extra reward buys almost no information.

## 7. Limitations
(1) One Gaussian signal per verifier, conditionally independent, homogeneous cost `c`; correlated signals and heterogeneous costs are not analysed. (2) Verifiers know `π`, `μ`, and `α` and are risk-neutral (see `risk-averse-scoring` for what that assumption hides). (3) Abstention is treated as costless to the verifier apart from `c`; no strategic use of silence, and no collusion. (4) Information is measured as mutual information, not decision value. (5) Not a claim about any deployed protocol. Contributions: closed-form abstention regions for Brier, the identification of silence as evidence and reporters as a selected sample, the growing loss of silence-ignoring aggregators, and the stale-anchor effect.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (12 tests) and `PYTHONPATH=src python3 experiments/run.py` (deterministic; seconds).
