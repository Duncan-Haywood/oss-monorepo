# How precise should a training-contest leaderboard be? Effort law, a precision ceiling, and the optimal holdout size

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A decentralised network pays a prize `V` to the best of `n` submitted models, ranked on a holdout of `m` samples. Contestant `i` picks effort `e_i` (true quality `e_i`, cost `e_i²/2`) and is scored `e_i + σε_i`, `ε_i ~ N(0,1)`, `σ = s/√m`. We solve the symmetric equilibrium. (i) The first-order effort is `e* = V a_n/σ` with `a_n = (n−1)∫φ²Φ^{n−2}`; `a_2 = 1/(2√π)` and, by symmetry, `a_3 = a_2` exactly. Effort rises as `√m`. (ii) This is *not* an equilibrium once the leaderboard is too precise: everything depends on `λ = V/σ²`, and a pure symmetric equilibrium exists only for `λ ≤ λ_max(n)` (12.35, 7.78, 6.11, 5.60, 5.80 for `n = 2, 3, 5, 10, 20`), always below the zero-rent limit `2/(n a_n²)`; the ratio falls from 0.98 (`n=2`) to 0.51 (`n=20`), so with many contestants the ceiling is set by profitable *upward* deviation, not by rent. (iii) An organiser paying `κ` per holdout sample and valuing quality at `w` uses `m* = min(m_cap, (w V a_n/(2sκ))²)`, `m_cap = λ_max s²/V`: cheap evaluation is capped by the precision ceiling, not by cost. All quantities are computed by quadrature and checked against Monte Carlo and brute-force best-reply search. Stylised: Gaussian independent noise, quadratic cost, one shot; above the ceiling we do not characterise the mixed equilibrium.

## 1. Model
`n` contestants simultaneously choose `e_i ≥ 0`. Scores `S_i = e_i + σε_i`, independent standard normal `ε_i`; the highest score wins `V`. Payoff `V·1{win} − e_i²/2`. If rivals play `e'` and `i` plays `e`, `P(win) = W((e−e')/σ) = ∫φ(z)Φ(z+d)^{n−1}dz`, `d=(e−e')/σ`; `W(0)=1/n`, `W'(0)=a_n=(n−1)∫φ²Φ^{n−2}`. The FOC at a symmetric profile is `V a_n/σ = e`, i.e. `e* = V a_n/σ`, and in units of `σ` the problem depends only on `λ = V/σ²`.

**Two exact facts.** `a_2 = ∫φ² = 1/(2√π) = 0.28209`. `a_3 = 2∫φ²Φ = ∫φ²(2Φ−1) + ∫φ² = a_2` because `φ²` is even and `2Φ−1` is odd: a third contestant does not change the marginal return to effort, which then *falls* (`a_4=0.2573`, `a_5=0.2326`, `a_10=0.1539`, `a_20=0.0934`). Both checked to 9 digits (E1).

## 2. Precision raises effort, up to a ceiling
`e* = V a_n √m/s`: with `n` and `V` fixed, quadrupling the holdout doubles effort. This is the Lazear–Rosen tournament logic applied to a noisy validation set. It holds only while `e*` is a global best reply. We test it by brute-force search over deviations (grid of 400–1500 points, plus bisection on `λ`) and find a sharp `λ_max(n)` (E2):

| n | 2 | 3 | 5 | 10 | 20 |
|---|---|---|---|---|---|
| `λ_max` | 12.35 | 7.78 | 6.11 | 5.60 | 5.80 |
| zero-rent limit `2/(n a_n²)` | 12.57 | 8.38 | 7.39 | 8.45 | 11.47 |
| ratio | 0.98 | 0.93 | 0.83 | 0.66 | 0.51 |

For `n=2` the ceiling is essentially the participation constraint (best reply above it is to shirk to near 0); for `n=10` at `λ=5.72` (2% above the ceiling) the profitable deviation is to *raise* effort to 1.62 against a FOC effort of 0.88, because with many rivals at a modest score the marginal contestant can jump the field. Concretely (`n=5, V=1, s=1`, E3–E4): at `m=6` (`σ=0.41`) `e*=0.570`, rent 0.038 and it is an equilibrium; at `m=8` `e*=0.658`, rent is negative and the best reply to it is `0.085` (gain 0.027); at `m=12` the best reply is `0.007`. Past the ceiling the FOC candidate is gone; we do not compute the mixed equilibrium that replaces it.

*Implication.* "A more precise holdout is always better" fails at fixed prize: `σ²` must stay above `V/λ_max`. Effort *at* the ceiling is `a_n√(λ_max V)`, which grows only as `√V`, so buying more effort with a larger prize also needs a *noisier* board.

## 3. Choosing the holdout
Value to the organiser: `w·e* − V − κ m`, with `e* = V a_n√m/s`. It is concave in `m` and increasing while `wVa_n/(2s√m) > κ`, so `m* = min(m_cap, (wVa_n/(2sκ))²)`, `m_cap = λ_max s²/V` (E5; `n=5, s=1, V=1, w=3`): `κ=0.5`: `m*=0.49`, net −0.757 (contest not worth running); `κ=0.2`: `m*=3.04`, −0.391; `κ=0.05`: cost-optimal 48.7 but capped at `m_cap=6.11`, net +0.419; `κ=0.001`: capped, +0.718. Once evaluation is cheap the binding constraint is the ceiling, so the organiser should spend the slack on a bigger prize or more contestants rather than more holdout.

## 4. Limitations
(1) One-shot, symmetric, complete-information game; cost `e²/2`, Gaussian noise. The threshold `λ_max` depends on both. (2) Independent evaluation noise per contestant; in a real shared holdout the errors are correlated across models and partly cancel in comparisons, which would raise the effective precision. (3) Quality is effort, not a learning curve; no capability heterogeneity, entry, Sybils (see `sybil-stake`) or overfitting to the holdout (see `holdout-market`). (4) `λ_max` is a numerical threshold (grid-searched deviations, bisection to 1e-9, deviation tolerance 1e-9), not a closed form. (5) The mixed equilibrium above the ceiling is left open. (6) Stylised; not a claim about any deployed network. Contributions: the `a_3 = a_2` identity, the ceiling table, and the holdout-size rule.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (11 tests, ~20 s) and `PYTHONPATH=src python3 experiments/run.py` (deterministic apart from a seeded Monte Carlo; ~2 min).
