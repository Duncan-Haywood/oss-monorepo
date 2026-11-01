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

**Proof success under Yosys 0.70** (milestone 52, `experiments/proof_success/compare_y070.txt`; 900 launched, 751 usable, 751 shared with the Yosys 0.33 table). 0 counter-examples; 627 proved and 124 timed out at 10 s. Every design except the 7- to 10-bit multipliers proves 50 of 50 within 1 s on both versions, the 10-bit multiplier times out on all 50 under both, and the proved-within-3-s label agrees on 750 of 751 points (0.999). So the reading that proof time is set by the design is not an artefact of the old solver. One more sequence failed in ABC under 0.70 (751 usable points against 752), not investigated, and mapped netlists differ by a few cells between versions.

**Other designs, corners and operating points** (milestones 9, 15, 24 to 28; each paragraph names its results file).
*Larger designs* (`experiments/large/`, `experiments/nonarith/`): in ten designs of two families (multipliers and adders;
shifters, popcounts and an ALU) the R2 cut floors on one or two designs per family at the relaxed clock (mult24 and mult32 at
11.3% and 14.1%; barrel64 in the second family), and skipping the R2 cut removes the floor. *Placement density*
(`experiments/util65/`): at 65% utilisation instead of 40% the median R2 regret over the five larger designs moves by 0.4
points relaxed (2.9% to 2.5%) and 1.2 tight (0.8% to 2.0%); a routed point costs 24.4 s instead of 19.4 s. *Second corner*
(`experiments/corner_ss/`, `experiments/corner_replay/`; liberty only): at SKY130 ss 100C 1.60 V the routed-ADP ranking has a
median Spearman 0.69 against tt, the tt-optimal sequence loses a median 3.4% (up to 27%), and chosen-eta halving beats random
R4 at the relaxed clock but not at the tight one from 30 s, the reverse of tt, so a halving schedule has to be checked at the
corner being signed off. *Held-out families* (`experiments/unseen/`): CRC-32, priority encoder, sorting network, S-box and
decoder-mux have no tight-clock cell with R2 regret above 10% (largest 9.3%), and fixed eta = 1.5 beats the no-cut policy f3
there (0.77 against 0.85% at 25 routed-point equivalents), so f3 is insurance, not a universal winner. *Designs written to
break R2* (`experiments/hostile/`; crossbar, GF(2) matrix-vector, broadcast mix, 128-bit comparator, rotate-mix): one design
(`bcastmix192`, two distinct outcomes over 60 sequences) has R2 regret 49.9% because repair buffers the mapping that looked
worst (tau(R2,R4) = -1); the other eight cells are at most 1.1%. f3 (0.67) again matches the best arm at 25 equivalents and
the best pilot gate is worse (1.05); the pilot's AUC of 1.00 rests on two cells of one design. Across both new sets, the
pilot gate never paid for its pilot. Pooled over the ten held-out designs (`experiments/heldout_signif/`), eta = 1.5 and f3
beat random R4 by 1.3 points at 25 equivalents (8 and 7 of 10 designs better, bootstrap intervals exclude zero), but no test
survives a Holm correction over 12 tests (smallest adjusted p 0.14), and f3 and eta = 1.5 do not differ at 25 (p 1.0); the
held-out win is reported uncorrected.
Adding the two high-fanout designs (`fanao96`, `bcastadd64`; twelve designs) and ranking the R2 rung by mapped area alone
instead of area x period (`experiments/r2_area_arm/`) changes nothing inside halving: the two scorings differ by 0.00 points at
25 equivalents (Holm p 1.0), because eta = 1.5 keeps two thirds of the points after R2. As an argmin, area alone is worse
(mean full-pool R2 pick regret 10.3% against 6.0% over 24 cells) although its mean tau with R4 is higher (0.58 against 0.38). On
twelve designs both halving arms beat random R4 by 1.2 points at 25 equivalents (10 of 12 designs better, Holm p 0.044), the
first held-out comparison to survive a 12-test correction; two of the twelve were added after the ten-design test.
A harsher first cut (eta = 3, `experiments/r2_harsh_cut/`) shows the R2 score matters there: mean regret at 25 equivalents is 4.67
points against 0.65 at eta = 1.5 and 1.86 for random R4, and does not fall with budget, but the mean is two designs (`bcastmix192`,
49.9, a two-outcome binary swap; `crc32`, 2.9). The median over twelve designs is lower at eta = 3 (0.31, against 0.76 and 1.21), so
a harsh cut is the best typical case and the worst tail; none of this is significant after correction (Holm p 1.0). Scoring R2 by
area alone is worse still at eta = 3 (5.94 at 25). The medians and the exclusion are post hoc.

