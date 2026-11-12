# cell-fidelity theory

Milestone 3 of the programme ([`PROPOSAL.md`](PROPOSAL.md)). Part 1 (2026-11-11): which part of a cheap
model's error costs DFN calls in screen-then-verify, with a bound checked on the cached benchmark
(`experiments/theory/`). Part 2a (2026-11-12, below "Limits" of part 1): an exact average-case formula for the
same cost, and a planner built on it. Part 2b (the trust test derived from the SPMe expansion, and why the SPMe
correction under-scores salt-depleted designs) is still to come; the data for it are in H13 below. Written with AI
assistance (Claude Code).

## Setting

A pool P of N candidate designs, a target score f (here DFN at cycle 100, Wh/kg) and a screen score s (any
cheaper (model, cycles) cell). Screen-then-verify (STV) computes s on the whole pool, then runs the target in
descending s order. Let x\* = argmax f, f\* = f(x\*), tolerance tau (1% here), and R the number of target
calls until a design with f >= (1 - tau) f\* has been run. Costs: c_s per screen evaluation, c_h per target
evaluation, so the time to a 1% design is exactly T1 = N c_s + R c_h.

## Theorem (affine-residual bound)

For any u >= 0 and any c, let kappa = max over x in S of |u s(x) - c - f(x)|, where S is any set
containing x\* and every x with s(x) >= s(x\*) (for example the whole pool). Then

1. every design that STV runs before x\* has f(x) >= f\* - 2 kappa, so the first design run has regret at most 2 kappa;
2. R <= 1 + #{x in P : f\* - 2 kappa <= f(x) < (1 - tau) f\*};
3. if 2 kappa <= tau f\*, then R = 1.

**Proof.** If x is run before x\*, then s(x) >= s(x\*), and both are in S. Since u >= 0,
f(x) + kappa >= u s(x) - c >= u s(x\*) - c >= f\* - kappa, which is (1). Every design run before the first
design within tolerance is run no later than x\* (x\* itself is within tolerance), so by (1) it lies in
[f\* - 2 kappa, (1 - tau) f\*); counting them gives (2), and (3) is (2) with an empty band. QED.

The best kappa for a given S is the affine Chebyshev fit of f by s, a three-variable linear programme
(`experiments/theory/run.py`, `chebyshev`). The point of the bound is what it leaves out: any error of the
form "f scaled and shifted" (u, c) costs nothing, because STV only uses the screen's order. A screen that is
off by 40 Wh/kg everywhere, or that reports 2-cycle instead of 100-cycle energy, can still be perfect. What
costs target calls is the **design-dependent residual** that no affine map removes.

**Corollary (whole-pool screening cost).** With p(w) the fraction of the pool in the band of (2),
T1 <= c_h + N (c_s + p(2 kappa) c_h). A screen therefore has an effective cost per candidate of
c_s + p c_h, and loses to a sequential search that needs m target calls once
N > (m - 1) c_h / (c_s + p c_h).

The bound is worst-case: a residual of size kappa on a single design moves the whole band. That is why it
is valid everywhere and loose for planning (H14 below).

## Checked on the cached benchmark (results in `experiments/theory/results.txt`)

Hypotheses were logged before the run (`LOG.md`, milestone 3 plan). 11 screen cells (SPM, SPMe, DFN at 2, 10,
30, 100 cycles, minus the target), 128 Sobol designs, milestone 4's 30 pools of 64.

- **C1, the bound holds:** no violation of (1) or (2) on any of 330 (cell, pool) pairs, with kappa fitted on
  each pool. The unit tests also check it on 200 random instances.
- **H11, supported:** the top-25% residual kappa_q ranks the 11 cells by their median target calls at
  Spearman 0.72; the raw error median |s - f| at -0.07. (Raw error across cycle counts is mostly capacity
  fade, which the affine map absorbs: the point of the theorem.) Over the whole pool kappa_all gives 0.53,
  because single outliers dominate it.
- **H12, supported:** on the 121 designs SPMe completes, SPM@100's kappa_all is 11.0 Wh/kg against SPMe@100's
  42.8 (ratio 0.26). The two models' raw errors are similar (median |s - f| over the 128 designs 7.1 and 9.5 Wh/kg), so SPM's ranking
  advantage is in the residual, as the theorem says it should be.
- **H13, supported:** SPMe@100's least-squares affine residual (DFN minus the affine prediction) has Spearman
  -0.82 with SPMe's minimum salt concentration r_min: the lower the salt falls in the cheap solution, the
  more SPMe under-scores. SPM's residual has +0.26. Residual RMS: SPMe 17.7, SPM 4.4 Wh/kg. SPMe's
  design-dependent error is salt depletion, which SPM, having no electrolyte, cannot make; part 2 should
  derive this from the SPMe expansion.
