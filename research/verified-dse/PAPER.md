# When is a cheap rung safe to trust? Rung bias and a pilot-checkable bound for multi-fidelity search over open-source chip flows

**Draft for MLCAD (6 pages when typeset); not submitted.** Programme `verified-dse`, milestone 7. Written with AI assistance
(Claude Code). Every number below is copied from a committed results file named beside it; `sh reproduce.sh` regenerates
them from the cached flow tables. No affiliation with any lab is claimed. Submission is an owner step.

## Abstract
Open RTL-to-GDS flows put a place-and-route run within reach of a laptop, but a search over ABC pass sequences needs
hundreds of runs, so practitioners rank candidates on a cheap rung (generic-gate count and depth, liberty-mapped
synthesis, placement) and trust it. We measure how far that trust is justified on SKY130: 10 small designs, 60 ABC pass
sequences each, two clock targets, four rungs, 1,200 runs, with routed area x delay as reference. The generic-gate rung is
uninformative to anti-correlated with the routed ranking (median Kendall tau-b -0.04 at the tight clock); mapped and
placed rungs mis-rank at a tight clock (median pick regret 9 to 10.5%) and are almost exact at a relaxed one. Replayed at
equal wall-clock, cheap-rung screening and plain successive halving **do not beat random or hill-climbing search** on this
table (about 10% against 0.9% mean routed regret at 45 s). We give a three-line worst-case bound (regret of halving is at
most the sum of the cut rungs' *inversions*), show it is vacuous for the generic rung, and test pilot-checkable
substitutes empirically: a statistic built from the pilot's best three points against the rest covers the realised
regret in all 40 group-start cells at a 16-point pilot (minimum 0.81) but is informative only where the rung is already
faithful. A conformal shortlist on the mapped rung retains the optimum 0.99 of the time at nominal 0.90 while routing
42 to 57% of the pool; on the generic rung it is no better than random. A proof-success predictor is not supported.

## 1 Introduction and related work
Multi-fidelity search is mature for hyperparameters: GP bandits with known maximum bias (Kandasamy et al., 2016,
arXiv:1603.06288), max-value entropy search over fidelities (Takeno et al., 2019, arXiv:1901.08275), successive halving
(Jamieson & Talwalkar, 2015, arXiv:1502.07943), Hyperband and BOHB (arXiv:1603.06560, arXiv:1807.01774), with BoTorch as
software (arXiv:1910.06403). Chip-flow search papers mostly use one fidelity: ABC pass-sequence learning
(Yu, Xiao & De Micheli, 2018, arXiv:1804.05714), surveyed in Huang et al. (2021, arXiv:2102.03357). Mirhoseini et al.
(2021, doi:10.1038/s41586-021-03544-w) and its reassessment (arXiv:2302.11014) are the reason we use equal-budget
baselines. Conformal prediction (Angelopoulos & Bates, 2021, arXiv:2107.07511) supplies the distribution-free tool for
shortlists. The related-work claims rest on titles and abstracts returned by `research/_shared/cite_check.py`, not on a
full reading of every paper (`PROPOSAL.md`). The inversion bound of Section 4 may be a special case of known
successive-halving analyses; we do not claim it as new.

## 2 Setup
Designs: 10 small combinational designs plus one FIFO (`designs/`). Space: 60 ABC sequences of length 0 to 3 over
`balance`, `rewrite`, `rewrite -z`, `refactor`, `refactor -z`, `dc2`, `dch`; 10 fail in ABC and are dropped, leaving pools
of 50 or 52. Rungs: R1 generic gates (cells x depth, 0.15 s per point), R2 liberty-mapped without wires (0.8 s), R3 after
placement (1.0 s), R4 routed with `repair_timing -setup` (1.3 s), all one core. Score: area x period; clock targets are each
design's own no-wire baseline (tight) and 1.5x that (relaxed). Flow: Yosys 0.33, OpenROAD 26Q2, SKY130 HD, one corner
(tt 25C 1.8 V), 40% utilisation. "Routed" is global-route-estimated, not detail-routed.

## 3 Results
**Rung bias** (`experiments/rung_bias/results.txt`). R1 tau-b against routed: -0.04 tight, -0.01 relaxed; the 95% bootstrap
interval lies below 0 for popcount16 and crc16 at the tight clock. R2: 0.59 / 0.73; R3: 0.50 / 0.76. Median pick regret
tight / relaxed: R1 13.5% / 20.0%, R2 10.5% / 0.0%, R3 9.4% / 0.0%. Timing repair, seen only by the later rungs, reorders
designs at the tight clock.

**Search at equal budget** (`experiments/search_baselines/results.txt`, `experiments/halving/results.txt`; 400 paired
seeds, replayed on the cached table). Mean routed regret at the tight clock: random R4 6.3 / 2.1 / 0.94% and hill climbing
7.4 / 1.7 / 0.61% at 10 / 30 / 45 s; screening all points at R1 then verifying the top 15.0 / 5.3 / 1.08%. Plain halving
from R1 is the worst strategy at every budget of 10 s or more. A 6-point routed pilot choosing the starting rung recovers
the designs plain halving loses (alu8 16.9% to 0.8%), but most of that gain is "skip R1". Net: no multi-fidelity gain at
equal wall-clock yet; routed runs here cost only about 8x the cheapest rung, so there is little to save, and the pool
caps halving beyond roughly 30 s.

**Conformal shortlist** (`experiments/conformal/results.txt`; 20 design-clock groups). Fit routed value from a rung on a
10 to 16 point routed pilot, keep points whose one-sided conformal bound could still beat the pilot's best. R2: optimum
retained 0.99 at nominal 0.90 (0.90 to 0.92 at 0.80) while routing 42 to 57% of the pool, against 0.53 to 0.65 for random
search with the same routed count. R1: 0.65 at nominal 0.80, no better than random, so the hypothesis fails for R1.

**Proof success** (`experiments/proof_success/results.txt`; 752 SAT-miter proofs, 15 designs, 10 s timeout). Rewrites never
failed a proof; time is set by the design (median 0.01 s at 4-bit multiplier, 11 s at 8, none of 100 proved at 9 and 10
bits). Pooled leave-one-design-out AUC 0.96 to 0.998 equals that of an oracle knowing only each design's success rate. Within
the one varying design (8-bit multiplier, 17 of 50 proved) AUC is 0.65 to 0.78; "the rewrite is smaller than the
reference" gets 0.81. We do not claim proofs are predictable from cheap features.

## 4 A bound and what a pilot can check
Define the inversion of a rung, iota = max(0, max over pairs with s(x) <= s(x') of log y(x) - log y(x')). **Proposition.**
Successive halving with cut rungs r_1..r_m returns a value with log regret at most the sum of iota_{r_j}. Proof: if the
best survivor x of cut j-1 is cut, every survivor z has s(z) <= s(x), so log y(z) <= log y(x) + iota; chain over the cuts
(`experiments/theory/BOUND.md`; checked on 500 random instances and all 40 cells). It is vacuous for R1 (iota above 0.3 on
8 of 10 groups; bound 0.63 to 0.71) and loose for R2 (bound 0.23 to 0.35 where realised regret is about 0). A pilot's
maximum is a lower bound on iota, so a pilot can suggest but not certify it.

**Pilot-checkable statistics** (`topk_results.txt`, `sweep_results.txt`; 200 to 300 pilots x 10 to 20 tie-breaks per
cell, 20 groups, both halving starts). Max over random pilot pairs undercovers (under 0.8 in 6 of 40 cells, worst 0.28).
The top-3-vs-all statistic covers in all 40 cells at m = 16 (minimum 0.81) but is a median 4.6 times the realised regret
and under 0.1 only for halving from R2 at the relaxed clock (7 of 10 groups). Across pilot sizes the share of regret-bearing
cells covered is 0.855 / 0.915 / 0.969 / 0.988 / 0.995 at m = 6 / 8 / 12 / 16 / 24, with median bound 0.21 to 0.33.
Coverage far exceeds the probability that the pilot holds one of the pool's best three (0.32 at m = 6, matching the
hypergeometric formula), so that event is not the mechanism. The coverage is empirical, not proved.

