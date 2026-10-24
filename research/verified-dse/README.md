# verified-dse: how much of a chip design search can cheap fidelity rungs save, with a guarantee?

Research programme on multi-fidelity, verification-aware design-space search for
open-source chip flows (Yosys, ABC, OpenROAD) on SKY130. **Status: milestones 1 and 2 done.
The cheap rungs are measurably biased against routed area x delay; the search and
guarantee parts (H2 to H5) are not yet run.** Produced with AI assistance (Claude Code).
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

## Contents
- [`PROPOSAL.md`](PROPOSAL.md): related work (12 checked ids), gap, hypotheses H1 to H5, evaluation, milestones, target venue (MLCAD).
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
- Limits: a pool of about 50 sequences per design makes every strategy converge to 0 regret, so this is the small-budget end only; NSGA-II, Hyperband, BOHB and BO are not yet run. Code and log: `experiments/search_baselines/`, `LOG.md`.
