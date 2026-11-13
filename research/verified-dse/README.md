# verified-dse: how much of a chip design search can cheap fidelity rungs save, with a guarantee?

Research programme on multi-fidelity, verification-aware design-space search for
open-source chip flows (Yosys, ABC, OpenROAD) on SKY130. **Status: milestones 1 to 118 done;
the full list is in [`LOG.md`](LOG.md), newest first. Headline results so far:**
- **Cheap rungs mis-rank routed area x delay** (generic-gate tau-b median -0.04; the mapped rung is
  nearly exact only at a relaxed clock): [`experiments/rung_bias/`](experiments/rung_bias/results.txt).
- **Successive halving does not reliably beat random routed search** once budgets exceed a few
  hundred seconds: it stops at a rung-bias floor, and one cut rung can leave a cell at 6.9% regret
  where random routing reaches 0.2% (milestone 68, [`experiments/bohb/`](experiments/bohb/results_unfaithful.txt)).
  A simple no-R2-cut arm is as good as a five-point pilot gate
  ([`experiments/pilot_gate/`](experiments/pilot_gate/results.txt)).
- **A theorem bounds halving's regret by the cut rungs' inversions**, and a pilot with ratio below 1
  certifies the search returns a cost no worse than the pilot's best point (0 violations in about
  1.5 million draws, milestones 96 and 97), a ceiling about 2.7 times the realised regret; it says
  nothing relative to the unknown optimum (still open). The chance a pilot yields such a ceiling plateaus near 0.45 from about 24 points (milestone 99): a bigger pilot tightens it, not makes it likelier.
- **On a fresh 120-sequence pool (milestone 108), the schedule chosen without peeking holds out**: "skip the
  generic-gate rung, score everything at the mapped rung, keep 8, route 8" has mean routed regret 1.04% against
  5.49% for the hand-chosen three-rung schedule and 8.00% for random routing of 8; the gap is one tie-heavy design
  (a ripple adder whose generic-gate cut discards the optimum, 34 to 40% regret) and one barrel-shifter cell, and
  elsewhere the two are equal: [`experiments/fresh_pool/`](experiments/fresh_pool/results.txt).
  Priced at equal wall-clock (milestone 109), it costs 0.69 of routing everything and edges random routing of the
  same cost only slightly (1.04% against 1.26% regret, better in 14 of 20 cells, sign test p = 0.12); the hand-chosen
  schedule loses to its equal-cost random baseline (5.48% against 1.43%):
  [`experiments/fresh_pool/price_results.txt`](experiments/fresh_pool/price_results.txt).
- **On 26 held-out designs (milestone 110), the ladder pays where routing is dear.** Where a routed point costs more than
  3 times a mapped score (16 to 40-bit multipliers, a crossbar, a GF(2) matrix), "skip r1, keep 8" costs a quarter of
  routing everything and beats random routing of the same wall-clock (2.07% against 3.59% mean regret, 18 of 23 cells).
  Where routing is cheap, random routing is safer (1.29% against 6.21%), because a misleading mapped rung sends the
  ladder to a bad 8: over all 52 cells it wins 37 and loses 13 (sign test p = 0.001) but loses on the mean (4.38% against
  2.31%): [`experiments/heldout_designs/`](experiments/heldout_designs/results.txt).
- **A rule fixed before any routing (milestone 111): time one point, run the ladder only if routing costs over 3x a
  mapped score, else route randomly.** Chosen by leave-one-design-out on the 26 held-out designs (every fold picks 3), it
  has 1.66% mean regret against 2.29% for random routing and 4.38% for always running the ladder, at the same wall-clock,
  and its worst cell is 13% instead of 50%. Testing the mapped rung on a small routed pilot (tau-b on 3 to 6 points) does
  not help; routing a few random points inside the ladder's budget hedges as well. On the small designs it costs 0.17
  points against always running the ladder, within noise: [`experiments/switch_guard/`](experiments/switch_guard/results.txt).
- **The rule's ladder branch holds on fresh data where routing is dear (milestone 112, flow run).** 120 new pass sequences on
  six designs where a routed point costs 3.6 to 19.5 times a mapped score (12 cells, about 103 points each, newer tools):
  "score everything at the mapped rung, route the best 8" has 1.05% mean regret against 3.16% for random routing of the
  same wall-clock (better in 9 cells, worse in 3; design bootstrap interval of the difference -3.95 to -0.06 points). The
  six-point random hedge milestone 111 preferred by 0.07 points in-sample is worse than random routing here (3.55%), so it
  is dropped from the rule; relaxed-clock 24-bit multipliers and a crossbar remain the failures:
  [`experiments/fresh_dear/`](experiments/fresh_dear/results.txt).
- **The switch holds on eight designs no table had run (milestone 113, flow run).** Unseen multiplier widths, a squarer (a new
  family), a 32-port crossbar, a 64-bit GF(2) matrix, a 32-bit adder, popcount and barrel shifter, 120 fresh sequences, both
  clocks: the rule, with theta = 3 fixed in advance, has 0.91% mean regret against 2.64% for random routing and 1.44% for
  always running the ladder (better than random in 9 of 16 cells, worse in 1, sign test p = 0.02). Each branch picked the
  better policy on average; the one miss is a relaxed-clock 18-bit multiplier (10.5%), the family's known failure:
  [`experiments/fresh_designs/`](experiments/fresh_designs/results.txt).