Tail table (`experiments/tail_risk/`, descriptive, fixed before the run): worst-design regret of eta = 1.5 halving falls with budget
(8.3 / 4.9 / 1.4 / 0.6% at 10 / 15 / 25 / 40 equivalents) and no design exceeds 5% from 15 equivalents up; at eta = 3 the worst design
is `bcastmix192` at 47 to 50% at every budget (mapped-area scoring: `bcastadd64`, 61 to 68%), while its median is lower from 15
equivalents (0.85 against 1.87 at 15). Random R4 has four designs above 5% at 10 and 15 equivalents. We therefore report medians and
worst-design regret beside means.

## 4 A bound and what a pilot can check
Define the inversion of a rung, iota = max(0, max over pairs with s(x) <= s(x') of log y(x) - log y(x')). **Proposition.**
Successive halving with cut rungs r_1..r_m returns a value with log regret at most the sum of iota_{r_j}. Proof: if the
best survivor x of cut j-1 is cut, every survivor z has s(z) <= s(x), so log y(z) <= log y(x) + iota; chain over the cuts
(`experiments/theory/BOUND.md`; checked on 500 random instances and all 40 cells). It is vacuous for R1 (iota above 0.3 on
8 of 10 groups; bound 0.63 to 0.71) and loose for R2 (bound 0.23 to 0.35 where realised regret is about 0). A pilot's
maximum is a lower bound on iota, so a pilot can suggest but not certify it.

**A bound that uses the survivor count** (milestone 37, `experiments/theory/KTH.md`, `kth_results.txt`). Let iota^(k) be the largest,
over candidates x, of the k-th largest excess log y(z) - log y(x) among rivals z the rung ranks at or ahead of x. A cut keeping k
points loses at most iota^(k) (x is cut only if all k survivors are such rivals, and the best of any k of them is at most the k-th
largest), so regret is at most the sum of iota^(k_j); iota^(1) = iota. On the 40 cached group-rung cells the bound is never
violated (200 tie-breaks each), is below the old bound in 39 of 39 cells with a positive old bound (median ratio 0.54), and is
under the spread of y in 32 cells against 16. It remains about 3 times the largest realised regret and needs the full table. Anchoring the first cut at the pool optimum (milestone 39, `anchored_results.txt`) is also valid (0 violations) but lowers the bound by only about 11% at the median (lower in 23 of 37 cells).

**A rank assumption for zero regret** (milestones 44 and 45, `experiments/theory/optimum_rank_results.txt`, `optimum_rank_n_results.txt`; no flow run). Let rho_j be the number of rivals a cut's score ranks at or ahead of the pool optimum x*. A cut keeping k_j points can only drop x* if rho_j >= k_j, so rho_j < k_j at every cut makes regret exactly 0 (the kappa = 0 case of the bound above; no violation in 200 tie-breaks of each of the 11 guaranteed cells). The assumption holds in 11 of 40 cached cells (cells whose worst rho/k is at most 1, 2 and 4: 13, 21 and 29 of 40; median 1.97), and where it fails 0.167 of tie-breaks still reach zero regret on average. Subsampling the pool to n' = 20, 30, 40 and 50 candidates, the median worst rho/k rises 2.33, 2.60, 3.00, 3.00 and the share with rho/k at most 1 falls 0.168, 0.130, 0.086, 0.050; this is partly built in (the last cut keeps one point, so its ratio is the raw count rho_3), and nothing above 50 candidates was measured. It is a diagnostic on the full table, not a pilot-side certificate: a pilot cannot observe rho, and milestone 43 shows a quantile of the excess cannot supply the missing bound.

**Pilot-checkable statistics** (`topk_results.txt`, `sweep_results.txt`; 200 to 300 pilots x 10 to 20 tie-breaks per
cell, 20 groups, both halving starts). Max over random pilot pairs undercovers (under 0.8 in 6 of 40 cells, worst 0.28).
The top-3-vs-all statistic covers in all 40 cells at m = 16 (minimum 0.81) but is a median 4.6 times the realised regret
and under 0.1 only for halving from R2 at the relaxed clock (7 of 10 groups). Across pilot sizes the share of regret-bearing
cells covered is 0.855 / 0.915 / 0.969 / 0.988 / 0.995 at m = 6 / 8 / 12 / 16 / 24, with median bound 0.21 to 0.33.
Coverage far exceeds the probability that the pilot holds one of the pool's best three (0.32 at m = 6, matching the
hypergeometric formula), so that event is not the mechanism. The coverage is empirical, not proved.