- **H14, refuted:** the corollary with p from kappa_q calls screen against GP-EI right on 8 of 16 (screen,
  pool size) pairs (bar 13). It calls every SPM screen a loser (p = 0.53, N\* about 14) though SPM screens
  win up to 64 designs, because one residual of 18 Wh/kg spans half the top of the distribution. It is right
  on DFN@10 at all four pool sizes. The worst-case bound is not a planning tool; an average-case version
  (residual as noise, R from the density of f near the top) is the next step.
- Also: on SPMe@100 the DFN-best design is outside the screen's top 25% (rank 41), so kappa_q is not a valid
  bound there and only kappa_all applies.

## Limits

One parameter set (`OKane2022`), one benchmark of 128 designs, pools drawn from it (seeds share designs).
The theorem itself is general and elementary; its value here is the decomposition it licenses (affine
error is free, residual error is not) and the measured residuals, not the proof.

## Part 2a: an average-case formula (2026-11-12)

Plan and H15 to H17 logged before the run (`LOG.md`); results in `experiments/average/results.txt`.

**Proposition (independent residual).** Write the affine-mapped screen as s'(x) = f(x) + e(x), with the e(x)
independent across designs, and let T = {x : f(x) >= (1 - tau) f\*}. STV's first verified design within tolerance is
the highest-s' member of T, and every design run before it is outside T and has a larger s' than every member of T.
So R = 1 + #{x not in T : s'(x) > max over y in T of s'(y)}, and by linearity of expectation

E[R] = 1 + sum over x not in T of P(s'(x) > max over y in T of s'(y)).

For Gaussian e with standard deviation sigma each term is the one-dimensional integral of
phi((t - f(x))/sigma)/sigma times the product over y in T of Phi((t - f(y))/sigma) dt, so E[R] is exact up to
quadrature (`experiments/average/run.py`, `expected_calls_gauss`; checked against a closed form for two designs,
Monte Carlo, and the random-order limit (N + 1)/(|T| + 1) in `tests/test_average.py`). Unlike part 1's bound, a
single large residual contributes one term, not a band. The quantity that matters is sigma against the spacing of f
near the top: designs more than a few sigma below (1 - tau) f\* contribute nothing.

**What the data say.**

- **H15, refuted as registered:** with sigma = the RMS residual over the whole design space, E[R] ranks the 11
  screens by their observed mean calls at Spearman 0.51 and is within a factor of 2 on 7 of 11. The miss is SPMe:
  its whole-space sigma (about 20 Wh/kg) comes from solver failures and badly under-scored designs in the middle and
  bottom of the space, so the formula predicts about 10 calls for every SPMe cell, while SPMe@10 needs 1.0 and
  SPMe@100 14.0.
- **The local residual ranks the screens (an extra, no verdict):** with sigma fitted on part 1's top set (the top
  25% by screen and by target), Spearman is 0.86, the same lesson as H11 (kappa_q beat kappa_all). It is still only
  within a factor of 2 on 7 of 11: it under-predicts SPMe@30 and SPMe@100 by 3.6 and 4.4 times, because there the
  large residuals sit on the DFN-best designs themselves.
- **H17, refuted:** resampling each cell's own residuals independently of the design (model B) predicts 10.4 calls
  for SPMe@100 against 14.0 observed (ratio 0.74), not the factor of 2 under-prediction registered. The independent
  model with SPMe's *whole-space* residual distribution lands near the observed cost; the per-cell table shows why
  that is partly luck: the same model predicts 10 for SPMe@10, which needs 1.
- **H16, supported:** for planning, R simulated under the Gaussian model on pools of N drawn from the 128, plus the
  screening cost N c_s, calls screen against GP-EI right on 14 of 16 (screen, pool size) pairs (part 1's worst-case
  corollary: 8 of 16), median relative error in T1 0.24. Both misses are at 96 designs (SPM@2, DFN@2 predicted to
  win, observed to lose by 20 and 32 s), and the planner is optimistic for SPM@2 throughout (70 against 168 s at
  N = 64), whose residual is design-linked (Spearman(e, f) +0.50).

**Reading.** For a screen whose residual is roughly independent of the design (the DFN cells, SPM at 100 cycles),
a two-number summary (sigma near the top, and how crowded the top 1% of the space is) predicts the DFN budget of
screen-then-verify. For a screen whose residual concentrates on particular designs, here SPMe on salt-depleted
designs, no independent-noise model is reliable, in either direction: whether the large residuals fall on the best
designs (SPMe@100) or below them (SPMe@10) decides the cost. That is the case for deriving the residual's location
from the physics (part 2b) rather than its size from data. Caveat on Spearman(e, f): for a weak screen e is close
to f minus its mean, so the +0.96 for SPMe is partly mechanical and is reported, not interpreted.

