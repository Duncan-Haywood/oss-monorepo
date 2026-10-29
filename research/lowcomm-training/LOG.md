# Research log: lowcomm-training

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-29 · Milestone 6b (H6): does a product rule excess = f(p) g(H), fitted on H in {4, 16, 64}, predict held-out H in {8, 32}? (planned before running)

- Why: 6a's "Next". The cross term is real at p = 1/16, so the additive rule is out; the smallest replacement is separable, excess(H, p) = f(p) g(H). It is tested the only way a fitted rule can be: on H it was not fitted on.
- Fit (before seeing H = 8, 32): normalise g(16) = 1. From 6a at p = 1/16, g(4) = 0.0402/0.0826 = 0.49, g(64) = 0.0987/0.0826 = 1.19. g is interpolated linearly in log2 H, so the predicted excess at p = 1/16 is H = 8: **+0.062**, H = 32: **+0.091** (rival, the additive rule: +0.083 at both).
- New runs: uncompressed and keep 1/16 at H in {8, 32}, seeds 0 to 2 (12 runs, `composition.py run8_32`, same model, budget and lr as 6a; the uncompressed cells use `compress=None`).
- **H6b-i:** the product rule's predicted excess is within 0.02 nats of the measured one at both H = 8 and H = 32. Refuted if either misses by more than 0.02.
- **H6b-ii:** the product rule's absolute error is smaller than the additive rule's at H = 8 (where they differ most, 0.062 vs 0.083). Refuted otherwise.
- Prior: i 60%, ii 55%. A cell mean has a seed spread of about 0.01 and an excess is a difference of two cells (about 0.014), so H6b-ii at H = 8, where the two rules are 0.021 apart, is close to a coin flip.
- Limits known in advance: one compression level carries the test (p = 1/4 excess is within seed spread); three seeds; g is read off three points; one model, corpus and compressor; 0.02 is my choice.

### Outcome of 6b (`experiments/gpt_composition/`: `composition.jsonl` gained 12 rows, `run8_32.out`, `composition_results.txt`; seeds 0 to 2, about 9 minutes per run)
- Measured rand-k excess at p = 1/16 over the uncompressed cell at the same H: H = 8 **+0.0669**, H = 32 **+0.0978**. Product rule predicted +0.0614 and +0.0906 (errors -0.0055 and -0.0071); the additive rule's constant +0.0826 errs by +0.0157 and -0.0152.
- **H6b-i supported** (both product errors are under 0.02). **H6b-ii supported** (0.0055 against 0.0157 at H = 8).
- Reading, with the limit that matters: the additive rule also lands inside 0.02 at both held-out H, so H6b-i alone does not separate the rules. The evidence for the product rule is that its errors are about a third of the additive rule's at both H and have the right sign pattern, and that the whole curve (H = 4 to 64: +0.040, +0.067, +0.083, +0.098, +0.099) is monotone in log H with a flattening above H = 32. Each difference is of order the seed spread of a cell mean (about 0.01), so this is consistent with the separable form, not a strong test of it.
- Limits: one compression level carries the test; g is interpolated from the three fitted points; three seeds with no interval on the errors; one model, corpus and compressor. Not tested: whether f(p) is the compressor variance factor (1+omega), which needs more levels of p.
- Next: more p levels (1/8, 1/32) at H = 4 and 64 to fit f(p) against 1+omega, then the comparison with a same-size fitted scaling law that H6 asks for.

## 2026-10-29 · Milestone 6a (H6 pilot): does rand-k compression's excess loss compose additively with the outer delay H? (planned before running)