**A pilot gate** (milestone 16, `experiments/pilot_gate/results.txt`; all 20 designs, both clocks, budgets of 10 to 40 routed-point equivalents, 400 paired seeds). A five-point pilot's tau(R2,R4) separates the 12 of 40 cells where cutting on R2 rank misses by over 10% from the rest with AUC 0.85 (0.74 using R2 against R3), but a gate that picks halving with eta = 1.5 or the no-R2-cut arm from that statistic is within 0.1 points of the simple no-R2-cut arm at 25 and 40 equivalents (1.31 and 0.34 against 1.40 and 0.44; random 1.74 and 0.39) and worse at some budgets. On 20 designs eta = 1.5 loses to random at 25 and 40 equivalents (2.12, 1.38) because of barrel64; an oracle gate would reach 0.98 and 0.04. Six gates were compared without correction.

**Detail routing and tool versions** (milestone 47, `experiments/detail_route/results.txt`; 5 designs, 250 points, tight clock, OpenROAD 26Q3 and Yosys 0.70). Against a detail-routed reference (detailed_route plus OpenRCX extraction), R4 (global route plus repair) has tau-b 0.65 to 0.93 (median 0.84, three of five designs at 0.8 or more), its pick costs at most 1.2% and the R5 optimum is in its top 5 on all five designs; R2's bias at the tight clock is unchanged (tau 0.25 to 0.86 against 0.36 to 0.85 for R4, pick regret 10.1% on alu8). Extracted slack is 0.08 to 0.35 ns more optimistic than the global-route estimate. Re-running R4 under the newer tools gives tau of only 0.28 to 0.56 against the cached table, so numeric regrets in this paper hold for OpenROAD 26Q2 and Yosys 0.33; the rung-bias conclusion survives, the tables do not transfer. One corner, five designs, the version and reference changes are confounded in the drift row. **Relaxed clock** (milestone 49, `experiments/detail_route/results_relaxed.txt`; the same five designs and 250 points at 1.5x the baseline period, 0 DRC violations): R4 against R5 has tau-b 0.81 to 0.90 (median 0.85, all five at 0.8 or more), its pick costs 0.0% on four designs and 2.3% on mult8, and the R5 optimum is in its top 5 on all five. R2 against R5 has median tau 0.66, with pick regret 10.1% on alu8 and 9.2% on barrel16 (0.0% at the tight clock), so R2's bias on barrel16 is clock-dependent. Extracted slack is a median 0.325 ns more optimistic than the global-route estimate (tight: 0.19 ns), and version drift of R4 remains large (tau 0.07 to 0.66). No predictions were fixed before this run. **Larger designs** (milestone 51, `experiments/detail_route/results_large.txt`; mult16 and the 64-bit adders `adder_op64` and `adder_ripple64`, tight clock, first 24 sequences per design, 71 of 72 points ok, 0 DRC violations; the predictions were written before the results were read): R4 against R5 has tau-b 0.93 on mult16 and adder_op64 (the ripple adder, 1.00, has only 6 distinct R5 scores and is uninformative), R4's pick costs 0.0% on all three and the R5 optimum is in its top 5 on all three. R2 against R5 has tau 0.80 (adder_op64) and 0.67 (mult16) with pick regret 12.0% and 3.9%. Extracted slack is more optimistic than the global-route estimate on all 71 points (median 0.39 ns). Version drift of R4 against the cached table is again large on the multiplier (tau 0.31). Pools of 24 give wide intervals; mult24 and mult32 were not run (220 to 280 s per mult16 detail route).

## 5 Limitations and threats
Ten small designs, one FIFO, one corner, one tool version for the headline tables (milestone 48 re-measured the ten-design table under OpenROAD 26Q3 / Yosys 0.70: the qualitative conclusions reproduce, R4 scores correlate across versions at only tau 0.44 median and the tight clock target moved in 16 of 20 cells, `experiments/rung_bias_26q3/`), pools of about 50 so every strategy converges to 0 regret,
global-route estimates, one proof solver and timeout. Pilots are one third of the pool at m = 16. Coverage is over pilots
and tie-breaks within a fixed group, not over designs. Hyperband was run in its simplest form (one bracket per start rung, equal budget split; `experiments/hyperband/`): it does not beat random search at equal wall-clock on these pools but halves the worst-design regret of SH from R2 at the relaxed clock (4.6% vs 11.8% at 45 s). No BOHB baseline yet; the smallest model-based baseline we ran, a greedy ridge regression of routed cost on R2 features refitted as points are routed (`experiments/mf_surrogate/`, milestone 20), is worse than random R4 and than never cutting on R2 at budgets of 15, 25 and 40 routed-point equivalents (mean regret 4.8, 3.1, 1.7% against 3.1, 1.4, 0.4% for the latter), and stays at 19% on barrel64; adding an exploration term (a lower confidence bound or epsilon-greedy, milestone 21, `experiments/mf_explore/`, run once before it was logged) improves every variant over greedy, about halving barrel64's regret at 40 equivalents, but none beats never cutting on R2 or random R4 at any budget (mean regret 4.5, 2.8, 1.3% for the best lower-confidence-bound variant against 3.1, 1.4, 0.4% for the former). A GP Bayesian-optimisation baseline (exact GP with an RBF kernel on the R2 features, expected improvement or lower confidence bound, fixed untuned hyperparameters; milestone 22, `experiments/mf_gp/`, 100 seeds) closes barrel64 at 40 equivalents (0.13%) but still loses to never cutting on R2 at every budget (best mean regret 3.8, 1.9, 0.74% against 3.0, 1.5, 0.45%), losing on 23 of 40 cells at 25 and 40 equivalents. BOHB's model, a TPE density ratio over the same features inside the same single-pool search (milestone 23, `experiments/mf_tpe/`, 100 seeds; the bracket schedule is not reproduced), is weaker than the GP: best mean regret 4.3, 2.3, 1.1% against 3.0, 1.5, 0.45% for never cutting on R2, and 7% on barrel64 at 40 equivalents. NSGA-II likewise. Several
effects rest on a handful of designs; there is no multiple-comparison correction.

