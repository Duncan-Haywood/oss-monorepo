# eda-conehash: do fan-in cone features of a mutant predict which survivors Yosys can prove equivalent? (follow-up to `eda-conefeat`, track 7)

Why it seemed worth doing: `eda-conefeat` found that whole-design cell counts do not predict which of the 27 `eda-verify` simulation survivors Yosys proves equivalent, and named the sharper features as its next step: the fan-in cone of what the mutation changed. Cell counts blur an edit across the design; a cone hash localises it. Produced with AI assistance (Claude). Stylised and preliminary: 27 mutants of one design (the `chip-accel` MAC engine, p = 8, 4-bit). The headline is negative again.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-conehash/

**Builds on.** `research/eda-conefeat` (scoring, survivor table, mutant sampling), `research/eda-equivpredict` (the 25 of 27 line rule), `research/eda-verify` (mutants, formal verdicts), `research/chip-accel`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- Golden and each mutant: Yosys 0.33, `proc; flatten; memory_map; opt; techmap; opt_clean -purge; write_json`. No ABC, so a local edit stays local (an ABC pass was not tried for this reason, not compared).
- A *sink* is a flip-flop (its type, which encodes reset value and polarity, and its D, enable and reset cones) or an output-port bit; 196 in the golden design. Flip-flop outputs and ports keep source names, so a sink's Merkle hash over its combinational cone, with named bits as leaves, can be compared between golden and mutant. A sink is *changed* if its hash differs.
- Features, fixed before looking at labels: `n_changed`, `cone_gates` (distinct gates in the changed cones), `cone_depth`, `cone_leaves` (named bits read), `fwd_sinks` (sinks reached forward through the register graph from the changed ones), `reaches_out`.
- Scored as in `eda-conefeat`: AUC for "provably equivalent", and a one-split rule under leave-one-line-out, the score `eda-equivpredict` uses.
- A bug caught on the first run: the sink hash initially ignored the flip-flop type, so reset-value edits (`grp <= 0` to `grp <= 1`) looked unchanged. The fix is in `src/eda_conehash/cone.py` and covered by a test; the numbers below are from the fixed version.

## Reproduce
```bash
sudo apt-get install -y yosys && pip install numpy     # numpy only for the eda-harness generator
cd research/eda-conehash
python experiments/measure.py     # about 1.5 minutes on 4 cores; writes experiments/features.jsonl
python experiments/analyse.py     # stdlib only; writes experiments/results.txt
python experiments/figure.py      # writes experiments/cones.svg
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`, per-mutant `experiments/features.jsonl`, figure `experiments/cones.svg`)
- Under leave-one-line-out no cone feature beats the majority class (16 of 27, 59.3%): `n_changed` 13, `cone_depth` 13, `cone_gates` 12, `cone_leaves` 11, `reaches_out` 7, `fwd_sinks` 2. The line rule gets 25. In-sample AUC is highest for `n_changed` (0.74) and `cone_leaves` (0.68).
- `fwd_sinks` and `reaches_out` carry almost nothing: every changed cone feeds 184 or 195 of the 196 sinks and an output in 26 of 27 cases, because the design is one FSM-driven datapath.
- Seven survivors change exactly one sink. All are literal edits on lines 123 and 125, and none is provably equivalent (6 undecided, 1 killed by formal). Equivalent mutants change 0, 7 or 32 or more sinks. This pattern was seen after the table existed, so it is a hypothesis, not a tested rule: the seven sit on two lines, so a leave-one-line-out test cannot separate it from the line effect.
- One mutant (`op@140`, `>>>` to `>>`) changes no sink and is equivalent, so a structurally identical netlist can be equivalent here; the converse (changed but equivalent) is common.
- Reading: on this design, cone size and depth do not stand in for source position either, and the part of the line signal they might explain is confounded with the line.

## Limitations
- 27 survivors, 11 lines, one design, one solver with timeouts. One-split rules on one feature at a time are the weakest fair test; no multi-feature model was fitted (27 points would not support one).
- Merkle hashes compare structure, not function, so a changed cone can still be functionally identical; that is what "equivalent" survivors with large changes show.
- The single-sink pattern is post hoc and confounded with the line, as above.
- `techmap` without ABC is a coarse gate library (muxes dominate: 14.7k of 30.5k cells).

## Next steps
Repeat on `chip-systolic`, a second design family where line number carries no information, so the single-sink hypothesis can be tested out of line. Features that describe the solver's difficulty (induction depth needed) rather than the netlist's size.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 (apt); NumPy (pip) for the `eda-harness` generator. All code original, MIT.
