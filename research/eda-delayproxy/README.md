# eda-delayproxy: can a library-free delay estimate rank accelerator designs by SKY130 critical-path delay better than logic depth?

Why it seemed worth doing: `eda-sky130rung` found that generic gate count ranks SKY130-mapped area almost perfectly (Spearman 0.995) but generic logic depth ranks mapped delay at only 0.611, and listed "is delay generally the unreliable cheap rung?" as open. Before paying for a cell library (or a mapper run) per design, is there a cheap delay proxy computed on the same generic netlist that fixes it? This asks a new question of the `eda` track instead of another proposer or surrogate variant. Produced with AI assistance (Claude). **Preliminary:** one design family, one ABC script, no place and route, so nothing here is sign-off or silicon.

**Headline.** Depth fails because it ignores load. Adding fan-out to the path delay lifts the rank agreement with SKY130-mapped delay from 0.611 to 0.83 (logical effort with the real fan-out) and 0.90 (a one-line fan-out model). Gate-type weights alone do nothing (0.609). But the proxy that wins on the whole is just gate count (0.911), so on this family "delay" is mostly "size", and the proxies still do not recover the 5-bit design that joins the true (area, latency) front.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-delayproxy/

**Builds on.** `research/eda-sky130rung` (the 40 mapped designs and their ABC `stime` delays, read from its committed `mapped.json`), `research/eda-harness` (the design generator) and `research/chip-accel`. Logical-effort constants: Sutherland, Sproull and Harris, *Logical Effort: Designing Fast CMOS Circuits* (Morgan Kaufmann, 1999), Table 1.1. Fidelity-ladder framing: Peherstorfer, Willcox and Gunzburger (2018), *SIAM Review* 60(3):550-591. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- `src/eda_delayproxy/proxy.py` reads the Yosys `write_json` of each design's generic netlist (`synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`, the harness's own script), cuts at flip-flops, and finds the longest source-to-sink path under a per-gate delay: `unit` (1 per gate, equals `eda-harness`'s `ltp` depth, checked on all 40 designs), `type` (logical-effort delay of each gate type at fan-out 1), `fanout` (1 + 0.5 per extra load, type-blind; the 0.5 is a round figure of mine, not sourced), `le` (logical effort d = g·h + p with h = fan-out; NAND2 g 4/3 p 2, NOR2 5/3 and 2, XOR/XNOR 4 and 4, MUX2 2 and 2, inverter 1 and 1; AND/OR as a NAND/NOR stage plus an inverter; ANDNOT/ORNOT approximated as AND/OR).
- `experiments/run.py` builds the 40 netlists and every proxy; `experiments/analyze.py` ranks each against the mapped delay (Spearman, Kendall, 2,000-resample bootstrap over designs), sweeps 200 random per-gate-type scalings (log-uniform 0.5 to 2) of the logical-effort delay, fits leave-one-out log-linear models, and replays the clock-period decision (area × cycles × delay with the proxy in place of the mapped delay).

## Reproduce
```bash
sudo apt-get install -y yosys && pip install numpy matplotlib
cd research/eda-delayproxy
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src:../eda-harness/src:../chip-accel/src python experiments/run.py   # about 4 minutes, no PDK needed
cd experiments && PYTHONPATH=../src:../../eda-sky130rung/src python analyze.py
```

## Results (`experiments/results.txt`, data `experiments/proxies.json`)
Yosys 0.33; mapped delay is `eda-sky130rung`'s ABC `stime` on SKY130 HD tt_025C_1v80 (ORFS `e5cc6e799f`). 40 designs, p = 1..8 lanes, 4 to 8 bits.

| proxy (vs mapped delay) | Spearman | 95% interval | Kendall |
|---|---|---|---|
| generic depth (unit delay) | 0.611 | 0.359 to 0.805 | 0.465 |
| gate-type weights, fan-out 1 | 0.609 | 0.361 to 0.797 | 0.450 |
| logical effort, real fan-out | 0.829 | 0.671 to 0.910 | 0.646 |
| fan-out only (1 + 0.5 per extra load) | 0.904 | 0.809 to 0.950 | 0.741 |
| largest fan-out | 0.893 | 0.790 to 0.937 | 0.719 |
| gate count | 0.911 | 0.816 to 0.957 | 0.756 |

- **Gate type is not the missing term; load is.** Weighting gates by type leaves depth where it was (0.609 vs 0.611). Every one of 200 random type scalings of the fan-out-aware model beats unit depth (min 0.667, median 0.809, max 0.911), so the result does not hang on the logical-effort constants.
- **Fitted combinations.** Leave-one-out fits of log delay: depth alone 0.565 (median error 14%); logical effort alone 0.812 (9.8%); logical effort + gate count 0.912 (6.1%); all four features 0.926 (7.0%).
- **Size confound.** Gate count alone ranks delay at 0.911 with the same interval as the best purpose-built proxy. In this family bigger designs have more lanes and wider operands, hence more fan-out on shared operand and control nets; a delay model cannot be told apart from a size model here.
- **The decision.** Replacing the mapped delay by a proxy in area × cycles × delay, the rank agreement with the true objective is 0.918 (depth), 0.968 (logical effort, fan-out) and 0.978 (fan-out only), but 0.904 with no clock term at all. All proxies find the same best design as the truth (p4w4, except gate count: p2w4), and every proxy's (area, latency) front matches the true one in 3 of 4 designs: none finds the 5-bit p2w5 that the truth adds, and the depth-type ones keep the slow p8w4 the truth drops. Top-5 overlap with the true objective: 0.6 (depth, logical effort), 0.8 (fan-out only, gate count).
- Figure: `experiments/proxies.png`.

## Limitations
- One design family from one generator and one ABC script (`strash; dc2; map`); the 0.611 itself may be script-specific, and a different family (the `chip-systolic-*` arrays, `eda-flowtune`'s eight designs) may rank differently. No claim that fan-out beats depth generally.
- The "truth" is ABC's `stime` on a mapped netlist, with no wire load, placement or clock tree; a post-route delay could rank designs differently (OpenROAD is not installed here). Open-flow numbers are estimates, not sign-off results.
- The fan-out model's 0.5 coefficient is not sourced; the logical-effort constants are, and the weight sweep shows the conclusion does not depend on them, but the ANDNOT/ORNOT approximation and the unit fan-out capacitance are mine.
- 40 points with a shared structure (lanes × bits), so the bootstrap over designs understates the real uncertainty about new families; the LOO fits use the same 40.

## Next steps
Repeat on `chip-systolic` and `eda-flowtune`'s designs to separate "delay" from "size"; add a post-route delay rung when OpenROAD is available; test whether a fan-out-aware proxy as a screen in `eda-screen`'s loop saves mapping runs.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 (apt); NumPy for the design generators and the LOO fit; matplotlib (figure only). The mapped delays come from `eda-sky130rung`'s committed data. All code original, MIT.