## 6 What the paper still needs
(1) Detail routing on mult24 and mult32 (milestones 47, 49 and 51 did five small designs at both clocks and mult16 and the 64-bit adders at the tight clock), and the ss replay of the larger designs (liberty-only corner so far; needs OpenROAD). (2) The mechanism on `fanao96` is now observational (milestone 31: area keeps its order, tau 0.98; the mapped period spread of 0.58 to 3.88 ns compresses to about 1.1 to 2.1 ns routed, and buffers added do not explain it); a causal test varying the fanout is still open (milestone 30, `experiments/fanout_rich/`: 36 to 39 distinct outcomes per cell, R2 pick regret 13.7 and 14.6%, tau 0.14 and 0.20, while the gate still does not beat the no-R2-cut arms); `bcastmix192` alone has two outcomes and supports no statistics. (3) Bayesian-optimisation baselines at equal wall-clock on larger pools (ridge, GP-EI and TPE
variants on pools of about 50 are done, milestones 20 to 23, and none beats never cutting on R2; BOHB with KDE entrants inside Hyperband brackets, milestone 54, `experiments/bohb/`, is the exception at low budget: mean regret 2.62 and 2.05 % at 15 and 25 routed-run equivalents against 3.56 and 1.77 % for random routing, ahead in 26 and 25 of 40 cells (sign-test p 0.011 and 0.029, non-independent cells), and behind it at 40 (1.38 against 0.36 %), with the same tail cells (barrel64, mult32) at 14 to 16 %; exploratory, unconfirmed on held-out designs). (4) A proof or
counterexample for the top-vs-all coverage, or a conformal pilot statistic with a theorem (partial, milestone 35: the pair-quantile share bound is proved only for independently drawn pairs; for disjoint pairs the iid argument fails in general, counterexamples at N <= 7, `experiments/theory/disjoint_check.py`, and none was found at the claim's threshold; it is still a share bound, not a regret bound; milestone 36, `experiments/theory/with_replacement_results.txt`: the independent-pairs pilot, which the proof covers, has empirical coverage 0.826 or more over 60 cells at about 14 distinct routed points; milestone 38, `kth_pilot_results.txt`: a 16-point pilot estimate of iota^(k) is a lower bound with a median of 0.85 of the true value and no coverage statement, so the regret bound stays a full-table diagnostic and a pilot-side regret certificate is open; milestone 40, `kth_inflate_results.txt`: no fixed multiplier fixes it, since 3 covers 44 of 55 cells at 80% and a multiplier chosen on nine designs covers 44 of the 55 held-out cells, with none finite in 2 cells where the pilot value is 0; milestone 41, `quantile_g_results.txt`: replacing the maximum by the 0.9-quantile of the per-candidate excess gives a bound under the spread of y in 38 of 40 cells that realised regret exceeds in 5.00% of draws, but all in 2 cells where the optimum itself has a large excess, so it is evidence, not a certificate; milestone 43, `quantile_counterexample_results.txt`: no quantile q < 1 of that excess can be a theorem, since a constructed pool has the optimum ranked last by the rung and every other excess 0, so the quantile is 0 and the regret is log c for any n, and the empirical coverage stays a property of this table). (5) Typesetting to the MLCAD
template. Until (1) to (3) land, the honest headline is the negative one: on small designs, cheap rungs did not pay, and a
pilot gate that detects when they will not has not been shown to pay for itself on the 30 designs it was replayed on (20 in milestone 16, five each in milestones 27 and 28).
