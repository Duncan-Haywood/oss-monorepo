# Per-layer or total? Tolerance tests for drift across layers of a verified training step

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A refereed-verification protocol must decide how much floating-point drift to tolerate. With `L` layers there are two natural rules: one tolerance per layer, or one on the total. I model honest drift as iid `N(0,σ²)` per layer and a prover who adds shifts `δ_l ≥ 0`, and compare the sum test (`Σx_l/√L > z_α`), the exact (Šidák) max test, and their union at level `α/2` each. Results: (i) admitting each layer its own tolerance admits a total `L·c(L,α)σ` versus `z_α√L σ` for the total test, 6.6× more at `L=16` and 23× at `L=128`; (ii) the sum test's power depends only on `Σδ`, the max test's on how it is spread; (iii) the prover's best split against the max test is even (`log Φ` is concave), which the tests verify; (iv) the max test catches a one-layer cheat of 2.7σ half the time at `L=16` but lets 16σ through when spread over all layers, the sum test catches 6.6σ regardless; (v) the union test's hidden budget is at most the sum test's at `α/2` (7.8σ at `L=16`, vs 16σ for max alone) while still catching one-layer cheats at almost the max test's rate. Elementary and stylised (Gaussian, independent layers, known σ); the point is the quantitative form of the trade-off.

## 1. Setup
Honest layer drifts `x_l ~ N(0,1)` (units of σ), independent. A prover adds `δ_l ≥ 0`. Sum test rejects when `S = Σx_l/√L > z_α`; max test rejects when `M = max x_l > c(L,α) = Φ⁻¹((1−α)^{1/L})` (exact level `α`). Combined: reject if either fires at `α/2`; the union bound gives level `≤ α`.

## 2. The sum of tolerances is not the tolerance on the sum (E1)
If every layer gets tolerance `c(L,α)σ` an honest-looking prover can shift each by that much, so the admitted total is `L·c(L,α)σ`. The total test admits only `z_α√L σ`. Ratio: 1.7, 2.7, 4.3, 6.6, 10.1, 15.4, 23.1 for `L=2…128`. This is the hidden deviation budget of the other notes in this repo, but now it grows like `√L·c(L,α)/z_α`.

## 3. Power, and the prover's best split (E2)
`P_sum = 1 − Φ(z_α − Σδ/√L)`; `P_max = 1 − ∏Φ(c − δ_l)`. For fixed `Σδ`, `∏Φ(c−δ_l)` is maximised by an even split because `log Φ` is concave, so the prover's best split against the max test is even over the layers it uses; tested against uneven splits. At `L=16`, `Σδ=8σ`: spread over `k = 1, 4, 16` layers the max test fires 1.00, 0.67, 0.19 while the sum test fires 0.64 for every `k`. The two tests are complementary: max is sharp for sparse cheating, sum for dense.

## 4. Hidden budget (E3, E4)
Define the hidden budget as the largest total shift that goes through with detection probability `≤ ½`, over the prover's choice of `k`. Sum: `z_α√L` (6.6σ at `L=16`). Max: 16.1σ at `L=16`, 54.9σ at `L=64` (all layers, `≈ L·(c − small)`). Yet for a one-layer cheat the max test needs only 2.7σ against the sum test's 6.6σ (`L=16`), and 3.1σ vs 13.2σ at `L=64`. Union at `α/2`: hidden budget 7.8σ, 11.1σ, 15.7σ at `L = 16, 32, 64`, exactly the sum test's value at `α/2` (its power is at least the sum test's), and it keeps the max test's one-layer sensitivity up to the level split. The price is the halved level: `z_{0.025}` vs `z_{0.05}`, i.e. 19% larger hidden budget than the pure sum test.

## 5. Checks
Null firing rates by 60,000-trial simulation are 0.047–0.051 for sum and max and 0.043–0.048 for the union (conservative, as it should be), for `L=4,16,64`. Power formulas match 40,000-trial simulation within 0.01 (tests). The union's power in E2 is reported as the bound `max(P_sum, P_max)` and by simulation; simulation is higher (0.72 vs 0.54 at `k=4`), so the bound is loose in the middle.

## 6. Limits
Gaussian, independent, equal-variance layers with known σ; real drift is heavy-tailed, correlated through the residual stream, and layer-dependent (use standardised scores per layer, but then σ must be estimated: see `reproducible-refereed-training` and `variance-elicitation`). Only additive positive shifts and two statistics; no optimal (e.g. likelihood-ratio/scan) combination, no claim of optimality of the union. Related: Šidák/Bonferroni tests and sparse-mixture detection (Ingster–Donoho–Jin higher criticism, not implemented). In this repo: `reproducible-refereed-training`, `spot-check-slashing`, `freivalds-float`, `property-elicitation-verification`.