- Why: H6, the main claim, has no data yet: every run so far varies one axis. The cheapest crossed cells reuse existing runs: uncompressed H in {4, 16, 64} (3d, lr 2e-3, M = 4) and rand-k at H = 16 (4a). New cells: keep p in {1/4, 1/16} x H in {4, 64}, seeds 0 to 2 (12 runs, `experiments/gpt_composition/composition.py`, about 10 minutes each, 4 in parallel).
- Rule tested: additive, excess(H, p) = excess(16, p), where excess is over the uncompressed cell at the same H (the no-cross-term case of a composition rule).
- **H6a-i:** the additive rule predicts all four corner excesses within 0.03 nats. Refuted if any corner misses by more than 0.03 (a cross term exists and H6's rule needs an H x omega term).
- Prior: 45% supported. 4a's excess is +0.017 at p = 1/4 and +0.083 at p = 1/16, the same order as the seed spread (about 0.01), so the cells at p = 1/4 can hardly miss by 0.03; the p = 1/16 cells decide it. I do not predict the direction.
- Limits known in advance: three seeds (no interval beyond the spread); one model, one corpus, one compressor; this tests the no-cross-term rule only, not the fitted H6 comparison against a scaling law, which needs a larger grid.

### Outcome of 6a (`experiments/gpt_composition/`: `composition.jsonl`, `composition_results.txt`, `run.out`; 12 new runs, seeds 0 to 2, about 9.5 minutes each)
- Rand-k excess over the uncompressed cell at the same H (nats), p = 1/4: H = 4 **+0.009**, H = 16 +0.017, H = 64 **+0.010**; p = 1/16: H = 4 **+0.040**, H = 16 +0.083, H = 64 **+0.099**. Cells are 3-seed means; seed spread inside a cell is about 0.01.
- **H6a-i refuted.** The additive rule misses by 0.042 at (H = 4, p = 1/16) and 0.016 at (H = 64, p = 1/16), the first above the 0.03 line; the p = 1/4 corners miss by under 0.01 (within seed spread, as the prior said).
- Reading: at p = 1/16 the compression cost is not independent of H. It halves going from H = 16 to H = 4 (+0.083 to +0.040, outside the seed spread) and rises a little at H = 64 (+0.099, a 0.016 change that is about 1.5 seed spreads, not established). So a composition rule needs an H x omega cross term, at least for the downward direction. Why is untested; a guess, not a finding: with more rounds, each carrying a smaller delta, the compression noise is averaged over more outer steps.
- Limits: three seeds, no interval on the differences; one compressor and model; only two compression levels, so a functional form (for example excess proportional to omega times a function of H) is not fitted; the 0.03 threshold was my choice.
- Next: fit excess = f(omega) g(H) on these nine excesses plus 4a's other keeps, check it on held-out H (H = 32 or 8), then the fitted-versus-scaling-law comparison H6 asks for.

## 2026-10-29 · Milestone 7b: machine-check the proposal's citations and add related work to the breakdown section (no training)

- Why: 7a's draft cited nothing, and the proposal's 16 arXiv ids had been unchecked since 2026-10-24 (host refused then).
- Done: `cite_check.py` resolved all 16 ids (the proposal's "Citation status" now records this, and the one title difference: 1909.04715 resolves to the first-version title). Six robust-aggregation ids were checked too and four are cited in `paper/section_breakdown.md` under a new "Related work" paragraph, whose claims are limited to title and abstract-level content.
- Not done: no paper was fully re-read; the Krum paper (Blanchard et al.) was not checked and is not cited; still no scale-up check (milestone 6).
- Next: milestone 6 (fit at three sizes, predict the fourth) and the remaining paper sections.

## 2026-10-28 · Milestone 7a: draft the breakdown-point section of the paper from 5i to 5n (no new training)

- Why: 5n's "Next" said the median's breakdown is established, or to stop. The programme had no `paper/` yet; this writes the first section from recorded results so the claim is stated once, with its limits, and the table regenerates from the jsonl files.
- Done: `paper/section_breakdown.md` and `paper/breakdown_table.py` (reads `coalition.jsonl`, `k7.jsonl`, `coordinated.jsonl` and the clean median of `median_m16_full.jsonl`; prints `paper/breakdown_table.md`). The table matches the 5j, 5k, 5m and 5n outcomes above cell for cell.
- Not done / limits: no new result; coordinated k = 3 and k = 7 have one seed each; citations in the draft are not yet machine-checked.
- Next: a robust aggregator that tolerates k >= M/2 is the open question; otherwise move to milestone 6 (scale-up check) and the remaining paper sections.

## 2026-10-28 · Milestone 5n: what happens at k = 8 and k = 9 under the coordinated attack, where the median is an attacker value? (planned before running)
- Why: 5m's "Next". At M = 16 the median averages ranks 8 and 9 of the sorted values; with k >= 8 coordinated attackers at -1e3 x sign(honest mean), rank 8 is an attacker value for k = 8 and both ranks are for k = 9, so the aggregate is no longer bounded by honest values.
- Design: `KS=8,9 SEEDS=0,1 python3 coordinated.py run` (unchanged script, 4 runs, 4 processes), excess over each seed's clean median.
- **H5n-i:** k = 8 either diverges (final validation loss above 3 or NaN) or exceeds +1.0 on at least one seed, consistent with 5j's independent k = 8 divergence. Refuted if both seeds stay below +1.0 and train.
- **H5n-ii:** k = 9 diverges or exceeds +1.0 on both seeds. Refuted otherwise.
- Prior: i 75%, ii 85%. The k = 4 to 7 curve (+0.23, +0.37, +0.54, +0.77) is convex but smooth, so a gradual rather than a sudden break is also plausible, which hypothesis i would then miss.
- Limits known in advance: two seeds, not an interval; one model and corpus; the attacker knows the honest mean sign exactly.

### Outcome of 5n (`experiments/gpt_median_coalition/`: `coordinated.jsonl` gained 4 rows, `run_5n.out`; seeds 0 and 1, about 43 minutes each)
- Final validation loss: k = 8 **inf** on both seeds (non-finite weights), k = 9 **3.3e7** (seed 1) and **3.8e7** (seed 0). Every k = 8 and k = 9 run diverged; the clean median reaches about 1.5.
- **H5n-i supported** (both seeds diverge at k = 8). **H5n-ii supported** (both seeds diverge at k = 9).
- Reading: with the same-vector attack the loss rises smoothly from k = 4 to 7 (+0.23 to +0.77 nats, 5m) and then diverges completely at k = 8, the first count at which rank 8 of 16 is an attacker value. This matches the median-is-attacker-value wall (5k, 5l), and the coordinated attack has the same breakdown count (8) as 5j's independent flips, though it is far more harmful below it (k = 7: +0.77 against +0.29). The numpy net-signal crossover (k = 3 to 4) is still not the breakdown rule; the wall is the order-statistic bound.
- Limits: two seeds, all four runs diverged so there is no interval to report; k = 8 inf means NaN/inf weights, so the size of the blow-up is not comparable between k = 8 and 9; one model and corpus.
- Next: a robust aggregator that tolerates k >= M/2 (not a median), or stop here: the median's breakdown point is established empirically at k = 8 of 16 under both attacks.

## 2026-10-28 · Milestone 5m: does the coordinated-attack degradation replicate on a second seed, and where is the wall at k = 7? (planned before running)
- Why: 5l's "Next". 5l had one seed per k (3 to 6), so no interval; k = 7 is the last count below the median-is-attacker-value wall at k = 8.
- Design: same `coordinated.py` (M = 16, same-vector attack, 3840 inner steps, H = 16), seed 1 at k = 4, 5, 6, 7 (seed 1 has a clean-median reference, 1.5293, in `gpt_median_m16/median_m16_full.jsonl`).
- **H5m-i:** the excess at k = 4, 5, 6 on seed 1 is within 0.05 nats of seed 0's (+0.231, +0.363, +0.516), i.e. the roughly linear +0.12 to +0.15 nats per attacker is not a seed accident. Refuted if any of the three differs by more than 0.1.
- **H5m-ii:** k = 7 continues the line (excess between +0.55 and +0.75) and still trains, since the median at k = 7 of 16 is still an honest value (rank 8 of 16 sits above the 7 attackers). Refuted if it diverges or is above +1.0.
- Limits: one extra seed gives a replication check, not an interval; k = 3 and seed 2 are not run.

### Outcome of 5m (`experiments/gpt_median_coalition/`: `coordinated.jsonl` gained 4 rows, `run_5m.out`, `coordinated_results.txt`; seed 1, about 44 minutes per run)
- Final validation loss k = 4, 5, 6, 7: 1.761, 1.896, 2.070, 2.296; excess over seed 1's clean median (1.5293): **+0.231, +0.366, +0.541, +0.766** nats. Seed 0 gave +0.231, +0.363, +0.516 at k = 4, 5, 6.
- **H5m-i supported:** the seed 0 / seed 1 gaps are 0.000, 0.003, 0.025 (all under the 0.05 band), so the near-linear degradation replicates on a second seed (two seeds: not an interval).
- **H5m-ii: the stated band missed, the refutation condition did not occur.** k = 7 is +0.766, 0.016 above the predicted +0.55 to +0.75 band, below the +1.0 refutation line, and it trains. The increments per attacker are +0.135, +0.175, +0.225, so the curve is slightly convex rather than linear: the growth per extra attacker is rising as k approaches 8, consistent with the wall at k = 8 but not a test of it.
- Limits: one extra seed; k = 8 (where the median is an attacker value) not run; seed 1 alone at k = 7.
- Next: k = 8 and k = 9 (expected to break), and seed 2.

## 2026-10-28 · Milestone 5l: where does the median break under the worst-case coordinated attack? (numpy prediction half; training run still to do)
- Why: 5k's "Next". Disclosure: the hypothesis below was written in 5k's "Next" and the table was run before this entry was committed, so the numbers are not blind; the training test (the out-of-sample part) is not run yet.
- Design (`experiments/gpt_median_coalition/coordinated_numpy.py`, `coordinated_numpy_results.txt`; 1e6 coordinates, M = 16, i.i.d. Gaussian honest deltas): all k attackers send the most extreme value against the signal (rank-bounded, so -infinity is the strongest push a median allows), compared with 5j's independent -10x flips. Net signal = mu/sigma plus the median's bias.
- Outcome at mu/sigma = 0.4 (5h's late-training value): bias per k = 1..7 is -0.083, -0.178, -0.289, -0.424, -0.595, -0.828, -1.208 sigma, against -0.028 to -0.330 for independent flips (2.5x to 3.7x larger). Net signal goes negative between k = 3 (+0.11) and k = 4 (-0.02), where the independent flips need k = 8. At mu/sigma 0.3 the crossing is k = 3 to 4, at 0.6 it is k = 5 to 6, at 1.0 it is k = 6 to 7; at k >= 8 the median is itself an attacker value (no bound).
- Prediction to test with real training (not run): **H5l-i:** a coordinated k = 4 coalition at M = 16 gives an excess well above the independent k = 4 (+0.047) and k = 5 or 6 diverges or exceeds +0.3; refuted if k = 4 stays below +0.1 and k = 6 trains. The margin at k = 4 is -0.02 sigma, inside the fit's error, so k = 3 to 5 is the honest window.
- Limits: i.i.d. Gaussian coordinates, one mu/sigma fit (the sweep shows the crossing moves 3 to 7 over 0.3 to 1.0); actual training also shifts mu/sigma per round and has per-tensor scales (5h); the attack needs the attackers to know the signal direction per coordinate, which a real adversary only approximates.
- Next: run `coalition.py` with a same-vector attack at k = 3, 4, 5 (about 46 min per run, torch needed: full PyPI install, about 2 min) and compare with this table.

### Outcome of 5l training half (`experiments/gpt_median_coalition/`: `coordinated.py`, `coordinated.jsonl`, `coordinated_results.txt`, `run_5l.out`; 4 runs, seed 0 only, about 43 minutes each; `diloco.py` gained a `collective` attack hook that sees all workers' deltas)
- Attack: workers 0..k-1 send 1e3 x (minus the sign of the honest workers' mean delta) per coordinate. Excess over the clean median (same seed): k = 3 **+0.093**, k = 4 **+0.231**, k = 5 **+0.363**, k = 6 **+0.516** nats (final validation loss 1.64, 1.78, 1.91, 2.06). None diverged.
- **H5l-i supported (one seed):** k = 4 is 4.9x the independent-flip k = 4 (+0.047) and k = 5 exceeds +0.3. The refutation condition (k = 4 below +0.1 with k = 6 training) did not occur.
- Not supported: the numpy net-signal crossing (between k = 3 and 4 at mu/sigma = 0.4) did not produce a blow-up or an ascent; the loss degrades about linearly, +0.12 to +0.15 nats per extra attacker, and k = 6 still trains. So the bias-crossover account (5k) predicted where independent flips break (k = 8, a median-is-attacker-value wall) but does not carry over as a "net signal below zero means divergence" rule to this attack; the per-round mu/sigma, which is higher early in training (5h), plausibly lets training make progress before the signal is lost. This is a hypothesis, not tested.
- Limits: one seed (no interval); k = 7 and above not run; attacker knows the honest mean sign exactly; one model and corpus.
- Next: seeds 1 and 2 at k = 3 to 6, and k = 7 to locate the wall under the coordinated attack (the median becomes an attacker value at k = 8).

## 2026-10-28 · Milestone 5k: does the bias-crossover account place the breakdown between k = 7 and k = 8? (planned before running)
- Why: 5j's "Next". The squared-shift mapping under-predicted and missed the k = 8 divergence; the post-hoc account says training breaks when the coalition's median bias exceeds the honest signal, i.e. net signal `mu + bias` (numpy, mu/sigma = 0.4, `coalition_numpy_results.txt`) falls to zero or below. Net signal in sigma units: k = 4 +0.26, k = 5 +0.21, k = 6 +0.15, k = 7 +0.07, k = 8 -0.05. The two points that were not run, k = 5 and k = 7, now test it out of sample (k = 7 is the sharp one: the account says it still trains).
- Design: `KS=5,7 python3 coalition.py run` (one-line change to `coalition.py` so k is an environment variable; everything else as 5j), seeds 0 and 1, excess over the 5i clean median on the same seed.
- **H5k-i:** k = 5 excess lies between the k = 4 and k = 6 seed means (+0.047 to +0.140). Refuted otherwise.
- **H5k-ii:** k = 7 excess exceeds the k = 6 value, +0.14, or it diverges (steepening towards the wall). Refuted if below +0.14.
- **H5k-iii (the account's own prediction):** k = 7 does not diverge on either seed (final validation loss below 3). Refuted if either seed blows up, which would put the breakdown below the numpy crossover and the account would need the falling mu/sigma (5h) to move it.
- Prior: i 70%, ii 80%, iii 50% (net signal +0.07 sigma is well inside the numpy fit's own error and the per-round mu/sigma falls below 0.4 late; early rounds have mu/sigma above 1).
- Limits known in advance: two seeds; the coordinated attack of 5j is still independent per-member flips, not the optimal one; one model and corpus.

### Outcome of 5k (`experiments/gpt_median_coalition/`: `coalition.jsonl`, `coalition_5k_results.txt`, `run_5k.out`; 4 runs, seeds 0 and 1, about 46 minutes each)
- Excess over the clean median (same seed), seeds 0 / 1: k = 5 +0.069 / +0.093 (mean +0.081); k = 7 +0.259 / +0.319 (mean +0.289). Neither diverged (final validation loss 1.61 to 1.85).
- **H5k-i supported:** k = 5 lies between the k = 4 (+0.047) and k = 6 (+0.140) means. **H5k-ii supported:** k = 7 (+0.289) is about twice k = 6. **H5k-iii supported:** k = 7 trains on both seeds, while k = 8 blew up on both (5j), so the breakdown sits between k = 7 and k = 8, where the numpy net signal changes sign (+0.07 to -0.05 sigma). This is the one out-of-sample check of the bias-crossover account; it passed, on two seeds.
- Reading: the excess climbs 0.014, 0.047, 0.081, 0.140, 0.289 for k = 2, 4, 5, 6, 7, then diverges at 8, a steepening wall as the net signal shrinks (0.26, 0.21, 0.15, 0.07 sigma at k = 4, 5, 6, 7). Predicted by squared-shift scaling, k = 7 would have been +0.053, so that statistic misses it by 5x; the signal left after the bias is the better predictor, with the excess roughly rising as the signal falls.
- Limits: two seeds; the account is a one-parameter fit (mu/sigma = 0.4), not yet a formula for the excess; independent per-member flips, not the optimal coordinated attack; one model and corpus.
- Next: the same-vector coordinated attack (all members send -c x the honest mean), where the median's bias is larger and the breakdown k should move down; and a per-round mu/sigma-based prediction of the breakdown.

## 2026-10-28 · Milestone 5k-b: a third seed at k = 7, and the crossover across mu/sigma (a parallel session ran 5k on seeds 0 and 1; this adds to it)
- Run concurrently with the entry above, same settings, so k = 7 seeds 0 and 1 reproduce it bit for bit (+0.259, +0.319; `experiments/gpt_median_k7/k7.jsonl`). New: **k = 7 seed 2: +0.295** (three-seed mean **+0.291**, none diverged), and k = 5 seed 0 +0.069 (same as above).
- New numpy table (`crossover_numpy_results.txt`): net signal (mu/sigma minus |bias|/sigma) is positive at k = 7 and negative at k = 8 for every mu/sigma from 0.3 to 1.0, so the predicted breakdown between 7 and 8 does not hinge on the 0.4 fit. Margin at k = 7: +0.05 (mu/sigma 0.3) to +0.23 (1.0).
- Limits: as above; seed 2 is the only run not in the entry above.


## 2026-10-27 · Milestone 5j: where does the median break when k of 16 workers flip together? (planned before running)
- Why: 5i's "Next". One attacker is inside the noise floor at M = 16, so the question for the protocol is how the cost grows with the coalition size k. Numpy half (`experiments/gpt_median_coalition/coalition_numpy.py`, mu/sigma = 0.4 from 5h, i.i.d. Gaussian, 2e6 coordinates, no training): the median's mean squared shift relative to k = 1 is x2.1, x5.1, x10.3, x24.2 for k = 2, 4, 6, 8 (x46 at k = 9); the shift grows smoothly, with no cliff at k = M/2 (the median is bounded: the bias is 0.45 sigma at k = 8).
- Design: real training, `coalition.py`, k in {2, 4, 6, 8}, seeds 0 and 1, M = 16, everything else as 5i; excess measured over the clean median of 5i on the same seed. Scaling the paired one-attacker cost (+0.0036, 5i-b) by the squared-shift ratios predicts excess +0.008, +0.018, +0.037, +0.087 nats.
- **H5j-i:** the observed mean excess at k = 8 lies within a factor of 2 of the prediction (0.043 to 0.17 nats). Refuted otherwise.
- **H5j-ii:** the excess rises monotonically in k on the seed mean. Refuted if any step down.
- **H5j-iii:** at k = 8 the run still trains (excess below 0.5 nats, i.e. no divergence), as the bounded shift implies. Refuted if it diverges or exceeds 0.5.
- Prior: i 40% (the quadratic mapping was assumed and the single-attacker base is noisy), ii 75%, iii 85%.
- Limits known in advance: two seeds; one attack (sign flip at 10x, all members identical in kind but each with its own delta, so not an optimal coordinated attack); one model and corpus.

### Outcome of 5j (`experiments/gpt_median_coalition/`: `coalition.py`, `coalition.jsonl`, `coalition_results.txt`, `coalition_numpy_results.txt`, `run.out`; 8 runs, seeds 0 and 1, 32 to 44 minutes each)
- Excess over the clean median (same seed), seeds 0 / 1: k = 2 +0.005 / +0.022 (mean +0.014); k = 4 +0.041 / +0.052 (+0.047); k = 6 +0.141 / +0.139 (+0.140); **k = 8 diverged on both seeds** (final validation loss 556,403 and 482,332 nats-scale, i.e. blown up, not a degraded model).
- **H5j-i refuted:** at k = 8 the prediction was +0.087 (bar 0.043 to 0.17). Below k = 8 the observed excess is also above the quadratic scaling, by 1.8x (k = 2), 2.5x (k = 4) and 3.8x (k = 6), so the squared-shift mapping from one attacker under-predicts and the gap widens with k. **H5j-ii holds** (monotone in k, with the k = 8 blow-up). **H5j-iii refuted:** k = 8 does not merely degrade, it diverges.
- Post-hoc reading (not tested here): the numpy bias at mu/sigma = 0.4 is -0.139, -0.252, -0.445 sigma for k = 4, 6, 8. Once the coalition's bias exceeds the honest signal mu = 0.4 sigma, the aggregated step points the wrong way and outer training ascends. That crossover lies between k = 6 (net 0.15 sigma of signal left) and k = 8 (net -0.05 sigma), matching where the runs break, whereas the squared shift (which I used to predict) hides the sign. The right summary statistic for the median under a coalition is the bias relative to mu, not the shift.
- Consequence for the protocol: with this attack the median tolerates k = 6 of 16 (37%) at a cost of 0.14 nats, and fails at k = 8 (half), which is the classical breakdown point reached in practice; k = 7 was not run. The crossover point depends on mu/sigma, which falls over training (5h), so it should be tracked by round.
- Limits: two seeds; k = 7 and a finer grid not run; one attack (-10x flip, independent deltas per member, not optimised); one model and corpus; the mechanism is a numpy fit, not measured on the engine's deltas.
- Next: test the bias-crossover account directly: predict the breakdown k from the measured mu/sigma at each round (5h) and run k = 7, and a stronger coordinated attack (all members send the same vector, -c x the honest mean) where the median's bias is larger than with independent flips.

## 2026-10-27 · Milestone 5i: the out-of-sample M = 16 test of the order-statistic prediction (planned before running)
- Why: 5f/5g predicted the median's sign-flip cost falls a further ~4x from M = 8 (+0.0207 nats) to M = 16, i.e. about +0.005 nats; 5h found the real deltas are near-Gaussian late in training (mu/sigma about 0.4), so the Gaussian row applies. This is the first prediction made before the run rather than fitted to it.
- Design (`experiments/gpt_median_m16/median_m16.py`): 5d with M = 16 (3d model, H = 16, inner lr 2e-3, plain outer step, 3,840 steps, batch 16 per worker). Arms: mean (no attack), median (no attack), median with worker 0 sending -10x its delta. Seeds 0 to 2. The trimmed-mean arm is left out to bound the cost (about 35 minutes per run).
- **H5i-i:** the flip excess of the median over the M = 16 mean, averaged over seeds, is below 0.012 nats (half of the M = 8 value; the prediction is 0.005). Refuted if at or above 0.012.
- **H5i-ii:** the clean median is within 0.01 nats of the M = 16 mean. Refuted otherwise.
- Prior: i 65%, ii 85%. Seed noise on single excesses at M = 8 was about 0.01, so a mean of three cannot resolve 0.005 from 0.01; the bar is chosen to separate the prediction from "no fall".

### Outcome of 5i (`experiments/gpt_median_m16/`: `median_m16.py`, `.jsonl`, `median_m16_results.txt`, `run.out`; 9 runs, seeds 0 to 2, about 31 minutes each; the first batch was lost to a container restart and rerun unchanged)
- M = 16 mean, no attack: 1.5376 (1.5424, 1.5300, 1.5404). Clean median: 1.5356, excess -0.0020 (-0.0007 to +0.0017 per seed, one at -0.007). Median under the -10x flip: 1.5392, excess **+0.0016** (per seed -0.0016, +0.0094, -0.0031).
- **H5i-i supported:** +0.0016 is below the 0.012 bar. **H5i-ii supported:** the clean median is within 0.01 of the mean on all seeds.
- Reading: the cost fell from +0.095 (M = 4) to +0.021 (M = 8) to +0.002 (M = 16). The order-statistic prediction was about +0.005; the observation is at or below it, but the per-seed spread (about 0.005 to 0.01) is as large as the effect, so this confirms "the cost is now at the noise floor", not the 4x factor. A tighter test needs more seeds or an attacker strong enough to raise the signal (e.g. a coordinated minority).
- Limits: one attacker; three seeds; one model and corpus; the trimmed-mean arm was not run, so 5g's heavy-tail side prediction is untested.
- Next: coordinated attackers (k of 16 flipping together) to find where the median breaks, which is the question that matters for the protocol.

## 2026-10-27 · Milestone 5i-b: trimmed-mean arm at M = 16 (a parallel session ran the median arms of 5i; this adds the arm it left out)
- Run concurrently with the entry above, with identical seeds and settings, so the mean and median arms reproduce it bit for bit (`experiments/gpt_median_m16/median_m16_full.jsonl`, 12 runs; `median_m16_with_trimmed.py`). New: trimmed mean (drop one per side) with worker 0 sending -10x, planned with the hypothesis that its cost is within 2x of the median's (5g said Gaussian tails keep them within ~15%).
- Outcome (3 seeds, paired by seed): trimmed attacked minus unattacked median **+0.0091 (se 0.0070)**; median attacked minus unattacked median **+0.0036 (se 0.0039)**. Ratio 2.5x, nominally past the 2x bar, but one seed (seed 1, +0.0229) carries it and the se equals the gap: no evidence the trimmed mean matches the median, no measured difference either.
- The 5i unattacked-median reference makes the paired flip cost +0.0036, not the +0.0016 above (which is against the mean); both are within noise of 0 and of 0.005.
- Next: as above (coordinated attackers); if the trimmed mean is of interest, ~10 seeds on the two attacked arms.

## 2026-10-27 · Milestone 5h: what are the tail weight and mu/sigma of the real worker deltas? (hypotheses written after launching the runs, before any round past 1 was read)
- Why: 5g's "Next". Which row of its table applies depends on the honest deltas' tail index and mu/sigma, never measured because torch was absent. A CUDA torch wheel from PyPI installs here with its dependencies (about 2 minutes) and runs on CPU.
- Design (`experiments/delta_stats/delta_stats.py`): 5d/5e setup (3d model, M = 8, mean aggregation, no attack, 3,840 steps, seeds 0 to 2). At rounds 1, 10, 60, 120, 240 the engine's `attack` hook (identity) records each worker's delta per tensor. Per tensor: mu/sigma = rms of the across-worker mean over rms of the residual (corrected by sqrt(M/(M-1))); excess kurtosis and the Hill index (top 5%) of residuals normalised by the tensor rms; a Gaussian of equal size gives the sampling baseline. Round 1 of seed 0 was visible before writing these (kurtosis about 1, Hill about 5 weighted): those two numbers are not blind.
- **H5h-i:** at rounds 60 to 240 the parameter-weighted Hill index lies between 3 and 5 (the 5g rows that matter), i.e. the residuals are measurably heavier than Gaussian (Hill about 6 with this estimator). Refuted if above 5.5 or below 2.
- **H5h-ii:** weighted mu/sigma at rounds 60 to 240 is below 1 (the workers' shared signal is no larger than their spread; late in training the deltas are mostly noise). Refuted if above 1.
- Prior: i 55%, ii 50%.
- Limits: one model and corpus; pooling coordinates within a tensor mixes scale heterogeneity with tail weight, so Hill/kurtosis here are an upper bound on the per-coordinate tail that 5g's model uses; per-tensor not per-coordinate sigma.

### Outcome of 5h (`experiments/delta_stats/`: `delta_stats.py`, `delta_stats.jsonl`, `delta_stats_results.txt`; 3 seeds, 3,840 steps, about 25 minutes)
- Parameter-weighted, mean of 3 seeds. Round 1: mu/sigma 1.49, excess kurtosis 1.40, Hill 4.8. Round 10: 0.85, 0.85, 4.8. Round 60: 0.455, 0.16, 5.74. Round 120: 0.414, 0.05, 5.94. Round 240: 0.399, -0.01, 6.07. The Gaussian sampling baseline for the Hill estimator is 6.0 and for kurtosis 0.0.
- **H5h-i refuted** (in the direction against heavy tails): at rounds 60 to 240 the weighted Hill index is 5.7 to 6.1, above the 5.5 bar and indistinguishable from the Gaussian baseline by round 120. The residuals are heavy-tailed early (round 1, kurtosis 1.4 with one tensor at 13) and become Gaussian-like as training settles. Per-tensor maxima (2 to 4 at rounds 60 to 240) show a few tensors keep a mild tail.
- **H5h-ii holds:** weighted mu/sigma is 0.40 to 0.46 at rounds 60 to 240, below 1, so shared signal is smaller than the workers' spread.
- Reading: over most of the 3,840-step run the applicable row of 5g's table is the Gaussian one at mu/sigma near 0.4 (5f: M = 4 to 8 squared-shift ratio 4.27 to 4.41). The observed 4.6x fall in flip cost is a little above that but near it, so the order-statistic account fits with no heavy tail needed; 5g's heavy-tailed rows describe the first rounds, not the bulk of training. The prediction of a further ~4x fall at M = 16 (about 0.005 nats) stands, and 5g's prediction that the trimmed mean falls behind the median at M = 16 weakens: it needs heavy tails, which late deltas lack.
- Limits: one model and corpus; per-tensor pooling (scale heterogeneity inside a tensor would inflate kurtosis, so Gaussian-like results are, if anything, conservative); the loss-mapping from shift to cost is still assumed; the early-round tail was not tied to the flip cost.
- Next: the M = 16 run (median and trimmed arms, 3 seeds) to test the 0.005 prediction; torch now installs in about 2 minutes (full-dependency PyPI install on python3.11).

## 2026-10-27 · Milestone 5g: does 5f's order-statistic account survive heavy-tailed coordinates? (a numpy check, no training; planned before running)
- Why: 5f's stated limit was i.i.d. Gaussian coordinates, while real worker deltas are heavy-tailed. Same design as 5f (`experiments/median_order_stat_heavy/heavy.py`): honest noise is Student-t with nu = 5 and 3 degrees of freedom, rescaled to unit variance, against the Gaussian (nu = inf); mu/sigma in {0, 1}; M in {4, 8, 16}; median and trimmed mean; 2,000,000 coordinates; worker 0 sends -10x a fresh draw of its own delta.
- **H5g-i:** the squared-shift ratio M = 4 to 8 for the median stays within 3.5 to 6 (5f's band) at nu = 5 and nu = 3. Refuted if outside the band for either.
- **H5g-ii:** the median's squared shift is smaller under heavy tails than under Gaussian at every M (its middle order statistics are denser), so the predicted M = 16 flip cost does not rise. Refuted if any nu < inf has a larger squared shift than Gaussian at the same M and mu/sigma.
- Prior: i 60%, ii 55%.
- Limits known in advance: coordinates still independent; the attacker's -10x scale is the one used in training; the loss mapping is still assumed quadratic.

### Outcome of 5g (`experiments/median_order_stat_heavy/`: `heavy.py`, `heavy_results.txt`; 2,000,000 coordinates, seed 0, single draw so no interval)
- Median squared shift (units of sigma^2) at mu/sigma = 1: Gaussian 0.439, 0.095, 0.023 for M = 4, 8, 16; nu = 5: 0.404, 0.067, 0.015; nu = 3: 0.351, 0.041, 0.009. Ratio M = 4 to 8: Gaussian 4.63, nu = 5 6.06, nu = 3 8.59 (at mu/sigma = 0: 4.27, 5.25, 6.45).
- **H5g-i refuted:** the M = 4 to 8 ratio leaves the 3.5 to 6 band at nu = 5 (mu/sigma = 1: 6.06) and nu = 3 (6.45 and 8.59). Heavier tails make the median's attack cost fall faster with M than Gaussian predicts. Under this account the observed 4.6x fall would then not pin down the tail; it is equally compatible with Gaussian coordinates at mu/sigma = 1 and with mildly heavy tails at mu/sigma near 0, so 5f's "holds" was weaker than it read.
- **H5g-ii holds for the median:** squared shift is below the Gaussian value at every M, mu/sigma and nu tested, so the M = 16 prediction (about 0.005 nats from a 4x fall) stays an upper estimate, not a lower one: the M = 8 to 16 ratio is 4.1 to 4.6 for the median.
- Side result, not hypothesised: the trimmed mean (drop one per side) loses its advantage under heavy tails. At M = 8, mu/sigma = 1, nu = 3 it shifts 0.086 against the median's 0.041 (2.1x), and at M = 16 0.028 against 0.009 (3.1x); under Gaussian noise the two are within 15%. This is consistent with 5e's nominal (not significant) +0.0055 for the trimmed mean, and predicts the gap grows at M = 16.
- Limits: independent coordinates; one seed of the sampler (2e6 draws, differences of 0.0001 are noise); the quadratic loss mapping is still assumed; real tail index of worker deltas is unmeasured here (needs torch).
- Next: measure the tail index and mu/sigma of the real aggregated deltas in the engine (needs torch), which decides which row of this table applies; then the M = 16 run, now with a trimmed-mean arm since the gap should widen there.

## 2026-10-27 · Milestone 5f: does the order-statistic account predict the 4.6x fall in the median's flip cost from M = 4 to M = 8? (a numpy check, no training; written after seeing 5d/5e, so not a blind prediction)
- Why: 5d/5e's "Next": the displacement was never measured. Training needs torch (absent here) and 17 minutes per run, so I computed the account itself: per coordinate, M-1 honest workers send mu + sigma z, worker 0 sends -10x a fresh draw of its own delta; shift = aggregate(attacked) - aggregate(all honest), 2,000,000 coordinates, mu/sigma in {0, 0.5, 1, 2}, M in {4, 8, 16}, median and trimmed mean (`experiments/median_order_stat/order_stat.py`, `order_stat_results.txt`).
- Hypothesis chosen with the observed ratio (0.095/0.0207 = 4.6) already known: the loss cost scales with the mean squared shift. Refuted if the squared-shift ratio M = 4 to 8 is outside 3.5 to 6 for every mu/sigma.
- Outcome: mean squared shift ratio M = 4 to 8 is 4.27, 4.41, 4.63, 4.71 across mu/sigma = 0, 0.5, 1, 2; the absolute-shift ratio is 2.1 to 2.4. So the hypothesis holds, but it is a fit to one number with the shape (cost proportional to shift squared) assumed, not a test. Out-of-sample prediction it makes: M = 8 to 16 falls by a further 3.9 to 4.1x in squared shift, i.e. a flip cost near 0.005 nats at M = 16, to be checked by a run. The trimmed mean (drop one low, one high) has about the same squared shift as the median at M = 8 (0.0989 against 0.0949 at mu/sigma = 1) but a larger absolute shift and a larger systematic bias (-0.16 against -0.13 sigma), in the direction of 5e's nominal +0.0055 worse; that difference was within seed noise there, so this is consistent, not confirmed.
- Limits: i.i.d. Gaussian coordinates (real deltas are heavy-tailed and correlated across coordinates); the mapping from shift to loss is assumed quadratic; the sign of the bias (toward the flipped direction's opposite, i.e. a shrink of the step) matches the 5c account.
- Next: M = 16 run to test the 0.005 nat prediction (about 4 hours of CPU for 3 seeds; start it in the background); measure the real aggregated-delta shift in the engine to replace the Gaussian assumption.

## 2026-10-27 · Milestone 5d: does the median's sign-flip cost shrink when the attacker is 1 of 8 workers instead of 1 of 4? (planned before running)
- Why: 5b/5c's "Next". At M = 4 the median is the mean of the two middle values, so one flipped worker moves it from the honest middle pair to the honest lower pair (+0.095 nats). At M = 8 the median is the mean of the 4th and 5th values; one attacker shifts the pair by one rank out of seven honest ones, a smaller displacement in the honest spread. If the order-statistic account is right the cost should fall.
- Design (`experiments/gpt_median_m8/median_m8.py`): 5b's setup with M = 8 (3d model, H = 16, inner lr 2e-3, plain outer step, 3,840 steps, seeds 0 to 2). Arms: mean no attack (comparator), median no attack, median with worker 0 sending -10x its delta. 9 runs. Uncompressed M = 4 numbers are not a valid comparator here (more workers change the loss), so the M = 8 mean run is.
- **H5d-i:** median under the flip costs less than +0.05 nats over the M = 8 mean (mean over seeds), against +0.095 at M = 4. Refuted if at or above 0.05.
- **H5d-ii:** the clean median at M = 8 is within 0.02 nats of the M = 8 mean. Refuted otherwise.
- Prior: i 65%, ii 80%.
- Limits: 3 seeds, one attack, one H, non-adaptive attacker; the mechanism is still inferred from loss, not from a measured delta norm.

### Outcome of 5d (`experiments/gpt_median_m8/`: `median_m8.py`, `.jsonl`, `median_m8_results.txt`, `run.out`; 9 runs, seeds 0 to 2, about 17 minutes each)
- Final validation loss, mean over seeds: M = 8 mean aggregation, no attack 1.5527 (1.5551, 1.5447, 1.5581); median, no attack 1.5534 (excess +0.0007; per seed +0.0019, +0.0083, -0.0081); median with worker 0 sending -10x its delta 1.5733 (excess +0.0207; per seed +0.0161, +0.0294, +0.0164).
- **H5d-i supported:** the flip costs +0.021 at M = 8 (bar 0.05; every seed under 0.03), against +0.095 on every seed at M = 4. **H5d-ii supported:** the clean median is within 0.01 of the mean on all seeds.
- Reading: the cost fell by about 4.6x when the attacker's share fell from 1/4 to 1/8, as the order-statistic account predicts, but it is not zero, and M and the attacker's share changed together with nothing else held fixed. The displacement itself was still not measured, so the account remains a hypothesis that fits. Different baselines (M = 4 vs M = 8 means), so compare excesses, not raw losses.
- Limits: as planned; 3 seeds, one attack, one H.
- Next: measure the aggregated-delta norm directly; a trimmed-mean aggregator; M = 8 with two attackers (same share as M = 4 with one, to separate share from M).

## 2026-10-27 · Milestone 5e: at M = 8, does one sign-flip attacker still cost the median, and does a trimmed mean do better? (planned before running)
- Why: a parallel run landed 5d (`gpt_median_m8`) with the same median arms while this ran; the two ran identical seeds, and the shared arms (M = 8 mean 1.5527, median clean +0.0007, median under the flip +0.0207) reproduce bit for bit, an accidental determinism check. What is new here is the trimmed-mean arm, so this entry is about that. 5b/5c's open items. At M = 4 the median is the mean of the two middle values, so a flipped attacker shifts it by an honest order-statistic gap (+0.095 nats). With M = 8 the honest 7 are spread over more order statistics, so the attacker's displacement of the median should be smaller. A trimmed mean (drop the lowest and highest value per coordinate, new `aggregate="trimmed"`; at M = 4 it equals the median, so it is only informative from M = 8) keeps more honest data (6 of 8 values).
- Design (`experiments/gpt_trimmed_m8/trimmed_m8.py`): 5c setup (3d model, H = 16, inner lr 2e-3, plain outer step, 3,840 steps, seeds 0 to 2) with M = 8 workers. Arms: mean without attack (baseline), median without attack, median and trimmed mean with worker 0 sending -10x its delta. 12 runs.
- **H5e-i (duplicates 5d):** median under the flip costs less at M = 8 than the +0.095 at M = 4: mean excess over the M = 8 mean baseline below 0.06. Refuted otherwise.
- **H5e-ii:** the trimmed mean under the flip is within 0.02 nats of the median under the flip (mean over seeds), i.e. keeping more honest values buys little at this scale. Refuted if they differ by more than 0.02.
- **H5e-iii (duplicates 5d):** median without attack is within 0.02 nats of the mean (5a saw +0.003 at M = 4). Refuted otherwise.
- Prior: i 60%, ii 55%, iii 70%.
- Limits known in advance: 3 seeds; one attacker of eight; the M = 8 baseline is a new run (not the 3d M = 4 runs), since M changes the effective batch.

### Outcome of 5e (`experiments/gpt_trimmed_m8/`: `trimmed_m8.py`, `trimmed_m8.jsonl`, `trimmed_m8_results.txt`, `run.out`; 12 runs, seeds 0 to 2, about 17 minutes each)
- Final validation loss. M = 8 mean, no attack: 1.5527 (1.5551, 1.5447, 1.5581). Excess over it: median, no attack +0.0007 (+0.0019, +0.0083, -0.0081); median under the -10x flip +0.0207 (+0.0161, +0.0294, +0.0164); trimmed mean under the flip +0.0262 (+0.0256, +0.0341, +0.0190).
- **H5e-i holds:** the median's flip cost is +0.021 at M = 8 against +0.095 at M = 4 (bar 0.06). **H5e-ii holds:** trimmed minus median under the flip is +0.0055 (bar 0.02); the trimmed mean is not better, it is nominally worse on all 3 seeds. **H5e-iii holds:** +0.0007 (bar 0.02), and the sign changes across seeds, so it is noise.
- Reading: the cost of one sign-flip attacker to the median falls by about 4.6x when workers double, consistent with the order-statistic account (the attacker displaces the median by less when honest values are denser), but M is the only thing varied, so the 1/M scaling is not established from two points. Keeping 6 of 8 values (trimmed mean) buys nothing over the median here. Both are far below the mean's failure (+9e4 at M = 4).
- Limits: 3 seeds; paired differences of about 0.005 are within seed spread; the M = 8 baseline is a new run set, not 3d; the displacement itself was not measured.
- Next: M = 16 (would test the scaling), and measuring the aggregated-delta shift directly.

## 2026-10-26 · Milestone 5c: is the median's +0.095 under sign-flip due to the flipped sign, or to any extreme attacker? (planned before running)
- Why: 5b's "Next" items (M = 8, trimmed mean) are bigger; first a cheap test of 5b's untested mechanism. At M = 4 the median is the mean of the two middle values. A flipped (negative) attacker sits below the honest values on most coordinates, so the median is the mean of the honest 1st and 2nd order statistics, below the honest median: a systematic shrink. An attacker sending +10x its delta sits above, so the median is the mean of the honest 2nd and 3rd: a systematic stretch. A zero-sending attacker sits near the middle of the honest values.
- Design (`experiments/gpt_median_mechanism/median_mechanism.py`): 5b exactly (3d model, M = 4, H = 16, inner lr 2e-3, plain outer step, 3,840 steps, seeds 0 to 2), median aggregation, worker 0 sends 10x or 0x its delta. 6 runs, about 12 minutes each.
- **H5c-i:** the +10x attacker costs less than the sign-flip's +0.095, by more than 0.05 nats on average (so the cost is sign-related, not size-related). Refuted if the +10x excess is within 0.05 of +0.095.
- **H5c-ii:** the 0x attacker costs less than +0.05 nats on average over 3d uncompressed (zeros sit inside the honest spread).
- Prior: i 60% (a stretch could also hurt, via larger steps), ii 65%.
- Limits: 3 seeds; no direct measure of the order-statistic shift; 5b's loss excess is the only readout.

### Outcome of 5c (`experiments/gpt_median_mechanism/`: `median_mechanism.py`, `.jsonl`, `_results.txt`, `run.out`; 6 runs, seeds 0 to 2, about 7.5 minutes each)
- Median aggregation, excess over the 3d uncompressed mean 1.5758: attacker sends 10x its delta 1.5905 (excess +0.0148, +0.0101, +0.0192; mean +0.0147); attacker sends zeros 1.5989 (+0.0234, +0.0188, +0.0270; mean +0.0231). For comparison 5b's sign-flip x10 cost +0.095 on every seed and 5a's no-attack median +0.003.
- **H5c-i supported.** The +10x attacker costs +0.015 against the sign-flip's +0.095, a difference of 0.080 (bar 0.05). The cost is tied to the attacker's sign relative to the honest workers, not to its size.
- **H5c-ii supported.** Zeros cost +0.023 (bar 0.05), though that is above the no-attack +0.003 on all three seeds, so a zero attacker is not free.
- Reading: consistent with the order-statistic account (a flipped attacker pulls the 4-worker median toward the honest low side, an amplified one toward the high side, with a smaller cost, perhaps because larger steps partly help), but the shift itself was not measured, so the mechanism stays a hypothesis that fits, not a proven one. 5b's +0.095 is a sign-flip effect.
- Limits: as planned; also the ordering "stretch costs less than shrink" is not explained.
- Next: unchanged from 5b (M = 8 with one attacker; a trimmed-mean aggregator), plus measuring the aggregated-delta norm directly to test the shrink account.

## 2026-10-26 · Milestone 5b: where does the mean break under a strong attacker, and does the median hold? (planned before running)
- Why: 5a's "Next". A 3-rms offset did nothing measurable, so neither the mean's breaking point nor the median's protection was tested. `experiments/gpt_median_attack_strong/median_attack_strong.py`: 5a's setup exactly (3d model, M = 4, H = 16, inner lr 2e-3, plain outer step, 3,840 steps, worker 0 attacks), aggregation in {mean, median} x attack in {offset 30 rms, offset 300 rms, sign-flip x10 (sends -10 x its delta)}; seeds 0 to 2 (18 runs). Comparator: 3d uncompressed on the same seeds. No engine change.
- **H5b-i:** with offset 300 rms, mean aggregation is worse than uncompressed by more than 0.3 nats on all 3 seeds (or diverges). Refuted if any seed is within 0.3.
- **H5b-ii:** with the sign-flip x10, mean aggregation is worse by more than 0.3 nats on all 3 seeds (the averaged delta is -1.75 x an honest delta, so it climbs). Refuted otherwise.
- **H5b-iii:** median aggregation stays within 0.05 nats of uncompressed (mean over seeds, no seed above 0.1) under all three attacks. The attacker is an extreme order statistic at M = 4, so the median is the mean of the honest 2nd and 3rd values and cannot leave the honest range. Refuted otherwise.
- **H5b-iv:** with offset 30 rms, mean aggregation is worse by more than 0.1 nats on all 3 seeds (the breaking point sits between 3 and 30 rms). Refuted otherwise.
- Prior: i 75% (adaptive inner AdamW may absorb a constant shift again, as in 5a, which is why I am unsure); ii 85%; iii 80%; iv 55%.
- Limits known in advance: 3 seeds; non-adaptive attacker; one attacker of four; one H; loss is not the variance factor of the proposal's H5, so the pi/2 cost is still untested.

### Outcome of 5b (`experiments/gpt_median_attack_strong/`: `median_attack_strong.py`, `.jsonl`, `_results.txt`, `run.out`; 18 runs, seeds 0 to 2)
- Final validation loss, mean over seeds (3d uncompressed 1.5758). Offset 30 rms: mean-agg 5.006 (per seed 6.51, 5.15, 3.36), median 1.5837 (+0.0079). Offset 300 rms: mean-agg diverges to inf on all 3 seeds, median 1.5837 (bit-identical to offset 30 on every seed). Sign-flip x10: mean-agg 90,415 (all seeds near 9e4), median 1.6708 (+0.095; per seed +0.092, +0.097, +0.096).
- **H5b-i holds** (inf on 3/3). **H5b-ii holds** (loss above 8e4). **H5b-iv holds** (+1.8 to +4.9 at 30 rms; the mean's breaking point lies between 3 rms, harmless in 5a, and 30 rms). **H5b-iii refuted:** the median is unmoved by the offsets (+0.008) but costs +0.095 nats, every seed, under the sign-flip, against my bar of 0.05.
- Reading: the median is invariant to how large an extreme outlier is (offsets 30 and 300 give identical runs), so it protects against any magnitude, which the mean cannot. But an attacker that flips sign is not harmless to it: at M = 4 the median is the mean of the two middle values, and a flipped coordinate sits on one side of the honest ones, so the median moves from the honest middle pair toward the honest values on the attacker's far side. This is the likely cause of the steady +0.095, not tested (a check would compare against a median over the three honest workers). The cost is small next to the mean's failure, but it is not zero and it is not the 5a noise level.
- Limits: 3 seeds; non-adaptive attacker; one attacker of four; one H; loss is not the variance factor, so the proposal's pi/2 cost is still untested; the mechanism for +0.095 is a hypothesis.
- Next: the same attacks with M = 8 and one attacker (does the median's cost shrink as the attacker's share falls?), and a trimmed-mean aggregator for comparison.

## 2026-10-26 · Milestone 4e (independent replication, levels-based quantiser; a parallel run landed `gpt_quant` first): what does unbiased stochastic quantisation of the deltas cost, with and without error feedback? (planned before running)
- Why: 4d's "Next". Sparsification is mapped (4a to 4d); the proposal's compression axis also lists quantisation. New compressor `quantise(levels)` (per-tensor max-abs scale, stochastic rounding, unbiased; `levels` 7 is a signed 4-bit code, 1 is ternary).
- Design (`experiments/gpt_quantise/quantise.py`): 4c's setup exactly (3d model, 3,840 steps, `M = 4`, lr 2e-3, `H = 16`, plain outer step); arms q7, q1, q1 + error feedback; seeds 0 to 2 (9 runs). Comparator: uncompressed (3d).
- **H4e-i:** q7 is within 0.02 nats of uncompressed on all 3 seeds. Refuted if any seed exceeds +0.02.
- **H4e-ii:** q1 (no EF) has mean excess above +0.02. Refuted otherwise.
- **H4e-iii:** error feedback does not reduce q1's mean excess (the quantiser is unbiased, so residuals add variance rather than fix bias). Refuted if EF lowers the mean by more than 0.01.
- Prior: i yes (variance of 4-bit rounding is tiny); ii a coin flip; iii likely holds.
- Limits: 3 seeds, one `H`, per-tensor scale, bytes not modelled.

### Outcome of 4e (`experiments/gpt_quantise/quantise_results.txt`; 9 runs, seeds 0 to 2)
- Mean final validation loss, excess over uncompressed (1.5758), nats: q7 (4-bit code) -0.0052 (per seed -0.008, -0.010, +0.002); q1 (ternary) +0.0191 (+0.012, +0.023, +0.022); q1 with error feedback +0.881 (+0.85, +0.91, +0.89).
- **H4e-i supported:** q7 is within 0.02 of uncompressed on every seed (largest +0.0018). **H4e-ii refuted, narrowly:** q1's mean excess is +0.0191, under the +0.02 line, though two of three seeds are above it. **H4e-iii supported, strongly:** error feedback did not help the unbiased quantiser, it made it far worse.
- Reading: unbiased stochastic quantisation is nearly free at 4 bits and costs about 0.02 nats at ternary, a much gentler price than top-k at the same nominal compression. Error feedback on top of an unbiased quantiser is harmful here. I did not test why; one candidate is that the residual keeps absorbing rounding noise that is then fed back at full scale, but that is a guess, not a result. Do not read this as a statement about error feedback for biased compressors (4b to 4d, where it helped).
- Limits: 3 seeds, one `H`, per-tensor max-abs scale, a single EF-ternary configuration, bytes not modelled. `tests/test_lowcomm.py` (the superseded numpy-model suite, 7 tests referencing `lowcomm.model.Config`) was deleted 2026-10-26; `tests/test_harness.py` covers the torch harness.
- Next: H5 (median aggregation under an attack), and whether EF with a damped residual rescues ternary.


## 2026-10-26 · Milestone 5a: does median aggregation of worker deltas pay on the real GPT, with and without one attacker? (planned before running)
- Why: H5 in the proposal (robust aggregation) has only had the closed-form `robust-outer` result (median costs about pi/2 in variance). Nothing yet on the real transformer. 4e (quantisation, PR 10664) is another run's; this step is independent of it.
- Engine change: `DiLoCo(aggregate="median", attack=fn)`; coordinate-wise median of the workers' deltas (mean of the two middle values at M = 4), and an attack hook replacing worker j's delta. Test: `test_median_aggregate_and_attack`.
- Design (`experiments/gpt_median_attack/median_attack.py`): 3d setup (M = 4, H = 16, inner lr 2e-3, plain outer step, 3,840 steps); aggregation in {mean, median} x offset a in {0, 3}; attacker is worker 0, adding a x rms(its own per-tensor delta) to every coordinate; seeds 0 to 2 (12 runs). Comparator: 3d uncompressed on the same seeds.
- **H5a-i:** with no attacker, median aggregation has a higher final loss than mean on all 3 seeds. Refuted if any seed has median at or below mean.
- **H5a-ii:** with a = 3, median beats mean on all 3 seeds. Refuted if mean wins any seed.
- Prior: i yes (small, under 0.03 nats); ii yes (the offset adds 3 x rms / 4 to every coordinate of the averaged delta, a large drift, while the median moves by about half that at most... so ii is likely but the margin is unknown).
- Limits: 3 seeds, one attack shape and size, one `H`, M = 4 with one attacker (25%), attacker does not adapt, bytes not modelled; the loss cost is not the variance factor of the proposal's H5, so this does not test pi/2 directly.

### Outcome of 5a (`experiments/gpt_median_attack/median_attack_results.txt`; 12 runs, seeds 0 to 2)
- Final validation loss, mean over seeds (3d uncompressed 1.5758). Offset 0: mean-agg 1.5758 (bit-identical to 3d, a determinism check), median 1.5785 (excess +0.0027; per seed +0.0165, -0.0089, +0.0003). Offset 3 rms: mean-agg 1.5730 (excess -0.0028; +0.0095, -0.0104, -0.0075), median 1.5787 (+0.0029; +0.0041, -0.0002, +0.0048).
- **H5a-i refuted:** median is better than mean on seed 1 with no attacker (-0.0089), and the seed-2 difference (0.0003) is far below seed noise. **H5a-ii refuted:** with the attack, median beats mean on seed 0 only (by 0.0055); mean wins seeds 1 and 2 (by 0.010 and 0.012).
- Reading: this attack does nothing measurable to DiLoCo on this model. One of four workers adding 3 x rms(delta) to every coordinate shifts the averaged delta by 0.75 rms per coordinate, a constant shift that the inner AdamW steps in the next round absorb; losses stay within seed noise (seed spread is about 0.01) of the clean run, and the 0.003 differences between arms are not distinguishable from it. So no crossover appears at this attack size, and the median's cost on the real GPT is under the seed noise too. The proposal's H5 (cost near pi/2 in variance, a crossover past a threshold) is not tested here: the attack is too weak to reach a threshold, and loss is not variance.
- Limits: 3 seeds, one weak non-adaptive attack, one `H`, M = 4.
- Next: a stronger attack (offset 30 or 300 rms, and a sign-flip with scaling) to find where the mean breaks and whether the median then holds, before any claim about the crossover.

## 2026-10-26 · Milestone 4f: what do 3-bit and un-fed-back scaled sign cost? (planned before running)
- Why: 4e (#10664) measured 4-bit, 2-bit, 2-bit + EF and scaled sign + EF. It left two cells out: 3 bits, and scaled sign without EF (so EF's contribution at 1 bit is unmeasured). A parallel run of mine duplicated 4e's cells; its 4-bit, 2-bit and sign + EF numbers agree with 4e's within seed noise (4-bit -0.005, 2-bit +0.019 against +0.015, sign + EF -0.0067 identical per seed), which is a free replication.
- Design (`experiments/gpt_quant_extra/quant_extra.py`): 4e's setup and `quantize` exactly; cells `quantize(3)` and `quantize(1)`, both without EF; seeds 0 to 2 (6 runs).
- **H4f-i:** 3-bit is between 4-bit and 2-bit in mean excess. Refuted otherwise.
- **H4f-ii:** scaled sign without EF is worse than with EF by more than 0.02 nats in the mean. Refuted otherwise.
- Prior: i yes; ii yes (earlier replication run gave about 0.03).
- Limits: as 4e.

### Outcome of 4f (`experiments/gpt_quant_extra/quant_extra_results.txt`; 6 runs, seeds 0 to 2)
- Mean excess over uncompressed (1.5758), nats: 3-bit stochastic -0.0052 (per seed +0.004, -0.011, -0.008); scaled sign without EF +0.0221 (+0.022, +0.011, +0.033). With 4e: 4-bit -0.0044, 2-bit +0.0153, scaled sign with EF -0.0067.
- **H4f-i refuted, by noise:** 3-bit (-0.0052) is lower than 4-bit (-0.0044), so it is not between 4-bit and 2-bit; the gap is 0.001 against seed spread of about 0.01. Read it as 3-bit and 4-bit being indistinguishable from uncompressed. **H4f-ii holds:** EF buys 0.029 nats at 1 bit (+0.022 without, -0.007 with).
- Reading: for unbiased stochastic quantisation the loss is flat down to 3 bits (about 10x fewer bytes than float32 before the scale) and first shows at 2 bits (+0.015); 1 bit needs EF to be free, and 2 bits with EF is catastrophic in 4e (+0.87), so EF is not a free add-on for an unbiased quantiser. These are 3 seeds with effects at the seed-noise level for 3 and 4 bits.
- Limits: as 4e. The 4e runs and these use the same seeds but not the same quantiser random stream per cell, so cells differ by sampling noise.
- Next: H5, median aggregation under an attack.

## 2026-10-26 · Milestone 4g: does the 2-bit error-feedback residual grow, as the 4e guess says? (planned before running)
- Why: 4e found 2-bit stochastic + EF far worse (+0.87 nats) than 2-bit without EF (+0.015), and guessed that the coarse grid (levels -s, 0, s on the tensor max) makes the rounding error added to the residual outgrow what the next round can absorb. The residual norm was not logged. The engine now records, per round, sqrt(sum ||e||^2 / sum ||delta + e||^2) over workers and tensors (`DiLoCo.ef_norms`; no change to training).
- Design (`experiments/gpt_quant_ef_norm/ef_norm.py`): 4e's setup exactly, seed 0, two runs: 2-bit stochastic + EF and scaled sign + EF. Report the mean relative residual by quarter of training. The 2-bit run repeats a 4e run, so its final loss should be near 4e's seed 0 (2.453) up to the changed code path (none expected); that is a check on the logging.
- **H4g-i:** in the 2-bit EF run the relative residual exceeds 1 in the last quarter (the residual is larger than the update it rides on). Refuted otherwise.
- **H4g-ii:** in the 2-bit EF run the last-quarter mean is at least 2x the first-quarter mean (it grows). Refuted otherwise.
- **H4g-iii:** scaled sign + EF stays below 1 in every quarter (contractive). Refuted otherwise.
- Prior: i about 55%; ii about 50%; iii yes, about 90%.
- Limits: one seed, one H; the norm is aggregated over all tensors, so a single bad tensor could hide; correlation of norm and loss, not a causal test.

### Outcome of 4g (`experiments/gpt_quant_ef_norm/`: `ef_norm.py`, `ef_norm.jsonl`, `ef_norm_results.txt`; 2 runs, seed 0, 240 rounds)
- Relative residual norm ||e|| / ||delta + e|| by quarter of training: 2-bit stochastic + EF 1.049, 1.008, 1.004, 1.002 (max 1.357, round 1 1.162); scaled sign + EF 0.737, 0.665, 0.628, 0.629 (max 0.772). Final-round training loss 2.356 (2-bit EF) against 1.409 (sign EF); the validation loss is not logged here.
- **H4g-i holds, barely:** the last-quarter mean is 1.002, i.e. the residual is the size of the update, not clearly above it. **H4g-ii refuted:** it does not grow; it starts above 1 and settles at about 1.00. **H4g-iii holds:** sign + EF stays at 0.63 to 0.74 (contractive, as the theory for a biased contractive compressor says).
- Reading: the 4e guess ("the residual grows over rounds") is wrong as stated. The 2-bit stochastic quantiser here has only the levels -s, 0, s (L = 1), so its error is about as large as the input (relative error near 1, not below it), which is not contractive; EF then carries a residual as large as the update every round and the transmitted delta is mostly rounding noise. That the residual sits at 1.00 for the whole run is consistent with this but I did not test the cause (for example by logging the per-tensor error or a 3-bit EF run, where L = 3 should give a ratio below 1).
- Limits: one seed; the norm is pooled over tensors; a loss gap is shown only through the 4e runs, not re-measured here.
- Next: 3-bit and 4-bit + EF to see where the ratio crosses below 1 and whether EF then helps; then H5 (median aggregation under an attack).

## 2026-10-26 · Milestone 4e: what does quantising the worker deltas cost, and does error feedback rescue 2-bit and 1-bit? (planned before running)
- Why: 4a to 4d priced sparsification; the other standard compressor family is quantisation, the "Next" of every entry since 4a. Adds `quantize(bits)` to the engine (per-tensor uniform grid on [-max|x|, max|x|], stochastic rounding so it is unbiased; bits = 1 is the scaled sign mean|x| sign(x), biased), with a unit test of unbiasedness and the sign form.
- Design (`experiments/gpt_quant/quant.py`): 4d's setup exactly (3d model, 3,840 steps, `M = 4`, inner lr 2e-3, `H = 16`, plain outer step); cells: 4-bit stochastic, 2-bit stochastic, 2-bit stochastic + EF, scaled sign + EF; seeds 0 to 2 (12 runs). Comparator: uncompressed (3d). Bytes per delta coordinate are bits (plus one scale per tensor), against 32 uncompressed.
- **H4e-i:** 4-bit stochastic is within 0.02 nats of uncompressed on all 3 seeds (8x fewer bytes for free). Refuted if any seed exceeds +0.02.
- **H4e-ii:** scaled sign + EF (about 32x fewer bytes) is within 0.05 nats of uncompressed on mean. Refuted otherwise.
- **H4e-iii:** at 2 bits, EF lowers the loss on all 3 seeds relative to plain stochastic. Refuted if any seed rises (unbiased noise averages over M = 4 workers, so EF may not help).
- Prior: i yes; ii about 60% yes; iii uncertain, 50/50.
- Limits: 3 seeds, one `H`, per-tensor scale, bytes not modelled beyond bits per coordinate, one model size and corpus.

### Outcome of 4e (`experiments/gpt_quant/quant_results.txt`; 12 runs, seeds 0 to 2)
- Mean excess loss over uncompressed (1.5758), nats: 4-bit stochastic -0.0044 (per seed +0.003, -0.011, -0.005); 2-bit stochastic +0.0153 (+0.018, +0.010, +0.018); 2-bit stochastic + EF +0.865 (+0.88, +0.80, +0.92); scaled sign + EF -0.0067 (-0.001, -0.014, -0.005).
- **H4e-i held:** 4-bit is within 0.02 on every seed (8x fewer bytes per coordinate). **H4e-ii held, by a wide margin:** 1-bit scaled sign with EF matches uncompressed (32x fewer bits per coordinate, scales aside). **H4e-iii refuted, and not narrowly:** EF at 2 bits makes every seed far worse (+0.87 against +0.015 without it), so my 50/50 prior was too kind.
- Reading: the unbiased 2-bit quantiser is already cheap, so EF has little to repair, and adding it hurt a lot. Why is a guess I did not test: the stochastic grid is coarse (levels -s, 0, s on the tensor max), so the rounding error added to the residual is large and the residual may grow over rounds rather than cancel. Scaled sign + EF, whose error is contractive, does fine. The result is a single configuration of one compressor pair, not a general statement about EF with unbiased quantisers.
- Limits: 3 seeds, one `H`, per-tensor scale, one size and corpus; bits per coordinate only, no byte model; the 2-bit EF failure mechanism untested (residual norm was not logged); differences under about 0.01 are inside the seed spread.
- Next: log the residual norm in the 2-bit EF run to test the growth explanation, then H5 (median aggregation under an attack).

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-26 · Milestone 4d: where is the knee of error-feedback top-k between keep 1/16 and 1/256? (planned before running)
- Why: 4c's "Next". EF top-k cost -0.005 at 1/16, +0.043 at 1/64, +0.121 at 1/256; two points below the knee leave its location and shape unresolved.
- Design (`experiments/gpt_topk_ef_knee/topk_ef_knee.py`): 4c's setup exactly (3d model, 3,840 steps, `M = 4`, inner lr 2e-3, `H = 16`, plain outer step); EF top-k at keep 1/32 and 1/128; seeds 0 to 2 (6 runs). Comparators: uncompressed (3d), 4b at 1/16, 4c at 1/64 and 1/256.
- **H4d-i:** 1/32 is within 0.02 nats of uncompressed on all 3 seeds (knee lies between 1/32 and 1/64). Refuted if any seed exceeds +0.02.
- **H4d-ii:** mean excess is monotone non-decreasing in sparsity across 1/16, 1/32, 1/64, 1/128, 1/256. Refuted if any adjacent pair of means reverses.
- Prior: 1/32 sits at +0.01 to +0.03, so H4d-i is a coin flip; monotonicity should hold.
- Limits: 3 seeds, per-tensor top-k, one `H`, bytes not modelled.

### Outcome of 4d (`experiments/gpt_topk_ef_knee/topk_ef_knee_results.txt`; 6 runs, seeds 0 to 2)
- Mean excess loss over uncompressed (1.5758), nats, EF top-k: keep 1/32 +0.0111 (per seed +0.022, +0.007, +0.004); keep 1/128 +0.0764 (+0.079, +0.076, +0.074). With 4b and 4c the curve is 1/16 -0.005, 1/32 +0.011, 1/64 +0.043, 1/128 +0.076, 1/256 +0.121.
- **H4d-i refuted, narrowly:** seed 0 at 1/32 is +0.0224, over the +0.02 line (the other two seeds are well under). **H4d-ii supported:** the five means rise monotonically with sparsity.
- Reading: there is no sharp knee. The cost grows smoothly from about 1/16, roughly +0.03 per halving of the keep fraction between 1/32 and 1/128, then +0.045 from 1/128 to 1/256. 4c's "turns on sharply" was an artefact of having only two points. Seed spread at 1/32 (0.004 to 0.022) is as large as the effect, so the 1/32 mean is uncertain.
- Limits: 3 seeds, one `H`, per-tensor top-k, plain outer step, bytes not modelled.
- Next: quantisation, then H5 (median aggregation under an attack).

## 2026-10-25 · Milestone 4c: where does error feedback break at lower keep fractions? (planned before running)
- Why: 4b's "Next". EF top-k at keep 1/16 matched uncompressed (-0.005); find the keep fraction where it stops.
- Design (`experiments/gpt_topk_ef_low/topk_ef_low.py`): 4b's setup exactly; arm top-k + EF only (plain top-k is already worse at 1/16); keep in {1/64, 1/256}; seeds 0 to 2 (6 runs). Comparators: uncompressed (3d) and 4b's EF at 1/16.
- **H4c-i:** EF top-k at 1/64 is within 0.02 nats of uncompressed on all 3 seeds. Refuted if any seed exceeds +0.02.
- **H4c-ii:** at 1/256 the mean excess is above +0.02 (EF breaks there). Refuted if it stays under +0.02.
- Prior: residuals accumulate over the 16 inner steps' deltas, so 1/64 survives; 1/256 (about 1,600 coordinates of 413k per worker per round) likely degrades.
- Limits: 3 seeds, per-tensor top-k, one `H`, bytes not modelled.

### Outcome of 4c (`experiments/gpt_topk_ef_low/topk_ef_low_results.txt`; 6 runs, seeds 0 to 2)
- Mean excess loss over uncompressed (1.5758), nats, EF top-k: keep 1/64 +0.0433 (per seed +0.041, +0.037, +0.051); keep 1/256 +0.1211 (+0.123, +0.119, +0.122). 4b's keep 1/16 was -0.005.
- **H4c-i refuted:** every seed at 1/64 exceeds +0.02. **H4c-ii supported:** 1/256 is far above +0.02. My prior that 1/64 would survive was wrong; EF's free ride ends between 1/16 and 1/64 on this model.
- Reading: with EF the cost is about 0 down to 1/16, +0.043 at 1/64 and +0.121 at 1/256, i.e. it turns on sharply rather than growing smoothly. Only 2 points below the knee, so its location (between 1/16 and 1/64) and shape are not resolved; 1/32 would bracket it. For reference, unbiased rand-k at 1/16 costs +0.083 (4a), so EF top-k at 1/64 (4x sparser) is still cheaper than rand-k at 1/16.
- Limits: 3 seeds, one `H`, per-tensor top-k, plain outer step, bytes not modelled.
- Next: keep 1/32 to locate the knee, quantisation, then H5 (median aggregation under an attack).

## 2026-10-25 · Milestone 4b: does error feedback rescue biased top-k compression of the worker deltas on the real GPT? (planned before running)
- Why: 4a's "Next". 4a covered the unbiased rand-k family; the common practical compressor is biased top-k, usually paired with error feedback (Seide et al. 2014; Stich et al. 2018). This also adds the engine feature `DiLoCo(error_feedback=True)` (per-worker, per-tensor residual) and `top_k`, with a test that keep = 1 reproduces the uncompressed round.
- Design (`experiments/gpt_topk_ef/topk_ef.py`): 3d's model, data, budget (3,840 steps), `M = 4`, inner lr 2e-3, `H = 16`, plain outer step. Keep fraction p in {0.25, 0.0625}; arm in {top-k, top-k + error feedback}; seeds 0 to 2 (12 runs). Comparators: uncompressed (3d) and 4a's rand-k at the same p and seeds.
- **H4b-i:** top-k with error feedback is no worse than unbiased rand-k at the same p on all 3 seeds, at both p. Refuted if rand-k wins any seed in either cell.
- **H4b-ii:** error feedback lowers top-k's loss on all 3 seeds at p = 0.0625. Refuted if any seed rises.
- Prior: top-k with EF beats rand-k clearly (rand-k pays +0.017 and +0.083 in 4a); plain top-k without EF may be competitive at p = 0.25 because deltas are heavy-tailed, so H4b-ii is uncertain there.
- Limits: 3 seeds, per-tensor top-k, one `H`, one size and corpus, bytes not modelled (index overhead of sparse formats ignored).

### Outcome of 4b (`experiments/gpt_topk_ef/topk_ef_results.txt`; 12 runs, seeds 0 to 2)
- Mean loss (nats) vs uncompressed 1.5758: p = 0.25: rand-k 1.5933 (+0.017), top-k 1.5737 (-0.002), top-k + EF 1.5712 (-0.005). p = 0.0625: rand-k 1.6584 (+0.083), top-k 1.6397 (+0.064), top-k + EF 1.5711 (-0.005).
- **H4b-i supported:** top-k + EF beats rand-k on all 3 seeds at both p (by 0.015 to 0.028 at 0.25; 0.074 to 0.098 at 0.0625). **H4b-ii supported:** EF lowers top-k's loss on all 3 seeds at p = 0.0625 (by 0.061 to 0.073), and also at 0.25 (0.001 to 0.004).
- Reading: with error feedback, keeping 1/16 of each tensor's coordinates matches the uncompressed loss within seed noise (-0.005, all three seeds slightly below), while without it top-k pays +0.064. This is the opposite of 4a's picture for the unbiased family, where the 1/16 cost was 0.083. The slightly negative excesses (about 0.005, similar to the seed spread) are not evidence that compression helps: no test of that was planned.
- Limits: 3 seeds, 2 keep fractions, per-tensor top-k, one `H`, one size and corpus, plain outer step; bytes not modelled (sparse index overhead ignored), so "same loss at 16x fewer coordinates" is not yet "16x fewer bytes".
- Next: lower keep fractions (1/64, 1/256) to find where EF breaks, quantisation, then H5 (median aggregation under an attack).

## 2026-10-25 · Milestone 3h: is the DiLoCo-paper outer setting bad only because the inner lr is wrong for it? (planned before running)
- Why: 3g's "Next". At inner lr 2e-3 (tuned for plain averaging) outer (0.7, 0.9) cost +0.127 nats at `H = 16`. With Nesterov momentum 0.9 the effective outer step is up to 10x larger, so a lower inner lr, or a smaller outer lr, may recover it.
- Design (`experiments/gpt_outer_retune/retune.py`): 3d's model, data, budget (3,840 steps), `M = 4`, `H = 16`, seeds 0 to 2 (12 runs). Inner lr in {5e-4, 1e-3} x outer (lr, momentum) in {(0.7, 0.9), (0.3, 0.9)}. The comparison is plain averaging at its tuned 2e-3 (3d, 1.5758 mean). Cells are scored directly on the report seeds with no separate tuning seeds, which favours the momentum arms (best of 4 cells), so a null is conservative and a win would need re-confirming on fresh seeds.
- **H3h-i:** the best of the 4 cells is within 0.01 nats of plain@2e-3 (the paper's setting can be rescued by joint tuning). Refuted if every cell is worse by more than 0.01.
- **H3h-ii:** the best cell beats plain@2e-3 on all 3 seeds. Prior: unlikely (3g found no outer momentum gain).
- Limits: 4 cells, 3 seeds, `H = 16` only, one size and corpus.

### Outcome of 3h (`experiments/gpt_outer_retune/retune_results.txt`; 12 runs, seeds 0 to 2, `H = 16`)
- Mean loss (nats) vs plain@2e-3 1.5758: inner 5e-4 / outer (0.7, 0.9) 1.6253 (+0.050); 5e-4 / (0.3, 0.9) 1.6102 (+0.034); 1e-3 / (0.7, 0.9) 1.6356 (+0.060); 1e-3 / (0.3, 0.9) 1.6078 (+0.032). 3g's 2e-3 / (0.7, 0.9) was 1.7028 (+0.127). Every cell is worse than plain on all 3 seeds (paired diffs +0.025 to +0.077).
- **H3h-i refuted** (best cell +0.032, beyond the 0.01 tolerance). **H3h-ii refuted** (0 of 4 cells beat plain on any seed), as the prior said.
- Reading: joint tuning recovers about three quarters of the paper setting's gap (+0.127 to +0.032) mainly via a smaller outer lr and a lower inner lr, but momentum 0.9 still does not beat plain averaging on this 3,840-step, 413k-parameter run. The scored cells were chosen on the report seeds, which favours momentum, so the negative result is conservative. It closes the outer-momentum branch at this scale; whether it reopens at longer budgets (the paper's regime) is untested.
- Limits: 4 cells, 3 seeds, `H = 16` only, one size and corpus.
- Next: lengthen the budget (3,840 to about 15k steps) for plain vs (0.3, 0.9) at `H = 16`, to test the budget-dependence explanation.

## 2026-10-25 · Milestone 4a: does the excess loss from unbiased rand-k compression of the worker deltas grow linearly in 1+omega on the real GPT? (H3, planned before running)
- Why: milestone 4 (compression axis) has no GPT result yet; 3d to 3g covered H, lr and outer momentum. PR #10377 (joint inner-lr re-tune) is a different axis.
- Design (`experiments/gpt_compression/compression.py`): 3d's model, data, budget (3,840 steps), `M = 4`, inner lr 2e-3, `H = 16`, plain outer step (lr 1, no momentum). Each worker's per-tensor delta is passed through an unbiased rand-k sparsifier (keep fraction p in {0.5, 0.25, 0.125, 0.0625}; omega = 1/p - 1 = 1, 3, 7, 15) before averaging over the 4 workers. Seeds 0 to 2 (12 runs). The uncompressed row is 3d's `H = 16` at 2e-3. Error feedback is not used (unbiased compressors, as H3 is stated).
- **H3-GPT:** excess loss over uncompressed rises with 1+omega; linear fit R^2 >= 0.5 and log-log slope in [0.6, 1.4] (the H3 refutation rule, applied to 4 compressors; the slope needs positive excesses).
- Prior: averaging 4 workers divides the compression variance by 4 and the outer lr is 1 (not "small"), so I expect a clearly visible excess only at p = 0.0625; the curve may be convex rather than linear, so H3 may be refuted on the slope.
- Limits: 3 seeds, one compressor family, one `H`, one size and corpus, outer lr 1 (H3 is stated at small outer step), no quantisation or error-feedback compressors yet.

### Outcome of 4a (`experiments/gpt_compression/compression_results.txt`; 12 runs, seeds 0 to 2)
- Mean excess loss over uncompressed (1.5758), nats, by keep fraction p (1+omega = 1/p): p 0.5 (2) +0.0060; 0.25 (4) +0.0174; 0.125 (8) +0.0415; 0.0625 (16) +0.0826. Every seed is above uncompressed at every p except one seed at p 0.5 (+0.0003).
- **H3-GPT supported by the stated rule.** Linear fit excess = -0.0041 + 0.00547 (1+omega), R^2 0.999; log-log slope 1.26 (R^2 0.991), inside [0.6, 1.4]. My prior (convex, slope possibly outside) was wrong in direction: the curve is close to linear, with the slope in the upper part of the allowed range, so a mild convexity is not excluded.
- Reading: on this 413k-parameter GPT at `H = 16`, `M = 4`, each doubling of the compression variance costs roughly the same extra loss, about 0.005 nats per unit of 1+omega; keeping 1/4 of the coordinates costs 0.017 nats (about 1%), keeping 1/16 costs 0.083 (5%). Whether that price beats the 4x to 16x fewer bytes sent is a separate question (bytes against loss), not tested here.
- Limits: 3 seeds, one compressor family (random sparsification, no quantisation, no error feedback), one `H`, one outer step (lr 1), one size and corpus; the intercept is slightly negative, so the fit is a description over p in [1/16, 1/2], not a law.
- Next: quantisation and top-k with error feedback on the same grid, then H5 (median aggregation under an attack).

## 2026-10-25 · Milestone 3i: does the 3h negative result hold at the lr extremes and at H = 64, against plain at the same lr? (planned before running)
- Why: a second look at the "Next" of 3g, run in parallel with 3h (which landed first at `H = 16`, seeds 0 to 2, inner lr 5e-4 and 1e-3). This step adds `H = 64`, inner lr 4e-3 and plain comparators at the same lr. (0.7, 0.9) was +0.127 (`H = 16`) and +0.062 (`H = 64`) worse than plain at inner lr 2e-3.
- Design (`experiments/gpt_outer_retune_lr/retune_outer.py`): 3d's model, data, budget, `M = 4`. Outer (0.7, 0.9) Nesterov; inner lr in {1e-3, 4e-3}; `H` in {16, 64}; seeds 100, 101 (8 runs). Plain comparators are 3d's runs at the same lr, `H` and seed (`gpt_retune_all/retune.jsonl`). Only two seeds, because the plain runs at off-centre lrs exist only for seeds 100, 101.
- **H3i-i:** at inner lr 1e-3 or 4e-3, (0.7, 0.9) still loses to plain at the same lr on both seeds, at both `H`. Refuted if it wins on both seeds in any cell.
- **H3i-ii:** (0.7, 0.9) at its best inner lr is still worse than the best plain run at 2e-3 (3g's plain means: 1.5758 at `H = 16`, 1.5947 at `H = 64`; seeds differ, so descriptive only).
- Limits: 2 seeds, a 2-point lr grid, one size and corpus; descriptive.

### Outcome of 3i (`experiments/gpt_outer_retune_lr/retune_outer_results.txt`; 8 runs, seeds 100, 101)
- Mean loss, plain vs (0.7, 0.9) at the same inner lr: `H = 16`, lr 1e-3: 1.6054 vs 1.6345 (paired diffs +0.017, +0.042); lr 4e-3: 1.6646 vs 2.2637 (+0.616, +0.582). `H = 64`, lr 1e-3: 1.6219 vs 1.6405 (+0.013, +0.024); lr 4e-3: 1.6854 vs 1.9866 (+0.268, +0.335).
- **H3i-i supported:** (0.7, 0.9) is worse than plain on both seeds in all four cells. **H3i-ii supported:** its best cell (1.6345 at `H = 16`, 1.6405 at `H = 64`, lr 1e-3) is worse than plain at the same lr; seeds differ from 3g, so the comparison to 3g's 2e-3 plain means is descriptive only.
- Reading: lowering the inner lr shrinks the gap (+0.127 at 2e-3 in 3g, about +0.03 at 1e-3) but does not close it, and raising it makes it far worse. Within this grid, the paper's outer setting does not beat plain averaging at any inner lr, so the 3g result was not only a mis-tuned inner lr. The grid stops at 1e-3, so a still lower lr, which would move the gap further, is untested.
- Limits: 2 seeds, 2 lr points, one size and corpus, 3,840 steps (the DiLoCo paper trains far longer).
- Next: see 3h (lengthen the budget); this step only adds the H = 64 and lr 4e-3 cells.


## 2026-10-25 · Milestone 3g: does outer Nesterov momentum help on the real GPT, as 2g found on the 14k numpy model? (planned before running)
- Why: the "Next" of 3d, 3e and 3f. 2g (14k-parameter numpy model) found small outer momentum (0.1 to 0.3) lowered loss by 0.014 to 0.020 at `H = 64` and raised it at `H = 16`; 2g's own "Next" asked for a check on the transformer before any momentum claim.
- Design (`experiments/gpt_outer_momentum/momentum.py`): 3d's model, data, budget (3,840 steps), `M = 4`, inner lr 2e-3 (the shared pick). `H` in {16, 64}; outer (lr, Nesterov momentum) in {(1, 0.1), (1, 0.3), (0.7, 0.9) the DiLoCo paper's setting}; seeds 0 to 2 (18 runs). Plain rows are 3d's runs at 2e-3. Inner lr is not re-tuned per outer setting. Paired differences vs plain per seed; no multiplicity correction (6 cells).
- **H3g-i:** at `H = 64` momentum 0.1 or 0.3 lowers loss vs plain on all 3 seeds (2g's sign). Refuted if any seed rises.
- **H3g-ii:** at `H = 16` momentum 0.1 or 0.3 raises loss on all 3 seeds (2g's sign). Refuted otherwise.
- **H3g-iii:** the paper's (0.7, 0.9) is worse than plain at both `H` at this inner lr (prior from 2f, where 0.9 hurt).
- Limits: 3 seeds, one inner lr, one size and corpus, 6 cells reported unfiltered.

### Outcome of 3g (`experiments/gpt_outer_momentum/momentum_results.txt`; 18 runs, seeds 0 to 2, inner lr 2e-3, plain rows are 3d's)
- Mean loss (nats), plain / (1, 0.1) / (1, 0.3) / (0.7, 0.9): `H = 16` 1.5758 / 1.5730 / 1.5954 / 1.7028; `H = 64` 1.5947 / 1.5911 / 1.6017 / 1.6567. Paired differences from plain, per seed: `H = 16` momentum 0.1 -0.0003, -0.0115, +0.0035; 0.3 +0.018, +0.016, +0.024; paper setting +0.110, +0.094, +0.177. `H = 64` momentum 0.1 -0.0008, -0.0101, +0.0001; 0.3 +0.011, -0.008, +0.019; paper setting +0.047, +0.034, +0.105.
- **H3g-i refuted.** At `H = 64` momentum 0.3 raises the loss on 2 of 3 seeds (mean +0.007) and 0.1 is flat (mean -0.004, one seed +0.0001); 2g's gain at `H = 64` does not carry over to the transformer. **H3g-ii refuted as stated:** 0.3 hurts at `H = 16` on all seeds (+0.020), but 0.1 is indistinguishable from plain (mean -0.003, mixed signs). **H3g-iii supported:** the DiLoCo paper's (0.7, 0.9) is much worse than plain at both `H` (+0.127 at `H = 16`, +0.062 at `H = 64`) at this inner lr, which was tuned for plain averaging.
- Reading: on this 413k-parameter GPT no outer momentum setting tried beats plain averaging by more than seed noise; the numpy model's small-momentum gain at long `H` is not reproduced. The paper's setting being worst here is a statement about this tuning (inner lr fixed, 3,840 steps, `M = 4`), not about DiLoCo at its scale: the paper tunes the outer optimiser jointly with much longer runs.
- Limits: 3 seeds, one inner lr not re-tuned per outer setting, one size and corpus; the paired signs are descriptive, with no multiplicity correction over 6 cells.
- Next: a joint (inner lr, outer lr) re-tune for the paper setting, to separate "momentum does not help" from "the inner lr is wrong for it".

## 2026-10-25 · Milestone 3f: is synchronous AdamW under-tuned against H=16? A finer lr grid for both (planned before running)
- Why: 3e's "Next". `H=16` beats sync by 0.012 nats over 11 seeds at a shared lr of 2e-3 from a 3-point grid {1e-3, 2e-3, 4e-3}. 3d's tuning means for sync were 1.5893 (2e-3) and 1.5919 (1e-3) against 1.6e+ at 4e-3, so the optimum may lie between grid points, and the two methods may peak at different lrs.
- Design (`experiments/gpt_fine_lr/fine.py`): 3d's model, data, budget (3,840 steps), `M = 4`. Add lr 1.4e-3 and 2.8e-3 for sync and `H=16` (16 tuning runs on seeds 100, 101 pooled with 3d's, then the same lrs on seeds 0 to 2: 20 new runs in all). Each method's pick is the lowest mean tuning loss over {1e-3, 1.4e-3, 2e-3, 2.8e-3, 4e-3} on seeds 100, 101 only; the report is the paired gap at each method's own pick on seeds 0 to 2.
- **H3f-i:** sync's tuned lr changes from 2e-3 and sync improves by more than 0.003 nats on seeds 0 to 2 (under-tuning confirmed). Refuted otherwise.
- **H3f-ii:** `H=16` still beats sync at own picks (mean paired gap < 0 on seeds 0 to 2). Refuted if the gap is >= 0.
- Prior: sync's optimum is flat between 1e-3 and 2e-3, so H3f-i is unlikely; H3f-ii likely holds but with a smaller gap.
- Limits: 2 tuning seeds, 3 report seeds (the 11-seed result of 3e stands for the 2e-3 shared pick), one size and corpus.

### Outcome of 3f (`experiments/gpt_fine_lr/fine_results.txt`; 20 new runs, tuning seeds 100, 101, report seeds 0 to 2)
- Tuning means (nats). Sync: 1e-3 1.5919, 1.4e-3 1.5951, 2e-3 1.5893, 2.8e-3 1.5941, 4e-3 1.6395. `H=16`: 1e-3 1.6054, 1.4e-3 1.5883, 2e-3 1.5784, 2.8e-3 1.6160, 4e-3 1.6646. Both pick 2e-3, the same as 3d, and the finer points on either side are worse for both.
- **H3f-i refuted.** Sync's lr does not move, so it does not improve (my prior, flat between 1e-3 and 2e-3, was right in that no finer point beat 2e-3). **H3f-ii supported.** At own picks the paired gap `H=16` minus sync on seeds 0 to 2 is -0.0139 (per seed -0.008, -0.015, -0.018), identical to 3d because the picks are unchanged.
- Reading: the 3e result (`H=16` about 0.012 nats better than sync) is not an artefact of sync's coarse lr grid. Sync's optimum is a narrow-ish basin at 2e-3 (+0.005 at either neighbour) and `H=16` is sharper (+0.010 at 1.4e-3, +0.038 at 2.8e-3).
- Limits: 2 tuning seeds, one size and corpus, plain averaging, no outer momentum, no weight-decay or warmup tuning for sync.
- Next: outer momentum on this model (2g's grid).

## 2026-10-25 · Milestone 3e: is 3d's "H=16 beats synchronous AdamW" sign real with 11 seeds? (planned before running)
- Why: 3d's "Next". At 3,840 steps and a shared lr 2e-3, `H=16` was 0.014 nats below synchronous on 3 seeds, which could be seed noise. If it is real, local steps help on this model; if not, the honest reading is "no measurable cost up to `H=16`".
- Design (`experiments/gpt_seeds/seeds.py`): identical model, data, budget and lr (2e-3) as 3d; sync and `H=16` on seeds 3 to 10 (16 new runs), pooled with 3d's seeds 0 to 2 for 11 paired seeds. Paired difference `H=16` minus sync, t interval, paired t and Wilcoxon tests. Nothing else varied.
- **H3e-i:** the pooled mean gap is negative with a 95% interval excluding 0. Refuted if the interval includes 0.
- **H3e-ii:** `H=16` is better than sync on at least 8 of 11 seeds.
- Prior: I expect the gap to shrink toward 0 (regression to the mean on a 3-seed estimate); H3e-i is less likely than not.
- Limits: one lr (shared pick, not re-tuned per `H`), one size and corpus, plain averaging.

### Outcome of 3e (`experiments/gpt_seeds/seeds_results.txt`; 16 new runs, seeds 3 to 10, pooled with 3d's seeds 0 to 2)
- Means over 11 seeds: sync 1.5931, `H=16` 1.5810. Paired gap `H=16` minus sync: **-0.0121 nats** (sd 0.0129, 95% t interval [-0.0208, -0.0035]); `H=16` better on 10 of 11 seeds; paired t p = 0.011, Wilcoxon p = 0.014.
- **H3e-i supported** (interval excludes 0). **H3e-ii supported** (10 of 11 >= 8). My prior (regression to zero) was wrong: the gap barely moved from 3d's -0.014.
- Reading: on this 413k-parameter GPT at this budget, `M = 4` workers averaging every 16 steps with a shared lr of 2e-3 is slightly *better* than synchronous AdamW on the same samples, by about 0.8% of the loss. Plausible mechanism (untested here): local steps act as a larger effective batch/lr smoothing; the lr grid is coarse and shared, and sync may be under-tuned relative to `H=16`, so this is "no cost, small gain under this tuning", not a proven gain of DiLoCo.
- Limits: one lr, 3-point grid chosen on two seeds, one size and corpus, plain averaging; the pooled seeds 0 to 2 were the ones that motivated the test (mild selection effect: the 8 new seeds alone give a gap of -0.0115, so the result does not rest on seeds 0 to 2).
- Next: a finer per-method lr grid for sync (to rule out under-tuned sync), then outer momentum on this model (2g's grid).


## 2026-10-25 · Milestone 3d: does a fair re-tune of every method, sync and `H=4` included, keep 3c's picture? (planned before running)
- Why: 3b's "Next". `H=64` beat `H=16` by 0.017 nats, probably because `H=16` kept 3a's 960-step pick (3e-3) while 3,840 steps may prefer a lower lr.
- Design (`experiments/gpt_retune_all/retune.py`; 3c, landed in parallel as PR #10293, tuned only `H=16` and `H=64` on {3e-4, 1e-3, 3e-3}): 3b's model, data, `M = 4`, batch 16, 3,840 inner steps, plain averaging. Inner lr in {1e-3, 2e-3, 4e-3} for `H` in {sync, 4, 16, 64}, picked on tuning seeds 100, 101 (mean validation loss), then reported on seeds 0 to 2 at the picks (3b's runs reused where the pick equals 3b's lr). Sync is re-tuned too, so no method keeps a stale pick.
- **H3d-i:** after re-tuning, `H=16` is no worse than `H=64` in the means (the 3b ordering reversal disappears). Refuted if `H=64` is still better by more than 0.01.
- **H3d-ii:** the re-tuned gap to sync at `H=16` is under 0.034 (3b's). Refuted otherwise.
- **H3d-iii:** picked lr is non-increasing in `H` (3a's suggestive finding). Edge picks reported.
- Limits: 3-point grid, 2 tuning seeds, one size and corpus.

### Outcome of 3d (`experiments/gpt_retune_all/retune_results.txt`; tuning seeds 100, 101, lr grid {1e-3, 2e-3, 4e-3}, 24 runs; then seeds 0 to 2)
- Every `H` picked 2e-3 (tuning means: sync 1.5893, `H=4` 1.5813, `H=16` 1.5784, `H=64` 1.5955), so the pick is the grid middle, not an edge, but the same for all.
- Reported means (sd), nats: sync 1.5897 (0.0097); `H=4` 1.5825 (0.0038); `H=16` 1.5758 (0.0064); `H=64` 1.5947 (0.0094). Paired gaps to sync: `H=4` -0.007 (sd 0.013), `H=16` -0.014 (sd 0.005), `H=64` +0.005 (sd 0.003). `H=64` minus `H=16`: +0.019 (sd 0.003).
- **H3d-i supported.** `H=16` is better than `H=64` by 0.019 (every seed), so 3b's reversal was a learning-rate artefact, not a real non-monotonicity.
- **H3d-ii supported, more strongly than predicted.** The re-tuned `H=16` gap is -0.014: slightly *better* than synchronous AdamW at the same sample count, consistent in sign across the 3 seeds. With 3 seeds this is suggestive, not established; `H=4` is indistinguishable from sync.
- **H3d-iii uninformative.** All picks equal (2e-3); the grid cannot show a trend in `H`, so 3a's "non-increasing" reading is neither confirmed nor refuted here.
- Reading: most of 3b's remaining gap came from stale learning rates (sync at 1e-3 scored 1.5994, at 2e-3 1.5897). With a lr tuned at the real budget, local steps up to `H=16` cost nothing measurable on this model and `H=64` costs about 0.005 nats.
- Limits: 3 seeds, 3-point grid with one shared pick (a finer or per-H grid could move the ranking; `H=16` beating sync may be a tuning-noise effect), one size and corpus, plain averaging only.
- Next: outer momentum on this model (2g's grid), more seeds for the `H=16` versus sync sign, and a per-`H` finer lr grid.


## 2026-10-25 · Milestone 3c: is 3b's H = 16 vs H = 64 inversion an lr artefact? (planned before running)
- Why: 3b's "Next". 3b reused 3a's inner lrs, tuned at 960 steps (H=16: 3e-3, H=64: 1e-3). The inversion (H=64 beat H=16 by 0.017) probably comes from the H=16 lr being too high at 3,840 steps.
- Design (`experiments/gpt_retune/retune.py`): 3b's model, data, M = 4, batch 16, 3,840 inner steps, plain averaging. Tune lr in {3e-4, 1e-3, 3e-3} for H in {16, 64} on seeds 100, 101 (mean validation loss), then report the picks on seeds 0 to 2 (3b's seeds), paired with 3b's synchronous runs.
- **H3c-i:** the tuned H=16 lr is below 3e-3 (the 3a pick) and the H=16 gap to sync shrinks below 3b's 0.034. Refuted otherwise.
- **H3c-ii:** after re-tuning, H=16 is no worse than H=64 in the means (the 3b ordering inversion goes away). Refuted if H=64 is still better.
- Limits: 3 lr points only, 2 tuning seeds, sync/H=4 not re-tuned (sync stays at 3a's pick), one size and corpus.

### Outcome of 3c (`experiments/gpt_retune/retune.jsonl`, `report.out`; seeds 100, 101 to tune, 0 to 2 to report; about 11 minutes per run)
- Tuning (mean validation loss, nats): H=16: 3e-4 1.7837, 1e-3 1.6054, 3e-3 1.6109. H=64: 3e-4 1.7826, 1e-3 1.6219, 3e-3 1.6514. Picks: 1e-3 for both (3e-4 is far worse; 3e-3 is the grid's upper edge and, for H=16, within 0.006 of the pick).
- Report, seeds 0 to 2: H=16 at 1e-3 gives 1.5974, 1.5998, 1.5948 (mean 1.5973); 3b's sync gives 1.6002, 1.6012, 1.5970 (mean 1.5994). Paired gap to sync: -0.003, -0.001, -0.002 (mean -0.002). H=64 at 1e-3 reproduces 3b exactly (1.6071, 1.6230, 1.6191; runs are deterministic per seed), gap +0.017.
- **H3c-i supported.** The tuned H=16 lr is 1e-3, below 3e-3, and the gap to sync falls from +0.034 to -0.002, within noise of zero.
- **H3c-ii supported.** H=16 (1.5973) is better than H=64 (1.6164) by 0.019; the ordering inversion in 3b was a stale learning rate.
- Reading: at 3,840 steps with a tuned inner lr, H=16 matches synchronous AdamW on this 413k-parameter GPT (4 workers, plain averaging), and the cost of local steps appears at H=64 (about 0.02 nats). Part of 3a's 0.14 gap was budget, the rest of 3b's was lr.
- Limits: sync and H=4 were not re-tuned (sync could also gain from a tuned lr, which would reopen a small gap); 3 lr points, 2 tuning seeds, 3 report seeds; one size and corpus. H=16 at 3e-3 scored within 0.005 of 1e-3 on the tuning seeds, so the lr surface is flat there and the pick is not sharp.
- Next: tune sync and H=4 on the same grid for a fair comparison, then the outer-momentum grid of 2g on this model.

## 2026-10-25 · Milestone 3b: does the 3a gap to synchronous AdamW shrink with a 4x longer budget? (planned before running)
- Why: 3a's "Next". At 960 steps sync may still be improving; the 0.14 nat gap at `H = 16` could be a short-budget artefact.
- Design (`experiments/gpt_long_budget/long_budget.py`): 3a's model, data, `M = 4`, batch 16, plain averaging; 3,840 inner steps per worker; `H` in {sync, 4, 16, 64}; inner lr fixed at 3a's picks (1e-3, 1e-3, 3e-3, 1e-3), no re-tuning (a longer run may prefer a different lr, so gaps are if anything biased against the picks of whichever method it suits least); seeds 0 to 2; same 16 validation batches.
- **H3b-i:** the gap to sync at `H = 16` shrinks in nats relative to 3a (0.139): the 3b gap is below 0.139 minus 1 paired sd of 3a (0.050), i.e. under 0.089. Refuted otherwise.
- **H3b-ii:** the ordering sync < 4 < 16 <= 64 holds in the means.
- Limits: 3 seeds, no re-tuned lr, one size and corpus; a 4x budget is still tiny against real pretraining.

### Outcome of 3b (`experiments/gpt_long_budget/long_budget_results.txt`; about 13 minutes per run, seeds 0 to 2, validation loss in nats, 3a's inner lr picks, no re-tuning)
- Mean (sd): sync 1.5994 (0.0022); `H=4` 1.6033 (0.0061); `H=16` 1.6338 (0.0109); `H=64` 1.6164 (0.0083). Gaps to sync, paired by seed: +0.004 (sd 0.004), +0.034 (sd 0.012), +0.017 (sd 0.009).
- **H3b-i supported.** The `H=16` gap is 0.034, against 0.139 at 960 steps and the 0.089 threshold. A 4x longer budget cut it about 4x, so most of 3a's gap was a short-budget effect.
- **H3b-ii refuted.** `H=64` (1.616) is below `H=16` (1.634) by 0.017, about 1.5 of the larger sd. Probably 3a's flat-optimum problem (the `H=16` pick of 3e-3 may be too high at 3,840 steps, while 1e-3 was picked for `H=64`), not a real non-monotonicity. Not tested.
- Reading: at 3,840 steps `H=4` is indistinguishable from synchronous AdamW and local steps cost under 0.04 nats up to `H=64`. This agrees with the numpy 2e finding (cost appears only at large `H`) and revises 3a's reading that it shows at small `H` on the transformer.
- Limits: 3 seeds, lr not re-tuned for the longer budget (the `H=16` cell is the likely casualty), one size, one corpus, 4x is still tiny; `H=1` and `H=240` not rerun.
- Next: re-tune the inner lr at 3,840 steps for `H=16` and 64 (tuning seeds 100, 101), then the outer-momentum grid of 2g on this model.

## 2026-10-25 · Milestone 3a: does the H curve of 2e survive on the 413k-parameter GPT? (planned before running)
- Why: 2g's "Next". Everything since 2a is on a 14k-parameter numpy model; the claims (cost of local steps appears at large `H` only; tuned inner lr non-increasing in `H`) need the real transformer of Milestone 1 before they are cited.
- Design (`experiments/gpt_h_sweep/h_sweep.py`): 2-layer, 128-wide char GPT on Tiny Shakespeare, `M = 4` workers, batch 16 per worker, 960 inner steps per worker (3,840 batches for every method), plain-averaging outer step (lr 1, no momentum), `H` in {sync, 1, 4, 16, 64, 240}; sync is one worker with batch 64. Inner lr in {1e-3, 3e-3, 1e-2} picked on tuning seeds 100, 101 (mean validation loss), then reported on seeds 0, 1, 2 (16 fixed validation batches of 32). Same selection split as 2e.
- **H3a-i:** `H <= 16` is within 2 sd of synchronous AdamW; refuted if any of `H` = 1, 4, 16 is more than 2 sd (larger of the two seed sds) away.
- **H3a-ii:** `H = 240` is worse than synchronous by more than 2 sd; refuted otherwise.
- **H3a-iii:** the picked inner lr is non-increasing in `H`. Recorded as suggestive; 3-point grid, edge picks reported.
- Limits: one model size, one corpus, 960 steps (sync is probably still improving), three report seeds so a 2-sd rule is weak, lr grid of three.

### Outcome of 3a (`experiments/gpt_h_sweep/h_sweep_results.txt`; about 75 minutes on 4 cores; seeds 0 to 2, validation loss in nats)
- Deviation from the plan: the first tuning pass (lr 1e-3, 3e-3, 1e-2) picked the grid's lower edge for four of six methods, so 3e-4 was added and the 12 new tuning runs done before any reporting. 3e-4 loses everywhere (2.07 to 2.22), so the picks are interior. Picks: sync 1e-3; `H` = 1, 4, 16, 64, 240: 3e-3, 1e-3, 3e-3, 1e-3, 1e-3. 1e-3 and 3e-3 are within 0.03 of each other for every method, so the picks are not sharp.
- Report loss (mean, sd over 3 seeds): sync 1.798 (0.013); `H=1` 1.845 (0.041); `H=4` 1.877 (0.002); `H=16` 1.936 (0.054); `H=64` 1.938 (0.008); `H=240` 1.953 (0.008). Differences from sync: +0.047, +0.079, +0.139, +0.141, +0.155.
- **H3a-i refuted.** `H=4` is +0.079 above sync against a 2 sd bound of 0.027 (paired sd 0.014), and `H=16` is +0.139 (bound 0.108, paired sd 0.050). Only `H=1` is inside, and only because its own sd is 0.041. This differs from 2e (numpy, 14k parameters), where `H <= 16` was within 2 sd.
- **H3a-ii supported.** `H=240` is +0.155 (bound 0.027).
- **H3a-iii not supported.** Picks 3e-3, 1e-3, 3e-3, 1e-3, 1e-3 are not monotone, but the 1e-3 and 3e-3 tuning losses differ by less than the seed noise for `H` = 1 to 16, so this is a statement about a flat optimum, not a reversal.
- Reading: on the real transformer the cost of local steps shows at small `H` already and mostly accrues by `H = 16` (+0.14), then flattens (`H = 240` adds only 0.015 over `H = 64`). That shape (a steep early rise then a plateau) differs from 2e's near-linear-in-log-H rise, and the total gap, 0.15 nats, is 2.5 times the numpy gap of 0.06. Both runs share a confound: `M = 4` averaged batches of 16 are compared with one worker at batch 64, so even `H=1` differs from sync (separate AdamW moment estimates per worker; +0.047, within its noise). Training is 960 steps, so sync may still be improving and a longer budget could change the gap.
- Limits: one size (413k parameters), one corpus, 960 steps, 3 report seeds (a 2-sd rule with n = 3 is weak: the `H=16` sd of 0.054 is mostly one seed), 4-point lr grid, 2 tuning seeds, outer step fixed to plain averaging.
- Next: a longer budget (3,840 steps) at `H` in {sync, 4, 16, 64} to see whether the gap shrinks with training; then the outer-momentum grid of 2g on this model.

## 2026-10-25 · Milestone 2g: finer outer-momentum grid {0.1, 0.2, 0.3} (planned before running)
- Why: 2f's "Next". It tried momentum 0.5 and 0.9 only, both worse than plain averaging except one 1-sd gain at `H = 64`; the optimum could sit between 0 and 0.5.
- Design (`experiments/numpy_h_sweep/fine_momentum_sweep.py`; same model, data, budget and report seeds 0 to 4 on half B as 2e/2f). For `H` in {16, 64, 160}, outer lr 1.0, Nesterov momentum in {0.1, 0.2, 0.3}, inner lr fixed at 2e's pick for that `H` (0.03, 0.01, 0.01). No selection on the reported half, so all nine cells are reported unfiltered; the plain row (momentum 0) is 2e's, the runs being deterministic.
- **H2g-i:** momentum in 0.1 to 0.3 is no better than plain at any `H`: no cell is more than 1 pooled sd below the plain mean. Refuted if some cell is lower than plain by more than 1 pooled sd (pooled sd = sqrt of mean of the two variances).
- **H2g-ii:** loss rises monotonically in momentum from 0 to 0.5 at `H = 160` (the 2f row 0.5 is the reference). Recorded as suggestive; 5 seeds.
- Limits: 14k parameters, 640 steps, fixed inner lr (not re-tuned per momentum), outer lr fixed at 1; a paired comparison across seeds would be tighter than the pooled-sd rule and is also reported.

### Outcome of 2g (`experiments/numpy_h_sweep/fine_momentum_sweep_results.txt`; half B, 5 seeds, outer lr 1, inner lr fixed at 2e's pick; the momentum-0 rows reproduce 2e exactly)
- Mean loss by outer momentum 0 / 0.1 / 0.2 / 0.3: `H = 16` 2.1831 / 2.1930 / 2.2036 / 2.2264; `H = 64` 2.2101 / 2.1962 / 2.1924 / 2.1898; `H = 160` 2.2177 / 2.2089 / 2.2070 / 2.2134. Paired differences from plain (same seed, same init): `H = 16` +0.010, +0.021, +0.043; `H = 64` -0.014 (paired sd 0.002), -0.018 (0.008), -0.020 (0.010); `H = 160` -0.009 (0.003), -0.011 (0.006), -0.004 (0.009).
- **H2g-i refuted at `H = 64`, and weakly at `H = 160`.** At `H = 64` all three cells are below plain by more than 1 pooled sd (about 0.010 to 0.013), and every one of the five seeds improves for momentum 0.1 (paired mean/(sd/sqrt 5) about 15; for 0.3 about 4.8). At `H = 160` the gains (0.004 to 0.011) are about 1 pooled sd, with 0.2 the best, so only the paired view sees them. At `H = 16` every momentum hurts, monotonically (+0.010 to +0.043).
- **H2g-ii refuted.** At `H = 160` the loss is not monotone in momentum: it dips at 0.1 to 0.2 (2.2070 at 0.2), then rises to 2.2134 at 0.3 and 2.2685 at 0.5 (2f).
- Reading: small outer momentum (0.1 to 0.3) recovers a little (0.01 to 0.02 nats) of the loss that long local runs cost, at `H = 64` to 160, while it hurts at `H = 16`; 2f's "momentum hurts" holds only at 0.5 and above. The size is a fifth to a third of the gap to synchronous (`H = 64`: 0.052; `H = 160`: 0.059), so momentum does not close it. The best momentum is 0 at `H = 16`, 0.3 or more at `H = 64` and 0.2 at `H = 160`, so H3 (optimal outer momentum falls with `H`) is not supported over this range, though 40 rounds at `H = 16` against 4 at `H = 160` may confound it. Not tested beyond 14k parameters and 640 steps; 2f's "momentum hurts" should be read as "momentum 0.5 and above hurts".
- Limits: inner lr not re-tuned per momentum; five seeds; paired tests are descriptive (no multiplicity correction across nine cells); one outer lr.
- Next: the real-model milestone (transformer big enough that synchronous training is not under-trained) before any momentum claim at scale.

## 2026-10-25 · Milestone 2f: inner-lr grid extended to 0.1, then outer momentum on top (planned before running)
- Why: 2e's "Next". Its picks for `H <= 16` sat at the top of the grid (0.03), and outer momentum was off, so it cannot say whether a tuned outer step recovers the loss lost at large `H`.
- Design (`experiments/numpy_h_sweep/outer_momentum_sweep.py`; same model, data, budget, seeds and tune/report split as 2e). Part 1: add inner lr 0.1 to 2e's grid for every `H` in {sync, 1, 4, 16, 64, 160} (tuning half A, seeds 100, 101; the 2e half-A numbers for 1e-3 to 3e-2 are reused, the runs being deterministic); re-report half B (seeds 0 to 4) for any `H` whose pick changes. Part 2: for `H` in {16, 64, 160}, outer step (lr, momentum) in {(1, 0) plain, (0.7, 0.9) the DiLoCo paper's Nesterov setting, (1, 0.5)} crossed with inner lr in {0.01, 0.03, 0.1}, tuned on half A, reported on half B.
- **H2f-i:** with 0.1 in the grid, the picked inner lr is non-increasing in `H` and the pick for `H <= 16` is 0.03 or 0.1 (no edge artefact if 0.1 loses); loss at `H = 1, 4, 16` stays within 2 sd of synchronous. Refuted if the picks for `H <= 16` move to 0.1 and the loss changes by more than 0.03.
- **H2f-ii:** tuned outer momentum does not close the large-`H` gap: at `H = 160` the best outer configuration is still more than 2 sd above synchronous AdamW. Refuted if it is within 2 sd. Prior: momentum helps a little at `H = 16`, little at `H = 160`.
- Limits: as 2e (14k parameters, 640 steps, 2 tuning seeds); outer grid is three points, not a search; a lr of 0.1 may diverge (counted as infinite loss and reported).

## 2026-10-24 · Milestone 2e: inner lr tuned jointly, outer step fixed to plain averaging (planned before running)
- Why: 2b left the H curve confounded by an untuned inner lr (3e-3) and by an outer step (lr up to 3, momentum) that acts as acceleration on an under-trained model. Question: if the outer step is plain averaging (lr 1, momentum 0, so DiLoCo is local AdamW with periodic averaging) and the inner lr is tuned per `H` (and for synchronous AdamW), what does loss against `H` look like?
- Design (`experiments/numpy_h_sweep/inner_lr_sweep.py`): same model, data, budget (M=4, 640 steps/worker). Inner lr in {1e-3, 3e-3, 1e-2, 3e-2}, `H` in {sync, 1, 4, 16, 64, 160}; pick on half A (seeds 100, 101), report on half B (seeds 0 to 4).
- **H2e-i:** with plain averaging and a tuned inner lr, `H <= 16` is within 2 sd of synchronous AdamW (tuned the same way). Refuted if any of `H` = 1, 4, 16 is more than 2 sd away (sd = the larger of the two seed sds).
- **H2e-ii:** `H = 160` is worse than synchronous by more than 2 sd. Refuted otherwise.
- **H2e-iii:** the picked inner lr is non-increasing in `H` (long local runs prefer smaller steps). Recorded as suggestive; 4-point grid.
- Limits: 14k parameters, 640 steps (still under-trained), 2 tuning seeds, a 4-point lr grid with possible edge picks (reported).

### Outcome of 2e (`experiments/numpy_h_sweep/inner_lr_sweep_results.txt`; half-B held-out loss, mean ± sd over 5 seeds)
- Synchronous AdamW (inner lr 0.01) 2.1585 ± 0.0085. Plain-averaging DiLoCo: `H=1` 2.1489 ± 0.0147 (lr 0.03), `H=4` 2.1674 ± 0.0209 (0.03), `H=16` 2.1831 ± 0.0144 (0.03), `H=64` 2.2101 ± 0.0129 (0.01), `H=160` 2.2177 ± 0.0129 (0.01).
- **H2e-i supported, narrowly at `H=16`.** Differences from synchronous are -0.010, +0.009, +0.025 for `H` = 1, 4, 16, against 2 sd of 0.029, 0.042, 0.029. `H=16` is inside the bound by 0.004, so with five seeds this is not a strong "no difference".
- **H2e-ii supported.** `H=160` is +0.059 above synchronous (2 sd = 0.026). The loss rises monotonically with `H` from 2.149 to 2.218 (about +0.07 over two orders of magnitude of `H`); the U-shape of the first sweep is gone.
- **H2e-iii supported, with an edge caveat.** Picked inner lr is 0.03, 0.03, 0.03, 0.01, 0.01 for `H` = 1 to 160, so non-increasing; but 0.03 is the top of the grid, so `H <= 16` is probably under-tuned and the true drop with `H` may be larger or smaller.
- **What this changes.** Tuning the inner lr moved every loss from about 2.3 to 2.4 (earlier steps) down to about 2.15 to 2.22, bigger than any effect of `H`. The earlier findings that `H=16` beats synchronous (2a) and that `H=1` with outer lr 3 beats it by 0.2 nats (2b) were under-training artefacts: with the inner lr tuned for each, synchronous training is no worse than `H<=16` within noise, and the cost of local steps appears at large `H` only. The dip at `H=16` and the "DiLoCo beats synchronous" readings should not be cited.
- Limits: as planned (14k parameters, 640 steps, 4-point grid, two tuning seeds, lr picks at the grid edge for `H <= 16`); outer momentum is switched off here, so this says nothing about whether tuned outer momentum recovers the large-`H` loss.
- Next: extend the inner-lr grid upward (0.1) to resolve the edge picks, then add outer momentum back on top of the tuned inner lr to test whether it closes the `H=160` gap.

### Outcome of 2f (`experiments/numpy_h_sweep/outer_momentum_sweep_results.txt`, about 17 minutes on 4 cores; half-B held-out loss, mean ± sd over 5 seeds)
- **H2f-i supported: the edge picks were not an artefact.** Inner lr 0.1 loses at every `H` (half-A loss 2.33 at best, at `H=4`; 2.55 at `H=1`; 84 for synchronous, where it diverges), so no pick changed and 2e's rows stand: `H = 1, 4, 16` pick 0.03, `H = 64, 160` pick 0.01, synchronous 0.01. The grid now brackets the optimum from above for every `H`.
- **H2f-ii supported, more strongly than predicted: outer momentum does not help, it hurts.** With the inner lr tuned for each, half-B loss against plain averaging (2e) for `H` = 16, 64, 160: plain 2.1831 / 2.2101 / 2.2177; outer (1, 0.5) 2.1908 ± 0.006 / 2.1995 ± 0.009 / 2.2685 ± 0.014; the DiLoCo-paper setting (0.7, 0.9) 2.2182 ± 0.027 / 2.2566 ± 0.016 / 2.4861 ± 0.072. At `H = 160` the best outer configuration (plain) is 0.059 above synchronous AdamW (2.1585 ± 0.0085); momentum 0.5 adds 0.05 and momentum 0.9 adds 0.27 with a seed sd of 0.07. The one gain is at `H = 64`, where (1, 0.5) is 0.011 below plain (about 1 sd, two tuning seeds, not claimed).
- Reading: on this 14k-parameter, 640-step model the "outer Nesterov momentum 0.9" of the DiLoCo paper acts as a hazard, not an accelerator, once the inner lr is tuned. It cannot be taken to hold at scale: the model is tiny and under-trained, each round is few outer steps (4 to 640 rounds), and momentum 0.9 needs many rounds to pay. The programme's H3 (optimal outer momentum falls with `H`) is therefore not tested here; this says only that at these `H` the optimum is at or near zero.
- Limits: three outer configurations, not a search (momentum 0.5 and 0.9 only; no 0.1 to 0.3); outer lr moved together with momentum in (0.7, 0.9); two tuning seeds; the plain row was not re-tuned with 0.1 for part 2 (it never wins in part 1, so unaffected).
- Next: a transformer large enough that the sync loss is not under-training (the proposal's real-model milestone) before any momentum claim; or a finer momentum grid {0.1, 0.2, 0.3} at `H = 64`.

## 2026-10-24 · Milestone 2d: bootstrap intervals for B_simple (planned before running)
- Why: 2c's values at single checkpoints came from 64 batches and moved several-fold between neighbours, so its "tens of sequences" claim had no error bars. Question: with n = 256 batches per checkpoint and a bootstrap over batches, how wide is the 95% interval of B_simple, and does the "rises by more than 10x from init" result still hold at the interval's lower end?
- Design (`experiments/numpy_h_sweep/noise_scale_boot.py`): same model, data, training and checkpoints as 2c (3 seeds), n = 256 gradients at b = 16 per checkpoint; 1,000 bootstrap resamples of the batches; each resample recomputes S, the unbiased |G|^2 and the ratio. Resamples with |G|^2 <= 0 are counted and excluded from the percentile interval (reported).
- **H2d-i:** at steps 80 to 640 the lower 95% limit of B_simple exceeds 3x its init-step upper limit in every seed and checkpoint (rise is real). Refuted if any cell fails.
- **H2d-ii:** the interval's upper/lower ratio at n = 256 is below 3 at every step >= 160 (so 2c's "factor 2 to 3" noise was a small-n effect). Refuted otherwise; prior: it will hold at 80 and 160 but not at the late checkpoints, where |G|^2 is small.
- Limits: the bootstrap is over batches at one parameter vector, so it covers estimator error only, not the variation of the training trajectory (that is the seed spread); the ratio estimator is biased at small |G|^2.

### Outcome of 2d (`experiments/numpy_h_sweep/noise_scale_boot_results.txt`; n = 256 batches, 1,000 resamples, 3 seeds; no resample had |G|^2 <= 0)
- **H2d-i supported.** Init B_simple is 2.8 to 3.9 (upper limits 2.9 to 3.9, so 3x is at most 11.7). The lowest lower limit at steps 80 to 640 is 16.9 (seed 2, step 160); every other cell is above 25. The rise from init is real in every seed and checkpoint.
- **H2d-ii supported, and my prior was wrong.** The upper/lower ratio at steps >= 160 is at most 1.37 (seed 1, step 160: 97.9 to 134.2). Estimator error at n = 256 is about +-15%, not a factor of 2 to 3; I had expected the late checkpoints to be wide.
- **Consequence for 2c.** The non-monotone trajectory is not estimator noise: seed 2 goes 98 (step 80), 19 (160), 99 (320), 41 (640) with intervals of width under 40%, and the n = 64 values in 2c were close to these (seed 2, step 160: 15.6 against 19.2). B_simple on this model moves by factors of 2 to 5 between checkpoints within a run, and differs across seeds at the same step (step 640: 93, 95, 41). So a single B_simple is not a stable constant for the composition rule; it needs a range (roughly 20 to 120 sequences after step 80) or a per-step estimate.
- Limits: the bootstrap resamples batches at one parameter vector, so it covers estimator error only; the ratio estimator is biased at small |G|^2 (not corrected); three seeds; AdamW-preconditioned, 14k parameters.
- Next: test whether B_simple at the end of training predicts where the H curve turns, now that its range is known; jointly tune the inner lr (2b's open problem).

## 2026-10-24 · Milestone 2c: simple gradient noise scale B_simple along training (planned before running)
- Why: the proposal's composition rule needs a measured noise constant `B_noise`; PR 10109 (another session) widens the outer-lr grid, so this step takes the other open item from 2a's "Next".
- Design (`experiments/numpy_h_sweep/noise_scale.py`): same 14k-parameter model and data as the sweeps. Train synchronous AdamW (batch 4x16, seed s) and at steps {0, 80, 160, 320, 640} take n=64 independent gradients at batch size b=16 on training text. Estimator (McCandlish et al. 2018 "simple" scale, to be checked against the reference): S = sum over coordinates of the across-batch variance (unbiased), so tr(Sigma) = b*S; |G|^2 = |mean grad|^2 - S/n (unbiased); B_simple = b*S/|G|^2. 3 seeds.
- Hypothesis: B_simple rises as the loss falls (|G|^2 shrinks faster than the noise), so B_simple at step 640 exceeds that at step 0 in every seed. Refuted if it falls or is flat (ratio < 1.2) in any seed. Also recorded: whether B_simple is far above the per-step batch of 64 sequences (which would mean the workers are noise-dominated, the regime the quadratic closed forms assume).
- Limits: the unbiased |G|^2 can go negative when noise dominates (reported as such, not clipped); the scale is for AdamW-preconditioned training in raw-gradient units, so it is only a proxy for the Adam-adjusted critical batch; 14k parameters.

### Outcome of 2c (`experiments/numpy_h_sweep/noise_scale_results.txt`; 3 seeds, one estimate per checkpoint)
- B_simple at init is 2.8, 4.0, 2.9 sequences (tr Sigma about 0.002); at step 80 it is 79, 63, 93; at step 640 it is 105, 82, 40. **Hypothesis supported**: the step-640 value exceeds the step-0 value by more than 10x in every seed (well past the 1.2 threshold).
- The rise is not monotone after step 80 (e.g. seed 0: 79, 69, 26, 105; seed 2: 93, 16, 78, 40). The unbiased |G|^2 comes from only 64 batches and varies by several-fold between neighbouring checkpoints, so single-checkpoint values are good to a factor of about 2 to 3 at best; the supported claim is the order of magnitude (tens of sequences once training is under way), not a trajectory.
- Reading against the per-step batch of 64 sequences (4 workers x 16): B_simple of 40 to 105 is the same order, so on this model the workers are neither clearly noise-dominated nor clearly curvature-dominated; the noise-dominated regime of the quadratic closed forms is not established here. Not tested: whether B_simple predicts where the H curve turns.
- Caveats as planned: raw-gradient units with AdamW preconditioning, 14k parameters, no estimator error bars beyond the seed spread.
- Next: bootstrap intervals for B_simple (more batches per checkpoint), then use it as the noise input to a first H-versus-loss prediction.

## 2026-10-24 · Milestone 2b: widen the outer-lr grid (planned before running)
- Why: in 2a the picked outer lr sat at the grid edge (1.0) for `H = 1, 64, 160`, so those points are probably under-tuned. Question: with outer lr in {0.7, 1.0, 1.5, 2.0, 3.0} x momentum in {0, 0.5, 0.9}, does the large-`H` rise shrink, and does the `H=16` dip survive?
- Design: `tuned_h_sweep.py --wide`, otherwise identical to 2a (same model, seeds, split, budget; 15 settings x 2 tuning seeds per `H`).
- Hypothesis: the dip at `H=16` survives (`H=4` still above `H=16` by more than 2 sd of `H=4`'s seeds), and the picked lr at `H=64, 160` moves above 1.0 and lowers their loss. Refuted if `H=4` is within 2 sd of `H=16`, or if no large-`H` pick leaves 1.0.
- Limits: still 14k parameters, 640 steps, two tuning seeds, inner lr untuned.

### Outcome of 2b (`experiments/numpy_h_sweep/tuned_h_sweep_wide_results.txt`; half-B held-out loss, mean ± sd over 5 seeds)
- Synchronous AdamW 2.383 ± 0.011. DiLoCo, outer step picked per `H` from the wider grid: `H=1` **2.185 ± 0.017** (lr 3.0, momentum 0.5), `H=4` 2.301 ± 0.017 (3.0, 0), `H=16` 2.274 ± 0.038 (0.7, 0.9), `H=64` 2.410 ± 0.017 (1.0, 0.5), `H=160` 2.481 ± 0.004 (1.0, 0.5). `H=16`, `H=64`, `H=160` are identical to 2a: their picks did not move.
- **Both pre-registered hypotheses refuted.** (i) `H=4` is now 0.027 above `H=16`, inside 2 sd of `H=4` (0.033), so the "dip at `H=16`" no longer survives: the 2a gap (0.075) came from `H=4` being under-tuned at lr 1.0. (ii) No large-`H` pick left 1.0, so the large-`H` rise in 2a was not an edge artefact.
- **New problem, not a result about `H`:** the small-`H` picks now sit at the new edge (lr 3.0) and `H=1` is best of all, 0.2 nats below synchronous AdamW. At `H=1` an outer lr of 3 with momentum is just a larger, accelerated step on an under-trained model (640 steps, loss still falling), so the curve is still confounded by the under-training and the untuned inner lr. The comparison across `H` is meaningful only at a budget where synchronous training has converged, or with inner lr tuned jointly.
- Practical: runs need `OMP_NUM_THREADS=1`; without it four pool workers made no progress in 30 minutes, with it the whole sweep takes about 25 minutes.
- Next: tune the inner lr jointly (or train to convergence on a longer budget) before any claim about the shape of the curve in `H`; then `B_noise`.

## 2026-10-24 · Milestone 2a: per-H outer tuning, then the H curve again (planned before running)
- Why: the first H sweep (below) failed its weak H2 form, and the likely confound is that one outer setting (lr 0.7, Nesterov 0.9) was used for every `H`. Question: after tuning the outer optimiser separately for each `H`, is the loss-versus-`H` curve flat and then rising (H2), or still U-shaped?
- Design (`experiments/numpy_h_sweep/tuned_h_sweep.py`, same model, data and budget as the first sweep: 14k parameters, `M=4`, 640 inner steps per worker). Held-out text is split in halves: half A is used only to pick the outer setting, half B only to report. Tuning: outer lr in {0.3, 0.7, 1.0} x momentum in {0, 0.5, 0.9} (Nesterov), 2 tuning seeds (100, 101), for `H` in {1, 4, 16, 64, 160}; the pick is the lowest mean half-A loss. Reporting: 5 fresh seeds (0 to 4) on half B, plus synchronous AdamW.
- Hypothesis (H2 weak form, retested): with the outer step tuned per `H`, `H=4` and `H=16` are within one seed sd of each other, and `H=160` is the worst. Refuted if `H=4` stays more than 2 sd above `H=16`. Also recorded: whether the picked momentum falls as `H` rises (H4's direction).
- Limits to state with the result: a 9-point grid with two tuning seeds is coarse; inner lr is not tuned; 14k parameters is far below the proposal's floor, so this still cannot confirm H2 at the scale it is stated for.

### Outcome of 2a (`experiments/numpy_h_sweep/tuned_h_sweep_results.txt`; half-B held-out loss, nats/char, mean ± sd over 5 seeds)
- Synchronous AdamW 2.383 ± 0.011. DiLoCo with the outer step picked per `H`: `H=1` 2.342 ± 0.030 (lr 1.0, momentum 0.5), `H=4` 2.348 ± 0.010 (0.3, 0.9), `H=16` **2.274 ± 0.038** (0.7, 0.9), `H=64` 2.410 ± 0.017 (1.0, 0.5), `H=160` 2.481 ± 0.004 (1.0, 0.5).
- **H2 weak form, retested: refuted in its stated form, partly in its spirit.** `H=4` is 0.075 above `H=16` (Welch t = 4.3, se 0.018), so the curve is not flat up to 16. Tuning did remove most of the earlier U-shape at the small end: `H=1` and `H=4` are now within 0.006 of each other (they were 0.23 apart with the fixed setting) and the `H=160` run no longer diverges. The remaining dip at `H=16` is real across seeds but one point wide.
- Momentum pick does not fall monotonically with `H` (0.5, 0.9, 0.9, 0.5, 0.5): it rises then falls, so H4's direction holds only for `H >= 16`. Treat as suggestive; the grid is coarse.
- Caveats: the picked lr is at the grid edge (1.0) for `H = 1, 64, 160`, so those three are probably under-tuned and the large-`H` rise is an upper bound on the true tuned loss. Two tuning seeds, 14k parameters, 640 steps (still under-trained). `H=16` beating the synchronous run is not a claim that DiLoCo beats synchronous training at equal tokens: the model is under-trained and outer momentum accelerates. Nothing here confirms H2 at the stated scale.
- Next: widen the lr grid beyond 1.0, add a longer budget, then the `B_noise` measurement.

## 2026-10-24 · Numerical note: float32 sync-equivalence drifts (a third, redundant torch harness)
- A third session built a torch harness in parallel with the two above and dropped it as a duplicate; one finding is kept. A float32 `M=1, H=1` DiLoCo-vs-AdamW comparison of parameters on a 1-layer GPT agrees to 1e-10 after one step but drifts to 2e-4 after ten. Adam divides near-zero gradients of parameters whose true gradient is zero (the attention key bias, since softmax ignores a constant key shift) by their own tiny RMS, so roundoff is amplified to order lr. In float64 the difference is under 1e-9. Compare losses, or run equivalence tests in float64, when two mathematically equal code paths are compared in float32.
- Its sweep (0.1M params, `M=4`, 240 steps, outer lr 0.7 / momentum 0.9, 3 seeds, H=1,4,12,40,120: 2.95, 2.62, 2.36, 2.34, 2.52 nats) is consistent with the U-shape above and adds nothing new.

## 2026-10-24 · A second, numpy-only harness and a first H sweep (run in parallel with the torch harness above)
- Built `experiments/numpy_h_sweep/lowcomm_np/` (a concurrent session landed the torch harness in `src/lowcomm/` first; this one is kept because it adds the sweep below and an independent implementation of the same checks): a one-block numpy transformer with hand-written backward (no torch: `download.pytorch.org` returned 403 through the proxy and the PyPI wheel carries gigabytes of CUDA libraries), a flat-vector DiLoCo trainer with AdamW or SGD inner and Nesterov or heavy-ball outer, and a synchronous reference. 7 tests: gradient vs finite differences; `M=1, H=1, lr=1, b=0` DiLoCo equals synchronous AdamW to 1e-12; heavy-ball outer equals a hand-written loop; and on a noisy quadratic the same trainer's stationary loss matches `noisy-local-sgd`'s exact floor within 8%.
- **Planned run** (`experiments/numpy_h_sweep/h_sweep.py`): Tiny Shakespeare (char level, 65 symbols, last 10% held out), model d=32, ff=64, ctx=32 (about 14k parameters, far below the 0.8M floor in the proposal), `M=4` workers, batch 16 per worker, total inner steps per worker fixed at 640, inner AdamW lr 3e-3, outer Nesterov lr 0.7 and momentum 0.9 (the DiLoCo defaults of Douillard et al., 2023), `H` in {1, 4, 16, 64, 160}, 3 seeds, versus synchronous AdamW with batch `4*16`.
- **Hypothesis (H2, weak form):** held-out loss at `H <= 16` is within the seed spread of `H = 4`, and `H = 160` is worse. This is a smoke test of the harness at a much smaller scale than H2 is stated for; it can neither confirm nor refute H2. Outer hyperparameters are not tuned per `H`, which biases against large `H`.
- **Outcome** (`experiments/numpy_h_sweep/h_sweep_results.txt`, 3 seeds, mean ± sd of held-out loss in nats/char; uniform guess is 4.174): synchronous AdamW 2.437 ± 0.007; DiLoCo `H=1` 2.976 ± 0.085; `H=4` 2.743 ± 0.068; `H=16` 2.316 ± 0.040; `H=64` 2.512 ± 0.038; `H=160` 4.05 ± 1.47 (one seed 5.75, a divergence).
- **The weak form of H2 failed as stated**: `H=4` is not within the seed spread of `H=16` (0.43 higher, about 10 sd). The curve is U-shaped, not flat then rising. Reading, not tested: with outer lr 0.7 and Nesterov momentum 0.9 the outer step is too aggressive at small `H` (few inner steps, so the pseudo-gradient is small and noisy) and too slow at large `H`, which is the `H* ~ C` and "optimal momentum falls with `H`" effect (H4) showing up as a confound. `H=16` beating the synchronous run is also not evidence that DiLoCo beats synchronous training: the model is under-trained (640 steps, loss still falling) and outer momentum acts as acceleration. It would need the outer step tuned per `H`, a longer budget and a larger model before saying anything about H2.
- Next: milestone 2 needs per-`H` outer tuning (a grid over lr and momentum) before any H2 claim, plus the `B_noise` measurement. The harness takes about 27 s per 640-step run on this machine's CPU, so a 4-size, 5-seed grid needs a GPU or a faster backend; torch is not installable here (see above).

## 2026-10-24 · Milestone 1: harness (planned before running)
- Built `src/lowcomm/` (nanoGPT-layout model, char data, simulated `M`-worker DiLoCo engine with per-worker AdamW state, Nesterov outer SGD) and `tests/`.
- Pre-registered checks, run by `experiments/m1_check.py`: (a) at `M = 1, H = 1`, outer SGD lr 1, DiLoCo and the synchronous AdamW loop give the same loss curve and parameters to 1e-5; (b) on a 3-mode quadratic with gradient noise, run through the same engine with SGD inner and heavy-ball outer, the time-averaged stationary loss over 8 seeds agrees with the closed form of `noisy-local-sgd` within 5% (the 95% interval over seeds contains the closed form); (c) a first transformer run (single seed, preliminary) that DiLoCo at `M = 4, H = 16` trains at all: validation loss falls well below the unigram entropy of the corpus. Refutation of (a) or (b) means the engine is wrong and nothing downstream is trusted.

### Outcome (all three pre-registered checks passed)
- (a) `M = 1, H = 1`, outer SGD lr 1: max loss difference 0 and max parameter difference 0 over 100 steps (0.41M-parameter model; bit-identical, because the pseudo-gradient step reproduces the inner step exactly).
- (b) Quadratic through the same engine: closed form 0.02842, simulated 0.02794 +/- 0.00079 (95% CI, 8 seeds), ratio 0.983. The interval contains the closed form, so the engine reproduces the `noisy-local-sgd` stationary loss.
- (c) Preliminary, one seed: DiLoCo `M = 4, H = 16` on Tiny Shakespeare, validation loss 2.202, 1.973, 1.853 after 20, 40, 60 rounds, against a unigram entropy of 3.313 nats, so it trains. This is not a result about `H`.
- Caveats: the smallest model is 0.41M parameters, not the 0.8M planned; no learning-rate tuning yet; citations still unchecked (registries unprobed this session).
- Next: milestone 2, `B_noise` and `s_eff` measurement and the first loss-versus-`H` plot at equal tokens, with at least five seeds.

## 2026-10-24 · Programme opened
- Wrote `PROPOSAL.md`: 16 outside references, our own ~12 quadratic-model projects as prior work, six falsifiable hypotheses (H1 to H6), seven milestones, target an optimisation/efficiency workshop then ICML or NeurIPS.
- Citations are not machine-checked: arXiv and Crossref returned 403 through the proxy this session. Re-run `cite_check.py` first thing in a session with access.
- Data reachable from this session: Tiny Shakespeare via raw.githubusercontent.com and pip via pypi.org; huggingface.co was not reachable (probe again).
- Next: milestone 1. Build the simulated `M`-worker DiLoCo trainer, and test it against the synchronous trainer and a quadratic closed form from `noisy-local-sgd`.
