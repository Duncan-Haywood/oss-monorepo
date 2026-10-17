# How many bits does a probability report need? Proper scoring under finite precision

*Working note, MIT licensed. Stylised; numerical experiments in pure Python, no claims about any deployed protocol.*

## Motivation
Decentralised ML protocols that score participants (peer prediction, wagering, verification markets; see the sibling notes)
receive probability reports from heterogeneous devices that compute in bf16/fp8 or serialise a few bytes. A proper
scoring rule is only proper over the reals: with a finite report set G, an agent with belief q reports
argmin_{r∈G} D(q,r), and loses D(q,r) in expected score, where D is the Bregman divergence of the rule
(Brier: (q−r)²; log: KL(q‖r)). We ask how the loss scales with grid size N and how the grid should be shaped.

## Results (`src/quantized_reports/model.py`, `experiments/results.txt`)
**R1 (high-resolution law).** With local point density Nλ(q), regret ≈ (1/24N²)∫π(q)I(q)λ(q)⁻²dq, where I is the
divergence's curvature (I=2 for Brier, 1/(q(1−q)) for log). Optimising λ ∝ (πI)^{1/3} gives
**R* = (1/24N²)(∫(πI)^{1/3})³**. Measured optimal-grid regret matches this within 0.3% at N=1024 in all four
(score × prior) cases (E1, E2), e.g. log/uniform: 0.3605·N⁻² vs predicted 0.3606·N⁻².

**R2 (uniform grids lose a log factor under log score).** Brier is grid-shape-neutral under a uniform prior (exactly
1/12N²), but under log score the uniform grid's regret·N² grows by 0.1154 per 4× in N — that is ln 4/12, i.e.
regret ≈ (ln N)/(12N²) — because the curvature 1/(q(1−q)) diverges at the ends. Under a confident (arcsine) prior the
mismatch is worse: regret scales as N^{−3/2} (×2 in regret·N² per 4× N) instead of N⁻². Companding to λ ∝ (πI)^{1/3}
removes both: at N=1024 the uniform grid is 2.1× (uniform prior) and 21× (arcsine prior) worse.

**R3 (nearest ≠ best).** Under log score the optimal report is not the nearest grid point (rounding should bias
toward the less extreme side); ≈3% of beliefs on an 8-point grid (E4). Rounding to nearest is therefore a small
extra loss, and in practice a strategic reporter must optimise against the scoring rule, not the format.

**R4 (floating-point grids).** Minifloats are dense near 0 but coarse near 1, so a raw e4m3 grid is 13× worse than its
symmetrisation (report min(p,1−p) plus a side bit) under log score, 4× under Brier (E3). Even symmetrised, formats
waste range on tiny values: e5m6 symmetrised (961 points) is 16× worse than an optimal compander of the same size.
For e4m3/e5m2/e3m4 the symmetrised format is within 2.4–3× (e3m4, e4m3) or ≈16× (e5m2) of optimal.

## Implications
1. Serialise confidence as a **companded** code (roughly ∝ (q(1−q))^{−1/3} density under log score), or symmetrised
   float, not a uniform fixed-point or raw float; this recovers a ln N factor for free.
2. Regret is O(N⁻²): a few extra bits buy 4× per bit, so precision needs are modest unless the score is log and
   the population is confident. Then tail resolution matters most.
3. Reward design: mechanisms paying score differences smaller than the format's regret cannot distinguish skill
   from rounding; tolerances (cf. `property-elicitation-verification`) should include the grid regret.

## Limitations
Binary outcomes and a scalar prior only; agents know q exactly and pay no computation cost; regret is measured on
quantile points (M=4·10⁴) rather than integrated analytically; the high-resolution law is asymptotic. Multi-class
reports (softmax simplex quantisation) and the interaction with elicited quantiles are open. Related literature
directions (properness, Bregman geometry, elicitation) are the work of Frongillo, Waggoner and coauthors; this note
is an independent numerical exercise and no results are attributed to them.
