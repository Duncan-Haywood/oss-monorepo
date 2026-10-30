# Draft section: what compression costs in DiLoCo-style training, and how it depends on H

*Draft for the programme paper (milestone 7). AI-assisted; no affiliation implied. Every number is in `LOG.md` (milestones 6a to 6m) and in the result files named there; nothing here is new data. The arXiv ids (1805.09767, 2311.08105, 2503.09799) were machine-checked with the proposal's (`cite_check.py`, 2026-10-29); what each paper says is taken from its title and abstract-level claim, not a full re-read.*

## Question

When the deltas workers send to the outer step are compressed (rand-k sparsification, top-k, a ternary quantiser), how much final loss does that cost, and is the cost a separable function of the compressor's noise level and the number of inner steps H between syncs? H6 of the proposal asks for a rule with at most three constants, fitted on part of the grid, that beats a fitted additive scaling law.

## Setup

Simulated DiLoCo, M = 4 workers, 3,840 inner steps per worker, plain outer step, inner lr 2e-3, tinyshakespeare at character level. Size 1: 413k-parameter GPT (dim 128). Size 2: 914,880 parameters (dim 192), same budget, no retuning. "Excess" is final validation loss with compression minus the same-seed uncompressed run at the same H, in nats. omega = 1/p - 1 for rand-k keeping a fraction p. Cell means are over 3 seeds at size 1 and 2 to 6 at size 2; a seed spread inside a cell is about 0.01.

## Results

1. **The cost is not additive in H** (6a). Rand-k at p = 1/16: +0.040 at H = 4, +0.083 at H = 16, +0.099 at H = 64. The additive rule (excess independent of H) missed the H = 4 corner by 0.042, past its pre-set 0.03 line. At p = 1/4 the cost is inside the seed spread at every H.
2. **A product rule, excess = f(p) g(H), predicted held-out H.** Fitted on H in {4, 16, 64}, it predicted H = 8 and 32 within 0.007 nats (6b), against 0.016 for the additive rule. Both rules are inside 0.02 there, so this is consistent with separability, not a strong test of it.
3. **The variable is omega, not p** (6c, 6d). Excess is near-linear in omega (exponents 0.94 at H = 4, 1.25 at H = 64; linear fit on two omega levels predicts the other two within 0.017). Composed sparsifier-then-ternary compressors, whose realised omega was measured from the run's own deltas, fell on rand-k's line within 0.005 nats in 4 of 4 cells; a keep-fraction-only rival missed by 0.017 to 0.112.
4. **Plain top-k (biased) follows roughly the same shape in H** (6e, 6g). Top-k at keep 1/16 costs +0.033 / +0.064 / +0.090 at H = 4 / 16 / 64. The rand-k-fitted rule, with no new constant, scores 0.44% held-out MAPE on those cells against 0.70% for the five-constant baseline; one extra scale constant kappa fits within 0.02 nats on leave-one-H-out, but the miss is largest at H = 64 (-0.016), so the H-shape is partly compressor-specific.
5. **Rule against a fitted scaling law** (6f). Over 300 random splits of the 17 size-1 cells (6 fitted, 11 held out), the rule `L0 + a omega (H/16)^b` has mean held-out MAPE 0.91% against 1.72% for an additive `A + B H^beta + C omega^gamma` (ratio 0.535, 95% interval 0.39 to 0.72). **Counter-result:** fitted on the H = 16 slice alone, the rule is worse (6.75% against 2.40%), because b is not identifiable at a single H.
6. **Across size the shape does not carry over cleanly.** At size 2 the excess is about half of size 1's (one constant 0.497 on four compressed cells, residuals under 0.02; 6h). But the rule's H exponent does not survive more seeds. With six seeds per cell the keep-1/16 excess is +0.045 (H = 16), +0.043 (32), +0.044 (64), +0.051 (128): a plateau from H = 16 up, with se about 0.004 to 0.006, and +0.008 at H = 4 (two seeds) (6k, 6l). The rule's power law (b = 0.55 to 0.60) over-predicts growth, and the apparent structure in earlier size-2 fits (6h to 6j) was mostly two- and three-seed noise.
7. **The plateau's form is not identified** (6m). Leave-one-cell-out RMSE over six size-2 cells: saturating `H/(H + h0)` 0.0141, power law 0.0145, log-linear 0.0150, flat plateau 0.0158. The forms are within about 10% of each other; all over-predict the H = 4 cell by 3.8 to 4.5 se. Discriminating cells would be H = 8 and a second keep level at H = 64.

## Related work

DiLoCo (arXiv:2311.08105) is the algorithm studied; Charles et al. (arXiv:2503.09799) fit scaling laws for DiLoCo in model size, M and H, and are the baseline family in item 5 (our additive form is a five-constant reading of that style, not their fitted law, which covers other sizes). Stich (arXiv:1805.09767) gives local-SGD convergence rates; variance-factor arguments for unbiased compressors, which motivate the omega variable, are in the sparsified-SGD literature the proposal cites. None of these states a cross term between compression noise and the sync interval, which is what items 1 to 3 measure.

## Limits

One corpus (character-level Shakespeare), two widths, M = 4, a short budget on which the wider model is further from converged, no inner-lr retuning at size 2. Cell means come from 2 to 6 seeds; where a standard error is given it treats cells as independent. The rule's form was chosen after seeing 6a to 6e on the same size-1 cells, so 6f is in-sample for the form (only constants are held out). Nominal omega for top-k is a convention, not a measured error ratio. The proposal's four-size scale-up has two sizes.

## What this does not claim

It does not claim a composition law. At size 1 a three-constant rule beats a fitted additive law on held-out cells; at size 2 the H-dependence it encodes is contradicted by six-seed data. The supported statement is narrower: the compression cost scales with the compressor's noise level omega, is small at H = 4, and from H = 16 upward is flat or slowly rising in H at the larger model, with the functional form open.

## Reproduce

`experiments/gpt_composition/` (6a to 6g: `composition.py`, `scaling_compare.py`, `topk_heldout.py`), `experiments/gpt_omega/` (6d), `experiments/gpt_scale/` (6h to 6m: `scale.py`, `refit.py`, `refit_results_6m.txt`). Runs take 9 to 21 minutes each on CPU.
