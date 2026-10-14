# Reproducible operators and refereed training: what float32 drift looks like, and what a tolerance hides

*Working note, MIT licensed. Emulated float32 on a tiny logistic-regression trace; no claims about GPUs or any deployed protocol.*

## Motivation
Refereed verification of decentralised training (Verde-style bisection to one operator; Gensyn's reproducible
operators, "RepOps") needs a rule for when two honest executions "agree". The sibling notes in this monorepo
(`verification-game`, `property-elicitation-verification`) assumed Gaussian drift and priced a tolerance τ. Here
we measure drift and ask what τ costs. All numbers come from `experiments/run.py`.

## Setup
Float32 is emulated exactly (each product and add rounded). Five reduction orders: `canonical` (fixed
left-to-right, the RepOps choice), `pairwise`, `lanes4`, `lanes32`, `shuffled` (random order, standing in for
atomics). Training is full-batch L2-logistic regression (n=64, d=8, lr=0.5, μ=0.1). The solver commits a Merkle
root over all states. A verifier re-executes *teacher-forced* (each step from the solver's committed previous
state) and, on `‖s_i − f(s_{i−1})‖∞ > τ`, opens two leaves; the referee re-runs one step (`O(1)` compute,
`2 log T` hashes).

## Results
**R1 (canonical order is exactly reproducible; others are not).** Canonical-vs-canonical drift is exactly 0. Any
two different orders disagree, and honest "shuffled" hardware produced a different committed trace than
canonical in **100/100** 40-step runs. *Consequence:* hash commitments cannot express a tolerance; τ>0 must
live in the referee's comparison, and bitwise agreement needs everyone on the fixed order.

**R2 (drift of a dot product has two very different tails).** Normalised by `u·Σ|xᵢyᵢ|` (u = 2⁻²⁴), drift is
light-tailed (q99.9 ≈ 7.9 at n=64, 17 at n=512 for positive inputs; the Gaussian RMS fit is accurate).
Normalised by the *result* `u·|Σxᵢyᵢ|`, which is what a relative tolerance uses, zero-mean inputs give a ratio
with a Cauchy-like tail: Hill index ≈ 0.9–1.1 (positive inputs: 4–6), q99.9 ≈ 4300 (n=64) and 1900 (n=512) vs
a Gaussian-fit 800 and 2400 (n=64: underestimates 5×; n=512 sampling noise flips the sign of the miss, so
treat the size of the gap as uncertain but the tail index as robust). *Consequence:* a relative tolerance
calibrated on Gaussian noise false-slashes honest cancelling reductions; use an absolute scale (`Σ|p|`) or
a quantile-elicited τ (see the property-elicitation note).

**R3 (at the state level drift is small, discrete, and Gaussian is conservative).** In the training trace,
one-step ∞-norm drift over states of magnitude O(1) is 0–2 ulps: median 0.2u, q99.9 2.0u, max 2.0u. The
Gaussian RMS-matched model predicts false-slash rate 0.052 at τ=1u where the empirical rate is 0.003, and
0.0001 vs 0 at τ=2u. So for this trace, τ = 2u (≈ 1.2×10⁻⁷) gives zero honest false slashes in ~4000
teacher-forced steps. Free-running (non-teacher-forced) final-state drift after 40 steps was also ≤2u, because
the map is contractive; strongly expansive dynamics would differ (not tested).

**R4 (a per-step tolerance is a cumulative budget).** A solver adding a hidden bias δ ≤ τ to one coordinate
every step passes the tolerance verifier (τ=1.05δ, different reduction order) for all δ ∈ {1e-6…1e-3}, T=400.
The final-state deviation is ≈ **7.2·δ**, versus the contraction bound `δ/(lr·μ) = 20δ` (the logistic curvature
contracts faster than the regulariser alone). So the hidden deviation scales with `τ·T_eff` where
`T_eff ≈ 1/(lr·curvature)` is the dynamics' memory, not with τ alone. τ=0 flags the same trace at step 1.

**R5 (detection thresholds).** With τ=0 and a single canonical order, every cheat ≥1u was caught (20/20 at each
size, referee-confirmed). With τ=4u on mixed hardware, cheats up to 4u were missed (0/20) and cheats ≥8u caught
(20/20). The cost of tolerance is a blind zone of width τ per step, and a false-negative rate that is a step
function here because drift is discrete.

## Implications for the protocol design notes
* `verification-game` Result 4 priced τ with Gaussian σ; R3 says for state-level drift that may overstate
  false-slash risk, while R2 says relative-error checks on raw reductions understate it. Which applies depends on
  where the comparison happens (state vs operator output) — an argument for comparing *states with absolute
  tolerance* and against relative tolerances on operator outputs.
* R4 turns the hidden-cheat term `ρτ` in that model into `ρ·τ·T_eff`: per-step tolerance must be divided by the
  dynamics' memory when harm is measured at the final model.
* RepOps buys `τ=0`: no blind zone, no accumulation, no false slashes, at the price of a fixed (slower) reduction order.

## Limitations
Emulated float32 only (no FMA, no tensor-core mixed precision, no fp16/bf16 where drift is 2¹³× larger); one tiny
convex problem; contractive dynamics; teacher-forced verifier assumes the solver's states are available;
adversary is a constant-bias attacker, not an optimal one; 1–2k samples per cell, tails beyond q99.9 unresolved;
no cost model for RepOps slowdown. Follow-ups: bf16 drift, non-contractive (chaotic) training, optimal
bounded-drift adversary, a benchmark of RepOps overhead.
