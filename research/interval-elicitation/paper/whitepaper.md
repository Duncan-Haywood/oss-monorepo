# Paying for a drift tolerance interval: equal-tailed scores versus a bounded shortest-interval loss

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A verifier who reports a tolerance interval `[l,u]` for benign numerical drift can be paid with the Winkler interval score `S=(u−l)+(2/α)[(l−y)₊+(y−u)₊]`, the sum of two pinball losses. It elicits the equal-tailed `(α/2,1−α/2)` interval, and its regret is exactly `(2/α)[PR(l,α/2)+PR(u,1−α/2)]` with `PR(r,t)=∫_{q_t}^{r}(F−t)`, finite even for Cauchy drift where the expected score does not exist. Its payment is unbounded, which a stake-limited market cannot use. The width-plus-miss loss `H=(u−l)+λ·1[y∉[l,u]]` is bounded by `width+λ` and elicits the level set `f(l)=f(u)=1/λ`, the shortest interval for its coverage; on lognormal(0,1) drift it is 22–31% shorter than the equal-tailed interval at 80–99% coverage. The price is statistical: to detect a 20% understatement of a normal tolerance, `H` needs 3–48× more tasks than `S` for α from 0.1 to 0.5 (and 1.2× at α=0.01).

## 1. Setup
Drift `y` has law `F` with density `f`. A report `(l,u)` is paid a loss (lower is better) and risk-neutral verifiers minimise its expectation. Two designs are compared. This is the property-elicitation view (Frongillo and coauthors): quantile pairs are elicitable through pinball losses, and a shortest-interval property comes from a fixed-price coverage trade-off.

## 2. Interval score
Since `(l−y)₊−τl=ρ_τ(y−l)−τy` with `ρ_τ` the pinball loss, `S` equals `(2/α)[ρ_{α/2}(y−l)+ρ_{1−α/2}(y−u)]` up to a report-independent term, so it is proper for the two quantiles and strictly so where `F` is strictly increasing. Regret is `(2/α)[PR(l,α/2)+PR(u,1−α/2)]`, computed by quadrature and checked against the Gaussian closed form (`8` digits), a Monte-Carlo estimate on lognormal drift, and the scale-misreport formula below. For `N(0,1)` and a symmetric report `[−λz,λz]`, `z=z_{1−α/2}`,
`regret = g(λz)−g(z)`, `g(c)=2c+(4/α)[φ(c)−c(1−Φ(c))]`
(E1: α=0.05 costs 0.102 at λ=0.9, 0.079 at 1.1, 4.2 at 0.5, 3.2 at 2; understating costs more than overstating by the same factor). Widening both ends by δ costs `(2/α)f(z)δ²` (E5: 1.516 vs 1.521 predicted at α=0.32, 2.323 vs 2.338 at 0.05). For Cauchy drift the expected score is infinite but regrets are finite (E2: α=0.1, halving the interval costs 2.36, doubling 3.84), so the score can pay verifiers where the mean does not exist. The payment is linear in the miss distance, so no finite stake covers it.

## 3. A bounded loss and the shortest interval
`E[H]=(u−l)+λ(1−F(u)+F(l))` has first-order conditions `f(l)=f(u)=1/λ`: the interval is the density level set (HPD) and `λ` is the price of a miss in units of width. Payment lies in `[0,(u−l)+λ]` for every `y`. For symmetric drift this is the equal-tailed interval when `λ=1/f(z)` (tested). For skewed drift they differ (E3, lognormal(0,1)):

| coverage | equal-tailed width | shortest width | shorter | `H`-regret of equal-tailed | `S`-regret of shortest |
|---|---|---|---|---|---|
| 80% | 3.33 | 2.28 | 31% | 1.04 | 0.65 |
| 90% | 4.99 | 3.58 | 28% | 1.41 | 0.76 |
| 95% | 6.96 | 5.16 | 26% | 1.80 | 0.89 |
| 99% | 13.07 | 10.23 | 22% | 2.84 | 1.29 |

The tolerance is therefore a policy choice: the equal-tailed interval bounds each tail, the shortest one is the tightest acceptance region for a given coverage and moves the lower endpoint toward the mode (0.026 vs 0.141 at 95%). The required `λ` is large for high coverage (50 at 95%, 385 at 99%), so the payment bound `width+λ` is the price of that coverage; it is still finite where `S` is not. Near the optimum widening both ends by δ costs `zδ²` (E5: 1.951 vs 1.960 at α=0.05).

## 4. What boundedness costs in samples
For a 20% understatement of `N(0,1)` with `λ=1/f(z)` matched to α (E4, exact masses for `H`, quadrature for `S`; tasks to detect at z=1.645):

| α | 0.5 | 0.32 | 0.2 | 0.1 | 0.05 | 0.01 |
|---|---|---|---|---|---|---|
| `S` | 324 | 220 | 184 | 175 | 192 | 320 |
| `H` | 15730 | 2849 | 1091 | 525 | 381 | 370 |

`S` is best around α=0.1; `H`'s discrete payoff wastes information near the centre and matches `S` only when the interval covers 99%. A design that needs a bounded stake at 90–95% coverage should expect a 2–3× larger sample; wide intervals with low λ are much worse.

## 5. Limits
Risk-neutral verifiers, unimodal drift for the level-set result (multimodal drift gives a single interval only for the loss's best pair, not the union of modes; see `mode-elicitation`), one report per task, `λ` and α public. The lognormal figures are for one shape (σ=1). No estimation-error rate for the reported intervals is proved. Related in this repo: `tail-risk-elicitation`, `mode-elicitation`, `property-elicitation-verification`, `variance-elicitation`, `crps-drift-scoring`.
