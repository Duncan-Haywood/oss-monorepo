# Scoring a continuous drift report: CRPS or log score?

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verifiers in decentralised training often report a *distribution* for a continuous quantity (benign floating-point drift, a loss gap, a latency), and are paid by a proper scoring rule. The log score is the default; the continuous ranked probability score (CRPS) is the main alternative. For Gaussian reports `N(m,s²)` against a Gaussian truth `N(μ,σ²)` we give exact closed forms for both rules and compare their incentives. (i) Excess CRPS at `d=m−μ=0` is `(σ/√π)(√(2(1+r²))−r−1)`, `r=s/σ`; as `r→0` it saturates at `σ(√2−1)/√π=0.234σ`, whereas the log-score excess is `ln r+1/(2r²)−1/2` (4995 nats at `r=0.01`). (ii) A mean error costs `≈|d|−2σ/√π` (linear) versus `d²/2σ²` (quadratic). (iii) CRPS is 1-Lipschitz in the realised outcome; the log score has slope `(y−m)/s²` (75/σ in our example). (iv) A plug-in Gaussian fit from `n` samples has expected excess `5σ/(8√π n)` (CRPS) versus `1/n` (log), confirmed by Monte Carlo. (v) With a Student-`t` truth the per-round score has finite variance iff `ν>2` (CRPS) versus `ν>4` (log); at `ν=3` the log-score sample std grows 5→11 from `N=10³` to `10⁵` while CRPS stays ≈1.1. Exact identities, tests and seeded simulation; the Gaussian family is the limitation.

## 1. Setting
A verifier reports `F=N(m,s²)`; the realised quantity is `Y~N(μ,σ²)`. Score loss `S(F,y)` (smaller is better). The log loss is `ln s + ½ln 2π + (y−m)²/2s²`. The CRPS is `∫(F(t)−1{y≤t})² dt`, the integral over thresholds of the Brier score of the event `{Y≤t}` (tested against numerical integration to 1e-5), and equals `E|X−y|−½E|X−X'|` (tested on a quantile grid). For a Gaussian, with `z=(y−m)/s`,
`CRPS = s[ z(2Φ(z)−1) + 2φ(z) − 1/√π ]`.

## 2. Exact expected scores
With `τ²=s²+σ²`, `d=m−μ`: `E CRPS = τ[2φ(d/τ)+(d/τ)(2Φ(d/τ)−1)] − s/√π` (tested against quadrature to 1e-6), minimised at `(μ,σ)` with value `σ/√π`. The log-score excess is `KL(N(μ,σ)‖N(m,s)) = ln(s/σ)+(σ²+d²)/2s²−½`. Both are strictly proper (excess >0 for 300 random misreports, 0 at truth).

## 3. Scale misreports
At `d=0`: excess CRPS `= (σ/√π)(√(2(1+r²))−r−1)`. Local curvature at `r=1` is `σδ²/(4√π)` for `s=σ(1+δ)` versus `δ²` for log, and `d²/(2√πσ)` versus `d²/2σ²` for the mean (tested by finite differences). Globally (E1):

| r=s/σ | 0.01 | 0.1 | 0.5 | 0.8 | 1.25 | 2 | 4 | 10 | 100 |
|---|---|---|---|---|---|---|---|---|---|
| CRPS | 0.228 | 0.181 | 0.046 | 0.006 | 0.008 | 0.092 | 0.469 | 1.81 | 22.8 |
| log | 4995 | 47.2 | 0.81 | 0.058 | 0.043 | 0.32 | 0.92 | 1.81 | 4.1 |

Overconfidence (`r<1`) is cheap under CRPS and its cost is *bounded* by `σ(√2−1)/√π`; under the log score it is unbounded. Underconfidence is the reverse: for `r>10` CRPS penalises it more (linear in `r`, versus `ln r`). The two rules therefore attach opposite risks to the same misreport.

## 4. Mean errors
For large `|d|` at `s=σ`, excess CRPS `→|d|−2σ/√π` (E2: 14.87 at `d=16σ`; log: 128). A mis-centred verifier's expected penalty is linear in distance, so the stake needed to make a bounded-slope contract limited-liability-safe scales with the largest plausible error, not its square.

## 5. Sensitivity to outcome noise
`∂CRPS/∂y = 2Φ(z)−1∈(−1,1)`, so an outcome perturbed by `ε` (float drift in the referee's own computation, or a bribe) moves any verifier's score by at most `ε` (tested by finite differences). The log score's slope is `(y−m)/s²`: for `m=0, s=0.2σ, y=3σ` it is 75/σ, and an `ε=10⁻³` perturbation moves the score 0.075 versus 0.001 (E5). This connects to reproducible refereed training: if the referee's measurement of drift is itself noisy, CRPS bounds how much noise transfers into pay, but the log score of an overconfident verifier amplifies it.

## 6. Learning to report from data
A verifier that fits a Gaussian to `n` benign samples (MLE) has expected excess `≈(σ/√π)(1/(2n)+1/(8n))=5σ/(8√π n)=0.353σ/n`, from mean error `σ²/n` and scale variance `σ²/(2n)` (`g′(1)=0`, so scale bias enters only at higher order). E3 (4000 seeds): `n·excess = 0.405, 0.368, 0.358, 0.354, 0.362, 0.344` at `n=5…200` (theory 0.353) for CRPS; for log it tends to 1 from above (3.98 at `n=5`, 1.01 at 200). The absolute unit differs: CRPS is measured in units of the quantity, the log score in nats, so the CRPS payout scales with `σ`. That is a design choice: it prices errors in the currency of tolerance thresholds.

## 7. Heavy tails
Score variance is finite iff `E S²<∞`. The log loss grows like `y²/2s²`, needing `E Y⁴<∞` (`ν>4` for Student-`t`), while CRPS grows like `|y|`, needing `E Y²<∞` (`ν>2`). E4 (Gaussian `N(0,1)` report; sample std of the per-round loss, median of 7 seeds, `N=10³/10⁴/10⁵`): `ν=6`: CRPS 0.63/0.63/0.63, log 1.50/1.65/1.67; `ν=3`: CRPS 1.09/1.15/1.16, log 5.30/8.82/11.0; `ν=2.5`: CRPS 1.36/1.55/1.63, log 12.8/19.3/31.1 (CRPS is finite but slow there). A sequential test on scores (see `sequential-slashing`) assumes finite variance; for tails between 2 and 4 only CRPS supports it.

## 8. Implications for verifiable ML
For drift quantities with plausible heavy tails, CRPS gives a payout that is bounded per unit deviation, robust to referee noise and with variance tests that remain valid down to tail index 2, at the price of tolerating overconfidence more (capped penalty `0.234σ`) and punishing extreme underconfidence harder. A mechanism designer who fears overconfident verifiers (who under-cover tails) should add a coverage or quantile-score component (see `tail-risk-elicitation`) rather than rely on either rule alone.

## 9. Limitations
Gaussian reports and (mostly) Gaussian truth; the heavy-tail check is a simulation with a Gaussian report, not an analysis of `t`-family reports. Only one verifier and one quantity; no effort cost (see `effort-elicitation`), no strategic interaction, no multivariate CRPS. Contributions: the closed forms for both rules, the bounded-overconfidence ceiling, the linear-vs-quadratic mean law, the Lipschitz sensitivity comparison, the plug-in constant `5/(8√π)`, and the `ν>2` vs `ν>4` variance thresholds.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (9 tests) and `PYTHONPATH=src python3 experiments/run.py` (deterministic; about a minute).