**Limits (part 2a).** Every prediction uses the same 128 designs the observations come from (not blind; a planner in
practice would estimate sigma and the top density from a pilot sample). One parameter set; pools overlap.

## Part 2b: where SPMe errs, from its own salt depletion (2026-11-12)

Plan and H21 to H24 were logged before the run (`LOG.md`). Results are in `experiments/location/results.txt`.

**Argument (a scaling argument, not a theorem).** In PyBaMM 26.10's SPMe (`electrolyte_conductivity.Composite`) the
electrolyte concentration overpotential is eta_c = chi RT/F (mean over the positive electrode of ln c_e minus the
mean over the negative), with ln clipped at a small tolerance. The model has one reaction rate per electrode. Write
r for the cheap solution's minimum of c_e / c_e0. As r goes to 0 the positive-electrode mean of ln c_e is dominated
by the depleted region near the current collector and grows like ln r. Because the reaction cannot move away from
that region, the loss lands on the whole electrode, and the 2.5 V cut-off arrives earlier. The DFN has the same
logarithm, but its local Butler-Volmer rate falls where the salt is gone, so the current moves towards the
separator and the cell voltage does not follow ln of the minimum. So SPMe's extra energy loss over DFN should scale
like g_log(r) = -ln r, not like (1 - r)^2, the order of the expansion's correction. If r is far from 0, both
models agree to that order. The argument predicts a functional form for the screen's residual
e = f - (a s + b), and so a *location*: which designs the residual hits.

**Consequence for the cost of a screen.** Part 2a's proposition carries over to designs with different means: if
the screen orders designs by m(x) + e(x), with e independent N(0, sigma0^2) and m(x) = f(x) - beta g(x), then
E[R] = 1 + sum over x not in T of P(m(x) + e(x) > max over y in T of m(y) + e(y)). Each term is the same
one-dimensional integral with means m (`expected_calls_loc`, unit-checked against part 2a's formula when m = f, a
noiseless count and Monte Carlo in `tests/test_location.py`).

**What the data say.**

- **The form holds (H21, supported).** Over all 128 designs, 5-fold cross-validated RMSE of f ~ a + b s + beta g for
  SPMe@100 is 11.3 Wh/kg with g_log, 12.3 with (1 - r)^2, 16.8 with milestone 1's flag and 21.3 with no feature (ratio 0.53).
  The four registered forms rank the same way at 2, 10 and 30 cycles. SPMe's own most negative eta_c (the term itself, an extra) gives 13.3:
  the minimum salt ratio is the better summary. Full-sample fit: f = 37.4 + 0.553 s + 18.8 g_log.
- **The location does not plan the budget (H22, refuted).** With a, b, beta and sigma0 fitted on 16-design pilots,
  E[R] is within 2x of the observed mean calls for SPMe@30 (1.04) and SPMe@100 (0.71), but not for SPMe@2 (2.64) or
  SPMe@10 (9.07). Part 2a's location-free model on the same pilots gives 2.30, 7.44, 0.85 and 0.59. The residual left
  after the location (sigma0 about 6 to 7 Wh/kg) is still four times the 1% tolerance (about 1.6 Wh/kg). Below that
  scale, no noise model sees what makes SPMe@10 need one call.
- **The location does not repair the screen (H23, refuted).** Refitting f ~ a + b s + beta g_log on the verified
  designs after each call, after 4 calls in screen order, cuts SPMe@100's median T1 from 699.5 to 528.1 s. That is
  still slower than milestone 1's fixed rule (top 5, then every flagged design: 417.8 s, p = 0.0001). Four points
  in the top of the screen order do not pin beta. The flag spends its calls on the depleted designs directly.
- **Post hoc: one design carries the cost.** The DFN-best design (j = 12) has r = 0.074 under SPMe (0.043 under DFN).
  SPMe ranks it 1st at 10 cycles, 8th at 2, 27th at 30 and 41st at 100. Without it, SPMe@100 needs 2.07 calls on
  pools of 64 instead of 14.03. The minimum salt ratio is reached in the first discharge: its median and 10th percentile
  are the same over 2 to 100 cycles. But SPMe's score on depleted designs drifts away from DFN's as the cell cycles.
  The argument above explains *where* SPMe's error lands. It does not explain why that error grows with cycling.
  That needs SPMe's degradation path (SEI and plating driven by its x-averaged state) on depleted designs, and is
  the open question.

**Limits (part 2b).** One parameter set, the same 128 designs as every earlier part, overlapping pools. The
argument is a scaling argument, checked only by which registered form fits best. The pilots see true f on 16 designs
and the formula sees the pool's true f, as in part 2a.
