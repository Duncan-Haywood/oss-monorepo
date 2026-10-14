# Scoring verifiers against a noisy referee

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verification protocols often pay verifiers against a cheap referee (a learned judge, a proxy check) whose label flips with known rates `e0 = P(Ỹ=1|Y=0)`, `e1 = P(Ỹ=0|Y=1)`, `γ = 1−e0−e1 > 0`. We give exact results for binary claims. (i) Any proper score against `Ỹ` is optimised by the *noisy* probability `e0 + γp`, so truthful reports are systematically distorted, and the Brier incentive to correct an error shrinks by exactly `γ²`. (ii) Raw scores can **reverse verifier rankings**: a verifier with beliefs {0.05, 0.95} beats one with {0.3, 0.7} at symmetric noise `η<0.25` under Brier (`0.178` under log) and loses above, even though both are truthful. (iii) The backward-corrected surrogate `ℓ̃(r,1)=[(1−e0)ℓ(r,1)−e1ℓ(r,0)]/γ` (and symmetric for 0) has conditional expectation exactly `ℓ(r,Y)`, so it restores exact properness and unbiased rankings. (iv) Its price: payment spread grows as `1/γ` (1.0→5.0 as `η` 0→0.4) and, in the balanced symmetric case, the sample size needed to separate two verifiers grows exactly as `1/γ²` (1.56, 2.78, 6.25, 25 at `η`=0.1…0.4). (v) If the rates are assumed as `(ê0, ê1)`, the surrogate is still a proper score, for the belief `w = (e0−ê0+γp)/γ̂`, so the misreport is affine in `p` with closed form; estimating rates from `m` gold items per class costs mean true-Brier excess `≈ 0.164/m` in our instance (delta method within 6%). Exact computation and Monte Carlo; stylised.

## 1. Setup
Truth `Y∈{0,1}`, verifier belief `p = P(Y=1)`, report `r`, referee label `Ỹ` conditionally independent of the verifier given `Y`. Then `P(Ỹ=1) = q̃ = e0 + γp`.

## 2. Raw scores elicit the wrong thing
Any strictly proper `S` scored on `Ỹ` is minimised at `r = q̃`: an honest verifier is *paid as if* it believed `e0+γp`. For Brier, the expected loss is `q̃(1−q̃) + (r−q̃)²`, so the excess of a report `r` is `(r−q̃)² = γ²((r−e0)/γ − p)²`: one unit of calibration error is worth `γ²` units of pay (E1: `γ=0.6` gives 2.78× weaker incentive). Both the distortion and the shrinkage vanish only at `γ=1`.

## 3. Ranking reversals
Truthful expected raw Brier is `E[q̃(1−q̃)] + E[(p−q̃)²]`, and `p−q̃ = (1−γ)p − e0`. With symmetric noise this is `4η²E[(p−½)²]`, so it penalises *resolution*: more extreme beliefs are further from the noisy optimum. E2: A={0.05,0.95}, B={0.3,0.7} equiprobable, clean Brier 0.0475 vs 0.2100; raw Brier A/B at `η=0.2` is 0.2095/0.2420, at `η=0.3` 0.2905/0.2580 (reversed); threshold `η*=0.2500` exactly (Brier), 0.178 (log). Sorting or slashing verifiers by raw noisy loss can therefore evict the best ones.

## 4. The surrogate score
Solving the 2×2 system `E[ℓ̃(r,Ỹ)|Y=y]=ℓ(r,y)` (determinant `γ`) gives
`ℓ̃(r,1)=[(1−e0)ℓ(r,1)−e1ℓ(r,0)]/γ`, `ℓ̃(r,0)=[(1−e1)ℓ(r,0)−e0ℓ(r,1)]/γ`.
Hence for *any* loss `ℓ`, `E[ℓ̃|p] = pℓ(r,1)+(1−p)ℓ(r,0)`, so propriety, rankings, and the exact excess laws of the clean score (e.g. Brier `(r−p)²`) carry over unchanged (tested for Brier and log; E2 shows expected loss of A equal to the clean 0.0475 at `η`=0.1 and 0.3).

## 5. What it costs
*Payment spread.* The Brier surrogate ranges over an interval of length `1/γ` in the symmetric case (E3: 1.25, 1.67, 2.5, 5.0), so payments can be negative and need a limit-liability offset or larger deposits (cf. effort contracts). *Statistical power.* The mean of a paired difference is unchanged but its variance grows; for a balanced prior and symmetric noise the variance ratio is exactly `1/γ²` (`ℓ̃(·,1)−ℓ̃(·,0) = (d₁−d₀)/γ`), otherwise it is at least 1 (tested). A `η=0.3` referee needs 6.25× the evidence, `η=0.4` needs 25×.

## 6. Misestimated rates
With assumed rates the surrogate is `wℓ(r,1)+(1−w)ℓ(r,0)` in expectation with `w = (e0−ê0+γp)/γ̂` (weights sum to one because `γ̂` is the determinant), so the optimal report is `w` clipped to `[0,1]` and the bias is `((γ−γ̂)p + e0−ê0)/γ̂`. E4: true `e0=e1=0.1`; assuming `(0.15,0.1)` moves `p=0.2` to 0.147; assuming `(0,0)` recovers the raw report 0.26. Rates estimated from `m` gold-checked items per class have variance `e(1−e)/m`; averaging bias² over uniform `p` gives excess `≈ [v0·E(1−p)² + v1·Ep²]/γ²` (delta method). E5 (`e0=.1,e1=.2`): measured/predicted 1.06, 1.00, 0.97, 0.97 at `m`=25…1600. Excess scales as `1/m`, so a gold budget is an *insurance premium* against the referee's rate error.

## 7. Limitations
(1) Binary claims, rates independent of the verifier's report and of `Y`'s difficulty; instance-dependent noise makes `γ` a function of the item and the correction non-identifiable without more structure. (2) A strategic referee (or an attacker who biases the referee) is a different problem (see the bribery and bounty projects). (3) The `1/γ²` power result is exact only in the balanced symmetric case; `E5` uses one rate pair. (4) The clip at `[0,1]` for the log rule is not analysed beyond the boundary. Related ideas: surrogate/noise-corrected scoring rules (Natarajan et al. 2013 for losses; Liu–Wang–Chen for peer prediction), elicitation of properties under transformed outcomes (Frongillo, Waggoner). Contributions: distortion/`γ²` law, ranking-reversal thresholds, exact unbiased surrogate for any loss, its `1/γ` and `1/γ²` costs, and a closed form for misspecification bias with a gold-budget scaling.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (12 tests) and `PYTHONPATH=src python3 experiments/run.py` (deterministic; seconds).