- **No guard from the mapped rung alone (milestone 114, no flow run).** A guard on the mapped slack and delay spread, chosen
  on the held-out cells (where it caught exactly the five failing relaxed multipliers, 1.66% to 1.25% leave-one-family-out),
  missed both relaxed multipliers on 28 fresh dear-pool cells and raised regret from 0.97% to 1.16%: the spread is a property
  of the sequence pool, not the design, and the stable slack does not separate the failures. The switch stays the rule:
  [`experiments/r2_guard/`](experiments/r2_guard/results.txt).
- **A mapped score clipped at the clock fixes the relaxed-clock multiplier miss, blind (milestone 115, flow run).** At a relaxed
  clock the routed flow repairs timing up to the period and stops, so routed delay is the period (median 0.993 to 1.000 of it
  on every relaxed multiplier and squarer) and routed area x delay ranks by area alone; the mapped score keeps rewarding mapped
  speed nobody will see. Scoring a point as area x max(period, 1.25 x mapped delay), chosen on the 52 held-out cells (1.66% to
  0.77% in-sample; 1.66% leave-one-family-out, since the gain is all in one family), then run blind on seven new designs
  (1,680 flow runs, predictions committed first): the switch's mean regret falls from 2.73% to 0.83%, better in 5 cells and
  worse in none, every relaxed cell on the ladder at 0.00% (mult26 9.58%, sq24 11.30% before); design bootstrap interval of the
  difference -3.63 to -0.41 points. All six predictions held. It can hurt where routed delay sits far below the period: on an
  earlier, already seen table it sent barrel128 relaxed from 0.00% to 19.2%:
  [`experiments/clip_score/`](experiments/clip_score/results.txt).
- **The switch's routed pilot cannot tell when to clip (milestone 116, flow run, negative).** A guard that keeps the clip only
  when the timing pilot's routed delay is at least 0.9 of the period, fixed by mechanism before five blind designs ran (1,200
  flow runs): the pilot share does separate barrel shifters (0.41 to 0.59) from multipliers and squarers (1.00), but the clip
  helped on two of three blind relaxed barrels (barrel192 8.21% to 0.00%, barrel256 8.66% to 0.00%) and hurt on one (barrel96,
  3.18% to 9.42%). Blind mean regret: unguarded clip 2.69%, guarded 3.76%, plain switch 5.58%, equal-cost random 3.28%. Over
  all 124 cells of milestones 110 to 116 the unguarded clip has 1.02% against 1.87% for the plain switch and 2.36% for random
  routing, so it stays the rule: [`experiments/pilot_clip/`](experiments/pilot_clip/results.txt).
- **Counted by what each rule had seen, the clip is what beats random routing (milestone 117, no flow run).** The plain
  switch (theta fixed in milestone 111) is level with equal-cost random routing on the 20 designs it had not seen (2.71% against
  2.80% mean regret, 40 cells). The clipped switch (alpha fixed in milestone 115) has 1.60% against 2.91% on its only test cells,
  the 24 of the 12 designs run blind in milestones 115 and 116: better in 18, worse in 5 (sign p = 0.011), design-bootstrap
  interval of the difference -2.45 to +0.22 points, so not yet significant across designs. Squarers, multipliers and crossbars
  carry the win; wide barrel shifters split 3 to 3: [`experiments/switch_pooled/`](experiments/switch_pooled/results.txt).
- **On three families no table had run, the clipped switch loses to random routing because of one shifter (milestone 118,
  flow run, mostly negative).** Funnel shifters, FIR tap sums and CORDIC stages; six designs and eight predictions committed
  before 1,440 flow runs. Blind mean regret: clipped switch 8.34%, plain switch 9.19%, equal-cost random 2.48%. funnel128's
  routed-best point ranks 70.5 of 103 on the mapped score, so a top-8 ladder costs it 39 to 51% at both clocks. FIR and the
  larger CORDIC go to 0.00 to 1.31%. Over the clipped switch's 36 test cells it is better than random in 22 and worse in 11, but
  the design-bootstrap interval is -1.68 to +5.55 points. Without the two shifter families (post hoc) it is 0.79% against
  2.59%, interval -2.53 to -1.03. A 4-point rank-agreement guard halves the funnel loss but does not fix it:
  [`experiments/new_families/`](experiments/new_families/results.txt).
- **Proof success (H5) is predicted by design size, not by the rewrite**; it is not testable on this benchmark as built.
- Limits: one corner and utilisation, global-route estimates, cached tables from tens of designs.

Produced with AI assistance (Claude Code).
It builds on none of the CU Boulder groups and claims no affiliation.

**Live page:** https://marisstella.app/research/verified-dse/

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
# Milestones 108 to 113 use Yosys 0.70 and OpenROAD 26Q3 instead (about a minute from the nixpkgs cache; put both bin/ dirs on PATH):
#   nix --extra-experimental-features 'nix-command flakes' build --no-link --print-out-paths nixpkgs#openroad nixpkgs#yosys
# Those flows run 1 to 2 hours on 4 cores: in a cloud session start them in the background with a long timeout, and use --resume if one stops.
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