**A pilot gate** (milestone 16, `experiments/pilot_gate/results.txt`; all 20 designs, both clocks, budgets of 10 to 40 routed-point equivalents, 400 paired seeds). A five-point pilot's tau(R2,R4) separates the 12 of 40 cells where cutting on R2 rank misses by over 10% from the rest with AUC 0.85 (0.74 using R2 against R3), but a gate that picks halving with eta = 1.5 or the no-R2-cut arm from that statistic is within 0.1 points of the simple no-R2-cut arm at 25 and 40 equivalents (1.31 and 0.34 against 1.40 and 0.44; random 1.74 and 0.39) and worse at some budgets. On 20 designs eta = 1.5 loses to random at 25 and 40 equivalents (2.12, 1.38) because of barrel64; an oracle gate would reach 0.98 and 0.04. Six gates were compared without correction.

## 5 Limitations and threats
Ten small designs, one FIFO, one corner, one tool version, pools of about 50 so every strategy converges to 0 regret,
global-route estimates, one proof solver and timeout. Pilots are one third of the pool at m = 16. Coverage is over pilots
and tie-breaks within a fixed group, not over designs. Hyperband was run in its simplest form (one bracket per start rung, equal budget split; `experiments/hyperband/`): it does not beat random search at equal wall-clock on these pools but halves the worst-design regret of SH from R2 at the relaxed clock (4.6% vs 11.8% at 45 s). No BOHB or BO baseline yet (a pool of 50 gives a model nothing to fit); NSGA-II likewise. Several
effects rest on a handful of designs; there is no multiple-comparison correction.

## 6 What the paper still needs
(1) [Partly done in milestones 9 and 15: ten larger designs in two families; the R2-cut floor appears in both, on one design each.] Larger designs, where routed cost separates from R1 by orders of magnitude, so H2 is testable. (2) A second corner and
detail routing. (3) BOHB/BO baselines at equal wall-clock on larger pools. (4) A proof or counterexample for the top-vs-all
coverage, or a conformal pilot statistic with a theorem. (5) Typesetting to the MLCAD template. Until (1) and (3) land the
honest headline is the negative one: on small designs, cheap rungs did not pay.
