# cell-fidelity theory

Milestone 3 of the programme ([`PROPOSAL.md`](PROPOSAL.md)). Part 1 (2026-11-11): which part of a cheap
model's error costs DFN calls in screen-then-verify, with a bound checked on the cached benchmark
(`experiments/theory/`). Part 2 (the trust test derived from the SPMe expansion, and why the SPMe correction
under-scores salt-depleted designs) is still to come; the data for it are in H13 below. Written with AI
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
