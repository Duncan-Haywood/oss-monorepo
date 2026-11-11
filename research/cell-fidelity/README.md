# cell-fidelity: when can a lithium-ion cell design search trust a reduced battery model (SPMe) instead of the full DFN model?

Research programme, track 16 (energy), opened 2026-11-11. Proposal: [`PROPOSAL.md`](PROPOSAL.md); log: [`LOG.md`](LOG.md). Produced with AI assistance (Claude). Results are modelled in PyBaMM on one parameter set (`OKane2022`), stack level, not a tested cell.

**Live page:** https://marisstella.app/research/cell-fidelity/

**Question.** Electrode design searches (thickness, porosity, N/P ratio) are cheap with a reduced electrochemical model (SPM, SPMe) and expensive with the full porous-electrode model (DFN). Which designs does the reduced model mis-score, can that be told from the reduced model's own output before any DFN call, and how much DFN budget does a search save by using that?

**Latest headline, milestone 2 dense benchmark (2026-11-11): the 2a result holds out of sample, and SPM beats SPMe.** On 128 fresh space-filling (Sobol) electrode designs, each run for 100 cycles under SPM, SPMe and DFN (384 PyBaMM runs, every cycle kept), **a 10-cycle DFN run ranks the designs by their 100-cycle DFN energy with Spearman 0.96, against 0.64 for a full 100-cycle SPMe run, at the same cost (3.6 s against 3.7 s)**. Screening with 10-cycle DFN finds the DFN-best design; screening with SPMe misses it at any shortlist up to 20, because SPMe ranks it 41st. Not planned: the simplest model, SPM, ranks better than SPMe (0.96), even on the designs SPMe completes (0.98 against 0.77; on 2a's 49 designs SPM led too, 0.863 against 0.834), and 12% of the space (15 of 128) is mis-scored by SPMe by more than 25%. For electrode design under cycling, the cycle count is the fidelity axis worth cutting, and the SPMe correction hurts ranking.

![Rank agreement with 100-cycle DFN against cost for each model and cycle count](experiments/cycles/cycles.svg)

**Milestone 2a (2026-11-11): stop the expensive model early instead of reducing it.** On milestone 1's 49 designs, ranking by the full DFN model's score at **cycle 10** agrees with the 100-cycle DFN ranking at **Spearman 0.977**, against **0.834** for a full 100-cycle SPMe run (paired bootstrap difference 0.138, 95% 0.057 to 0.271), and costs the same wall time (median 4.0 s against 4.1 s). DFN-verifying the top 5 by 10-cycle DFN finds the best design; the top 5 by SPMe misses it by 2.1 Wh/kg. Even a 2-cycle DFN run (1.4 s, Spearman 0.915) beats every SPM and SPMe rung.

![Spearman with 100-cycle DFN against wall time for SPM, SPMe and DFN stopped at 2 to 100 cycles](experiments/horizon/horizon.svg)

**Milestone 1 headline (2026-11-11).** On the 49 designs of [`energy-cell-dfn`](../energy-cell-dfn), SPMe's own minimum electrolyte salt concentration from a **2-cycle** run flags the designs whose 100-cycle SPMe score is more than 25% below DFN's with **ROC AUC 0.997** (95% bootstrap 0.980 to 1.000; 7 untrusted of 49). A flag at 10% of the initial salt concentration catches all 7 with one false flag. But the cost model the programme assumed is wrong: a 2-cycle run takes **SPMe 1.2 s and DFN 1.3 s**, and at 100 cycles **SPMe 3.9 s and DFN 27.9 s**. Cutting the cycle count saves 21x on DFN, swapping DFN for SPMe saves 7x, so the cheapest trustworthy screen may be a short DFN run rather than a reduced model.

![SPMe minimum salt concentration against the SPMe-DFN score gap](experiments/trust/trust.svg)

## Milestone 2: dense paired benchmark (128 Sobol designs)
Hypotheses logged before the run (`LOG.md`; this entry's H1 to H3 are its own, not milestone 1's). It ran in parallel with milestone 2a (below) and asks the same question out of sample: 2a used the 49 stratified designs, this a fresh unbiased sample. 128 designs from a scrambled Sobol sequence over the `energy-cell` bounds (seed 0), not chosen by any search. One 100-cycle run per design and model, one fresh process each; the score at cycle *n* is cycle *n*'s discharge Wh/kg from that run (an *n*-cycle run gives identical cycles: checked on the baseline, difference 0). The baseline reproduces `energy-cell-dfn` exactly (SPMe 109.14, DFN 116.26 Wh/kg). Target: DFN at cycle 100. DFN completed all 128 designs, SPM all 128, SPMe 121.

| Screen | Spearman with DFN@100 (95% CI) | Top-10 overlap | Regret, top-10 verified | Cost, s |
|---|---|---|---|---|
| SPM@2 | 0.941 (0.893–0.971) | 5 | 1.01% | 0.3 |
| SPM@100 | 0.955 (0.912–0.980) | 5 | 0% | 1.1 |
| SPMe@2 | 0.736 (0.581–0.873) | 6 | 0% | 0.9 |
| SPMe@100 | 0.641 (0.480–0.789) | 4 | 1.98% | 3.7 |
| DFN@2 | 0.942 (0.896–0.969) | 7 | 0% | 1.3 |
| **DFN@10** | **0.962 (0.932–0.977)** | 8 | 0% | 3.6 |
| DFN@30 | 0.980 (0.963–0.988) | 9 | 0% | 8.7 |
| DFN@100 | 1 | 10 | 0% | 24.5 |

All twelve cells are in `experiments/cycles/results.txt`. Costs are wall time on the baseline design, median of 3, idle machine.

| Hypothesis | Pre-registered test | Result |
|---|---|---|
| H1 DFN@10 ranks at least as well as SPMe@100 | difference ≥ 0 supports, < −0.05 refutes | **+0.32** (paired bootstrap +0.18 to +0.48): supported |
| H2 DFN@10 costs no more than SPMe@100 | ratio ≤ 1 supports, > 1.5 refutes | **0.98**: supported (narrowly) |
| H3 DFN@10 screen + top-10 verify within 1% of the best | regret ≤ 1% supports, > 2% refutes | **0%** (SPMe@100 screen: 1.98%): supported |

- **SPM beats SPMe (not planned).** Over the 121 designs SPMe completed, Spearman with DFN@100 is 0.984 for SPM and 0.769 for SPMe, so SPMe's poor ranking is not only its 7 solver failures. SPM over-scores by a median +7.1 Wh/kg, SPMe under-scores by −8.7, and SPM's error is the more uniform. SPM is still not a safe pick for the single best design: it scores the DFN best at 182.7 against 162.3 and its top-1 regret is 9.4%; from a top-5 shortlist the regret is 0.
- **SPMe gets worse with cycling.** Its agreement falls from 0.736 at 2 cycles to 0.641 at 100, while DFN's short runs converge on the 100-cycle ranking (0.942, 0.962, 0.980 at 2, 10, 30 cycles).
- **Milestone 1's flag out of sample (not planned).** On this unbiased sample, 15 of 128 designs (12%) are untrusted under SPMe (score 0 or more than 25% below DFN). SPMe's minimum salt concentration over its 100-cycle run flags them with AUC 0.994, and `r_min ≤ 0.1` catches all 15 with 8 false flags. Milestone 1's test used the 2-cycle minimum, so this replicates the signal rather than the exact test.
- **The DFN-best design** (124 µm positive, porosities 0.37 and 0.25, N/P 1.28 relative) scores 121.0 under SPMe, 41st of 128: an SPMe-guided search prunes it.

## Milestone 1: a trust flag from the cheap model's own solution
Hypotheses and the "untrusted" label were logged before the run (`LOG.md`).
- **Data.** The 49 designs in `energy-cell-dfn/experiments/selected.json` (baseline, each `energy-cell` search run's best, 36 spread over the SPMe ranking, 3 SPMe failures) and their committed 100-cycle SPMe and DFN scores (`dfn.jsonl`, not re-run). New: each design run under SPMe for 2 cycles of the `energy-cell` protocol (5 A discharge to 2.5 V, 5 A charge to 4.2 V, solvent-diffusion-limited SEI, irreversible plating), recording the minimum electrolyte concentration over space and time divided by the initial 1000 mol/m³ (`r_min`). A solver failure counts as `r_min = 0`.
- **Label.** Untrusted: SPMe scored 0, or `(DFN − SPMe) / DFN > 0.25` at cycle 100.

| Hypothesis | Pre-registered test | Result |
|---|---|---|
| H1 `r_min` classifies untrusted designs | AUC ≥ 0.90 supports, < 0.80 refutes | **0.997** (0.980–1.000); 0.994 over the 46 SPMe solved: supported |
| H2 `r_min` tracks the gap | Spearman ≤ −0.5 supports, > −0.3 refutes | **−0.833**: supported |
| H3 a 2-cycle SPMe run is cheap next to DFN | SPMe/DFN < 0.10 supports, > 0.25 refutes | **0.88** (1.2 s vs 1.3 s): refuted |

- **Thresholds.** `r_min ≤ 0`: 6 of 7 caught, 0 false flags. `≤ 0.10`: 7 of 7, 1 false flag (a design with a 17% gap). `≤ 0.30`: 7 of 7, 23 false flags. Three designs SPMe solves have a *negative* salt concentration (−0.026 to −0.038), which the reduced model allows and the full one cannot.
- **Cost.** Baseline design, fresh process per run, set-up included: 2 cycles SPM 0.3 s, SPMe 1.2 s, DFN 1.3 s (median of 3); 100 cycles SPM 1.0 s, SPMe 3.9 s, DFN 27.9 s (one run each, added after the plan). DFN's cost is in the cycling, not the set-up.
- **Screen-then-verify replay** (on the committed scores, so not a search): DFN on the top 10 by SPMe finds the DFN best of the 49 (163.0 Wh/kg); the top 1 to 5 find 160.9 (1.3% short). Adding the 8 flagged designs finds nothing better, since the designs SPMe mis-scores are not the optimum here; the flag matters because a search that believes SPMe prunes a region DFN cycles normally (`energy-cell-dfn`).

## Milestone 2a: cycle count as the fidelity axis
Hypotheses logged before the run (`LOG.md`). Each design was run once per model in a fresh process (SPM and SPMe for 100 cycles, DFN for 30), recording each cycle's discharge energy and the wall time at the end of each cycle (PyBaMM `on_cycle_end` callback, set-up included), so one DFN run gives the cycle 2, 10 and 30 rungs and their cost. Score at cycle n is the `energy-cell` score with `cycles = n`. The reference is the committed 100-cycle DFN score.

| Rung | Spearman with DFN@100 | median s | top-5 regret (Wh/kg) |
|---|---|---|---|
| SPM @ 10 / 100 | 0.865 / 0.863 | 0.4 / 0.9 | 0.0 / 0.0 |
| SPMe @ 10 / 100 | 0.883 / 0.834 | 1.1 / 3.7 | 0.0 / 2.1 |
| DFN @ 2 | 0.915 | 1.4 | 2.5 |
| **DFN @ 10** | **0.977** | **4.0** | **0.0** |
| DFN @ 30 | 0.990 | 10.2 | 0.0 |

(full table, k = 1 to 10, in `experiments/horizon/results.txt`; SPM's top-1 pick is 42 Wh/kg short.)

| Hypothesis | Pre-registered test | Result |
|---|---|---|
| H4 DFN@10 ranks DFN@100 well | Spearman ≥ 0.90 supports, < 0.834 refutes | **0.977**: supported |
| H5 DFN@10 costs no more than SPMe@100 | median ratio ≤ 1 supports, > 1.5 refutes | **0.98** (1.07 cycle-end to cycle-end): equal cost |
| H6 DFN@10 screens as well | top-5 regret ≤ SPMe@100's 2.1 | **0.0**: supported |

- **Why the reduced model loses.** SPMe's agreement peaks at cycle 10 and falls with horizon: its degradation (SEI, plating) path drifts from DFN's. DFN keeps 58 to 74% of its cycle-10 energy by cycle 100, so the early ranking holds through heavy fade.
- **The designs SPMe mis-scores.** Mean rank error on the 7 milestone-1 untrusted designs: 4.6 places under 10-cycle DFN, 16.3 under 100-cycle SPMe.
- **Negative.** Extrapolating DFN's fade linearly from cycles 2 and 10 to 100 ranks at Spearman 0.01; use the raw early score.
- **Reproduction.** SPMe 100-cycle re-runs match the committed scores exactly; a DFN 100-cycle re-run of the baseline matches its committed 116.256 Wh/kg.

## Limitations
- One parameter set, one protocol, one design cell; 49 designs chosen to spread over the SPMe ranking, so the AUC is on a stratified sample with only 7 positives (the bootstrap interval reflects that, not the design-space-wide rate).
- Three of the seven positives are solver failures, which any cheap screen would notice; over the four SPMe solved, the AUC is still 0.994.
- Wall times are one machine (4 cores), one design for the cost table, one run each at 100 cycles. DFN's memory use (4 to 13 GB per 100-cycle run in `energy-cell-dfn`) is not measured here.
- Milestone 2a reuses the same 49-design stratified sample and one machine's serial timings (4 cores, `OMP_NUM_THREADS=1`); the Spearman intervals are over these designs, not the design space. Whether 10 cycles suffice under faster-fading protocols or other parameter sets is untested.
- Milestone 2's costs come from the baseline design only; DFN runs on thick, dense designs took up to 67 s in the benchmark (three at a time, so not used for cost), so the DFN@10 against SPMe@100 parity (ratio 0.98) may not hold everywhere. One Sobol sample of 128, one seed.
- Neither model is validated on the `OKane2022` designs; `energy-cell-dfn` checked both against measured curves of two other cells.

## Next steps
The dense benchmark (`experiments/cycles/bench.jsonl`, every cycle of SPM, SPMe and DFN on 128 Sobol designs) is the cache milestone 4's search comparison replays: cycle count and model as a two-axis fidelity space, with short DFN and SPM as cheap rungs, against GP-EI on DFN, Hyperband and BOCA-style baselines. Milestone 3's theory now has two questions: why early DFN rankings converge, and why the SPMe correction ranks designs worse than SPM under cycling. Grow the benchmark past 128 designs to pin down the 12% untrusted rate, then transfer to other parameter sets (`PROPOSAL.md`, Milestones).

## Reproduce
From this directory, with numpy and pybamm (PyBaMM 26.10.1.1 here):
`python experiments/trust/run.py probe` (about 1 minute), `cost`, `cost100` (about 40 s), `report`, then `python experiments/trust/figure.py` (stdlib only). Milestone 2a: `python experiments/horizon/run.py sweep` (147 runs, about 17 minutes serial here), `check` (about 1 minute), `report`, then `python experiments/horizon/figure.py`. Tests: `pytest tests` (stdlib only; read the committed files).
Milestone 2: `python experiments/cycles/run.py prefix`, `cost` (about 3 minutes), `bench` (384 runs, about 45 minutes on 4 cores, resumable), `report`, then `python experiments/cycles/figure.py`.

## Builds on
`research/energy-cell` (design space, protocol, parameters and code, imported unchanged) and `research/energy-cell-dfn` (designs and committed scores); PyBaMM (Sulzer et al. 2021, doi:10.5334/jors.309); SPMe (Marquis et al. 2019, doi:10.1149/2.0341915jes); DFN (Doyle, Fuller and Newman 1993, doi:10.1149/1.2221597); `OKane2022` (O'Kane et al. 2022, doi:10.1039/D2CP00417H) on Chen et al. 2020 (doi:10.1149/1945-7111/ab9050). These were checked against PyBaMM's `CITATIONS.bib` and resolve with `cite_check.py` (2026-11-11, `cite_check.json`). No group in `prompt.md` covers battery design, and none is claimed.
