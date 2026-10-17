# Eliciting rankings from verifiers: linear rank scores versus Brier-derived rankings

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Routers and referees in decentralised ML often need only the *order* of K fault classes or experts by probability, not the probabilities. The ranking is elicitable with a loss that is linear in the outcome indicator: with weights `1=w_0>…>w_{K−1}=0`, pay `1−w_{σ(y)}` for a report σ. It is strictly proper, its regret for swapping two classes at adjacent true ranks is exactly `(p_i−p_j)(w_r−w_{r+1})`, and the worst report is the reversed ranking. Regret is linear in the probability gap, whereas ranking by Brier-scored probabilities has regret `2(p_i−p_j)²`. Per unit of payment range the linear score gives more incentive whenever the gap is below `1/(K−1)`. Equal spacing maximises the smallest swap incentive at `1/(K−1)`. Detection sample size for a swap is identical under both. Standard rearrangement-inequality and polyhedral-score facts applied to this setting; not new theory.

## 1. Setup
Truth `p` on K classes; a report is a ranking σ (`σ(y)=0` is top). Loss `1−w_{σ(y)}∈[0,1]` gives expected loss `1−Σ_y p_y w_{σ(y)}`. By the rearrangement inequality this is minimised exactly by sorting classes by `p`, and uniquely when `w` is strictly decreasing and `p` has no ties (tested by brute force over all K! rankings, K=3–5, 90 random truths, two weight vectors). Ties in `p` make several rankings optimal, as they should.

## 2. Regret is linear in the gap
Swapping classes `i,j` that hold adjacent true ranks `r,r+1` costs exactly `(p_i−p_j)(w_r−w_{r+1})` (tested to 1e-12). A verifier who misorders near-tied classes loses almost nothing: this is the price of eliciting a finite-valued property with a polyhedral (piecewise-linear) score, the same linear-versus-quadratic split as in `reject-surrogates`. If instead the verifier reports probabilities under Brier and we rank them, swapping two probabilities has regret `2(p_i−p_j)²`. With equal weights (spacing `1/(K−1)`, range 1) and Brier normalised to range 1, linear beats Brier iff `Δ<1/(K−1)`. E1 (K=5): 0.83× at Δ=0.3, 2.5× at 0.1, 25× at 0.01, 250× at 0.001.

## 3. Weights: equal spacing is optimal, top-k is free
Spacings sum to 1, so the smallest is at most `1/(K−1)`, attained only by equal spacing (E2: geometric weights q=0.8 give 0.122 against 0.2 at K=6). Ranking all K classes therefore costs `K−1` times the per-range incentive of eliciting the mode with `1[y≠report]`. Top-heavy weights give the top boundary a bigger share (0.52 for q=0.5) at the price of almost no incentive at the bottom (0.03). Eliciting only the top-k *set* (indicator weights) has one nonzero spacing, at the boundary, equal to 1: same incentive as the mode, and any order inside and outside the set has zero regret (tested).

## 4. Worst case and detection
The worst report is the reversed ranking, with regret `Σ_r p_(r)(w_r−w_{K−1−r})`, matching brute force over all rankings to 2e-16 (E3); for `p=(.4,.3,.15,.1,.05)` it is 0.45 of the range. Detecting one adjacent swap from paired per-task loss differences: the difference is `+Δw` on class i, `−Δw` on class j, 0 otherwise, so the mean is `(p_i−p_j)Δw` and the variance `(p_i+p_j)Δw²−mean²` (matches enumeration). The z-test sample size `z²·var/mean²` does not depend on `Δw`, and equals the Brier-scored swap's (E4: 106 vs 105.5 at p=(.25,.15), z=1.645; simulated power 0.50 at that n). Detection is unchanged; what the linear score changes is expected payment per task at stake, and hence how much effort cost it can overcome (0.0125–0.05 against Brier's 0.01 per range at K=9…3).

## 5. Limits
Risk-neutral verifiers, known truth distribution, one report per task, and swaps analysed one adjacent pair at a time; the comparison with Brier is per unit of payment range, and Brier also elicits magnitudes that a ranking report does not. Related in this repo: `categorical-scores`, `reject-surrogates`, `effort-elicitation`, `property-elicitation-verification`.
