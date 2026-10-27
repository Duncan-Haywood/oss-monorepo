# verified-dse: how much of a chip design search can cheap fidelity rungs save, with a guarantee?

Research programme on multi-fidelity, verification-aware design-space search for
open-source chip flows (Yosys, ABC, OpenROAD) on SKY130. **Status: milestones 1 to 31 done (31: on `fanao96` R2 gets the area right (tau 0.98) and the period wrong, a wire/fanout floor rather than buffer insertion: [`experiments/fanao_mech/`](experiments/fanao_mech/results.txt); 30: two high-fanout designs with 36 to 39 distinct outcomes per cell; `fanao96` has R2 pick regret 14% (tau 0.14 to 0.20), `bcastadd64` none, and the gate still does not beat the no-cut arms: [`experiments/fanout_rich/`](experiments/fanout_rich/results.txt); 29: pooled over the ten held-out designs, gentle R2 halving beats random R4 in 8 of 10 designs but no test survives Holm correction at n = 10, and f3 equals eta = 1.5 at 25 equivalents: [`experiments/heldout_signif/`](experiments/heldout_signif/results.txt); 28: five wiring-dominated designs: one bad R2 cell (bcastmix192, two outcomes, tau -1) and the pilot gate still loses to the no-cut arm: [`experiments/hostile/`](experiments/hostile/results.txt); 20: a two-feature regression surrogate on R2 features loses to random and to the no-R2-cut arm at every budget: [`experiments/mf_surrogate/`](experiments/mf_surrogate/results.txt); 18: the R2 period, not the area, mis-ranks; 17: a bigger pilot does not help and a held-out threshold removes the gate's gain: [`experiments/pilot_sweep/`](experiments/pilot_sweep/results.txt); 16: a five-point pilot gate on 20 designs; the simple no-R2-cut arm is still as good: [`experiments/pilot_gate/`](experiments/pilot_gate/results.txt); 9: five larger designs, first sign of H2; 15: five larger non-arithmetic designs, where an R2 cut again floors on one design, barrel64, and skipping the R2 cut removes it: [`experiments/nonarith/`](experiments/nonarith/results.txt)).
The cheap rungs are measurably biased against routed area x delay; H2 to H4 are run on a
cached table; H5 (proof prediction) is not testable on this benchmark as built.** Produced with AI assistance (Claude Code).
It builds on none of the CU Boulder groups and claims no affiliation.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/verified-dse/

## Question
Can cheap rungs (generic gates, liberty mapping, placement, global route) and a
prediction of formal-equivalence success cut the cost of finding a Pareto-good
routed design, with a coverage guarantee that holds whatever the rung bias?

## Milestone 1 result: does the cheap rung rank ABC pass sequences like the routed one? (H1)
10 small designs, 60 ABC pass sequences each (length 0 to 3 over `balance`, `rewrite`, `rewrite -z`,
`refactor`, `refactor -z`, `dc2`, `dch`), two clock targets, four rungs, 1,200 runs. Score is area x period.
"Routed" is OpenROAD global route plus `repair_timing -setup` on SKY130 HD (chip-pnr's script, 40% utilisation).

| rung | cost per point (1 core) | tau-b vs routed, tight clock: median, designs < 0.7 | same, relaxed clock | median pick regret, tight / relaxed |
|---|---|---|---|---|
| R1 generic gates (cells x depth) | 0.15 s | -0.04, 9 of 9 defined | -0.01, 9 of 9 | 13.5% / 20.0% |
| R2 mapped, no wires | 0.8 s | 0.59, 6 of 10 | 0.73, 3 of 10 | 10.5% / 0.0% |
| R3 after placement | 1.0 s | 0.50, 7 of 10 | 0.76, 1 of 10 | 9.4% / 0.0% |
| R4 routed (reference) | 1.3 s | | | |

- **H1 holds:** the generic-gate score is uninformative to anti-correlated with routed area x delay (the 95% bootstrap interval lies below 0 for popcount16 and crc16 at the tight target). For the ripple adder R1 is constant, so tau is undefined.
- **Mapping is not enough when timing is tight.** Liberty-mapped scores mis-rank at the tight target (median regret 10.5%) and are nearly exact at the relaxed one, because timing repair, which only the later rungs see, reorders designs.
- **Cost:** on these small designs the routed rung costs only about 8x the generic one (1.3 s against 0.15 s), so there is little to save yet; larger designs are needed before H2 is testable.
- Full per-design tables with intervals: [`experiments/rung_bias/results.txt`](experiments/rung_bias/results.txt). Log: [`LOG.md`](LOG.md).

## Milestone 9 result: on larger designs, does a cheap rung finally pay? (H2)
5 larger designs (16, 24 and 32-bit multipliers, 64-bit adders), the same 60 pass sequences, two clocks, 600 runs. The routed rung now costs 19.4 s against 0.77 s for the generic one (25x, against 8x on the small designs).
- **Successive halving from the mapped rung (R2) beats random routed search at small budgets on the tight clock:** mean regret 1.34% against 4.44% at 100 s and 0.33% against 1.85% at 200 s, then random search overtakes it from about 600 s because halving stops at a 0.30% bias floor. At the relaxed clock it wins only at 100 s and floors at 5.0%. Halving from the generic rung (R1) loses everywhere.
- Rung bias is not the same story as on the small designs: R1 is weakly informative on multipliers (tau-b 0.31 tight), and mapped rungs mis-rank the 24 and 32-bit multipliers at the relaxed clock (regret 11 to 18%).
- Milestone 25: the same five designs at 65% placement utilisation (second operating point) give the same picture, R2 floor on mult24 and mult32 at the relaxed clock, routed rung 24 s against 19 s per point: [`experiments/util65/`](experiments/util65/results.txt).
- Five designs, pools of 50, one corner (40% utilisation); see [`LOG.md`](LOG.md) and [`experiments/large/`](experiments/large/results.txt), [`halving_results.txt`](experiments/large/halving_results.txt).

### Reproduce
```bash
# OpenROAD 26Q2 from the nixpkgs binary cache, Yosys 0.33 (apt), SKY130 platform files at chip-pnr's pinned ORFS commit
research/chip-pnr/fetch_pdk.sh /tmp/pdk
python3 experiments/rung_bias/run.py --openroad <openroad> --pdk /tmp/pdk/orfs/flow/platforms/sky130hd   # ~40 min on 4 cores
python3 experiments/rung_bias/analyse.py                                                            # writes results.txt, summary.json
python3 -m unittest discover -s tests                                                               # rank statistics
```

### Limitations
One library corner (tt 25C 1.8 V), one utilisation, one tool version, ten small combinational designs and one FIFO.
"Routed" is global-route-estimated, not detail-routed. The same 60 sequences are used for every design; 10 of them fail in
ABC (all contain a `dch` followed later by `rewrite`/`refactor`) and are dropped. Clock targets are each design's own
baseline no-wire period (tight) and 1.5x that (relaxed), so they differ across designs. Bootstrap intervals resample
sequences within a design; there is no multiple-comparison correction. Sequences that give identical netlists tie, which
tau-b handles but which limits the ripple adder (4 distinct routed scores). Cumulative rung times are the Yosys mapping time plus the OpenROAD stage time, as in
`LOG.md`.

## Milestone 11 result: does a random hedge, or a gentler cut, fix halving's bias floor?
Replayed on both cached tables (no flow run), 400 paired seeds. A random-search hedge (75% or 50% of the budget to halving, the rest to random routed points) lowers the floor at 600 s and over on the larger designs but gives up the head start and still trails random search at 900 s. **Halving from R2 with eta = 2 instead of 3 is the stronger change at the tight clock:** on the small designs it beats random search on 4 to 7 of 10 designs at 20 to 45 s (mean regret 0.57% against 0.94% at 45 s), and on the larger designs its floor is 0.11% against 0.30%. At the relaxed clock nothing helps: worst-design regret stays 10 to 14%. Descriptive only (many comparisons, eta not tuned); see [`LOG.md`](LOG.md), [`experiments/hedge/results.txt`](experiments/hedge/results.txt).

## Contents
- [`PROPOSAL.md`](PROPOSAL.md): related work (12 checked ids), gap, hypotheses H1 to H5, evaluation, milestones, target venue (MLCAD).
- [`PAPER.md`](PAPER.md): the paper draft (MLCAD target, not submitted); `reproduce.sh` regenerates every number in it from the cached tables.
- [`LOG.md`](LOG.md): research log, with the plan written before the run.
- `designs/`, `src/verified_dse/` (flow and rank statistics), `experiments/rung_bias/` (run, analysis, raw `results.jsonl`), `tests/`.
- Designs: `adder_op`, `adder_ripple`, `mult_op`, `fifo` from [`chip-pnr`](../chip-pnr), `mac4` from [`chip-ppa-sky130mac`](../chip-ppa-sky130mac); `alu8`, `popcount16`, `barrel16`, `crc16`, `cmp_sat` are new, MIT.

## Next steps
Milestone 2: search baselines (random, hill climbing from `chip-scriptsearch`) at equal budget on the cached table; add
larger designs so rung costs separate; then successive halving and BO across rungs (H2, H3).

## Milestone 2 result: do cheap rungs beat plain search at equal wall-clock? (baselines for H2)
Replayed on the milestone 1 table (no flow re-run; per-rung costs measured: R1 0.15 s, R2 0.77 s, R4 1.26 s cumulative). Mean routed regret over 10 designs, tight clock, 400 paired seeds:

| budget | random (R4) | hill climbing (R4) | screen all at R1, verify top | screen all at R2, verify top |
|---|---|---|---|---|
| 10 s | 6.3% | 7.4% | 15.0% | cannot pay |
| 30 s | 2.1% | 1.7% | 5.3% | cannot pay |
| 45 s | 0.94% | 0.61% | 1.08% | 1.27% |

- A one-shot screen on a cheap rung does **not** beat plain random or hill-climbing search at equal wall-clock on this table: R1 screening loses to random on 10 of 10 designs at 10 s, and R2 screening wins on 6 to 8 designs at 45 s but loses by more on the rest, so its mean is worse. Hill climbing helps from 30 s even with sparse neighbourhoods.
- Limits: a pool of about 50 sequences per design makes every strategy converge to 0 regret, so this is the small-budget end only; NSGA-II is not yet run; Hyperband is (milestone 8, `experiments/hyperband/`: no mean-regret gain over random, a thinner tail than SH from R2); ridge, GP-EI and TPE (BOHB's model, single pool, not its bracket schedule) baselines were run in milestones 20 to 23 (`experiments/mf_surrogate/`, `mf_explore/`, `mf_gp/`, `mf_tpe/`) and none beats never cutting on R2. Code and log: `experiments/search_baselines/`, `LOG.md`.
- **Milestone 3 (H2, H3): successive halving across the rungs, replayed on the same table.** Plain halving from the generic-gate rung is the worst strategy at every budget of 10 s or more (about 10% mean routed regret at the tight clock, 8% relaxed, against 0.9% and 0.55% for random routed search at 45 s). Starting at the mapped rung beats random on 6 to 8 of 10 designs at a relaxed clock at small budgets, but its mean regret is still higher because barrel16 and the ripple adder lose 5 to 12%. A 6-point routed pilot that picks the starting rung (calibrated halving) recovers the designs plain halving loses (alu8 16.9% to 0.8%, fifo8x4 17.0% to 2.8%), so H3 holds, but most of that recovery is just "skip the generic-gate rung". Net on this table: no multi-fidelity gain at equal wall-clock yet; the pool (about 50 points) caps halving beyond roughly 30 s. Code and log: `experiments/halving/`, `LOG.md`.

- **Milestone 4 (H4): conformal shortlists, replayed on the same table** (`experiments/conformal/`). Fit routed area x delay from a cheap rung on a 10 to 16 point routed pilot and keep only points whose one-sided conformal bound could still beat the best pilot value. With the **mapped (R2) rung** the optimum is retained 0.99 of the time at nominal 0.90 (0.90 to 0.92 at nominal 0.80) while routing 42 to 57% of the pool, against 0.53 to 0.65 for random search with the same number of routed runs. With the **generic-gate (R1) rung** coverage is 0.65 at nominal 0.80 (0.88 at 0.90), no better than random search of equal cost: **H4 is refuted for R1** and holds for R2. A leave-one-design-out rank shortlist is at or near nominal but needs 89% of the pool with R1 and 33% with R2. Limits: 20 groups from 10 small designs, one corner, wide intervals (`LOG.md`).

- **Milestone 5 (H5): is equivalence-proof success predictable?** (`experiments/proof_success/`). 752 SAT-miter proofs (Yosys 0.33, 10 s timeout) of ABC-rewritten netlists against the unoptimised one, over 15 combinational designs (the milestone-1 designs plus multipliers of width 4 to 10). Rewrites never failed a proof; proof time is set by the design, not the rewrite (median 0.01 s at 4 bits, 2.1 s at 7, 11 s at 8; none of 100 proved in 10 s at 9 and 10 bits). Leave-one-design-out AUC is 0.96 to 0.998 pooled for logistic regression, but an oracle that only knows each design's success rate scores as high, so it is design size and not rewrite quality. Inside the one design with variation (8-bit multiplier, 17 of 50 proved) AUC is 0.65 to 0.78 and the one-feature rule "the rewrite is smaller than the reference" gets 0.81. **Verdict: H5 is vacuously met pooled and unsupported within a design; I would not claim proofs are predictable.** Limits: one solver and timeout, multipliers the only hard family, 10 s label censored. `LOG.md`.
- **Milestone 6 (theory): a regret bound for successive halving** (`experiments/theory/BOUND.md`, `bound.py`). Define a rung's inversion iota = the largest log-factor by which it ranks a truly worse candidate at or ahead of a better one; then halving from any rungs returns a routed value within the sum of the cut rungs' inversions of the pool optimum (proved in three lines; checked on 500 random instances and on all 40 cells of the cached table). It is vacuous for the generic-gate rung (iota above 0.3, a 35% factor, on 8 of 10 groups; bound 0.63 to 0.71) and loose even for the mapped rungs (median iota 0.14 to 0.16; the bound is 0.23 to 0.35 where realised regret from R2 is about 0). A 10-point pilot sees a median 52 to 67% of the inversion but, being a maximum over a subset, can never certify it. The probabilistic (quantile) version, which a guarantee with a stated probability needs, is open. `LOG.md`.
- **Milestone 7b (theory check): is a pilot-checkable halving bound valid, pilot by pilot?** (`experiments/theory/topk.py`, `topk_results.txt`). Random-pair quantiles from a 16-point pilot (7a) cover the realised halving regret in fewer than 80% of pilots in 6 of 40 group-start cells (worst 0.28, the ripple adder). A statistic aimed at the pairs that matter (the pilot's best 3 points against all other pilot points) covers in all 40 (minimum 0.81) but is a median 4.6 times the realised regret, and informative (under 0.1 log units) only for halving from the mapped rung at the relaxed clock (7 of 10 groups). Valid but only useful where the rung is already faithful; no proof for it yet, and the pilot is a third of a 50-point pool. `LOG.md`.
- **Milestone 7c (theory check): how small can the pilot be?** (`experiments/theory/sweep.py`, `sweep_results.txt`). Sweeping the pilot from 6 to 24 points and the "best few" from 1 to 5 on the same 20 groups: the top-3 bound covers the realised halving regret in 86% of regret-bearing cells at m = 6 and 99.5% at m = 24, but its median size grows with m (0.21 to 0.33 log units), so a bigger pilot buys coverage and costs informativeness. Coverage is far above the chance that the pilot holds one of the pool's best three (0.32 at m = 6), so that event is not what makes the bound valid; still empirical, no proof. `LOG.md`.
- **Milestone 24 (second corner): does the rung bias survive SKY130 ss_100C_1v60?** (`experiments/corner_ss/`, 1,200 runs of the milestone-1 protocol with only the liberty changed, `compare.py`). Routed-ADP rankings carry over poorly: median Spearman between corners 0.69, the tt-optimal sequence is still optimal in 8 of 20 design-clock cells and loses a median 3.4% (up to 27%) at ss. R1 stays rank-free (median tau -0.04); R2's median tau with routed falls from 0.71 to 0.60, and cells where picking on R2 alone costs over 10% go from 7 to 3 but on different designs. Limits: one extra corner, liberty only (wire parasitics unchanged), ten small designs. `LOG.md`.
- **Milestone 26 (strategy replay at ss): do halving and never-cut keep their ranking at SKY130 ss_100C_1v60?** (`experiments/corner_replay/`, the milestone 13 grid on the milestone 24 table, 400 paired seeds, no flow run). Not fully: at the tight clock chosen-eta halving beats random R4 only at 20 s and loses at 30 and 45 s (1.35% against 0.75%), where it won at every budget at tt; at the relaxed clock it ties or beats random and eta = 2 reaches 0.25% against 0.59% at 45 s, the clock that was bad at tt. An eta picked on tt beats random at ss relaxed and loses to it at ss tight. Limits: liberty-only corner, ten small designs. `LOG.md`.
