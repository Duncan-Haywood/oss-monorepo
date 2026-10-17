# eda-conefeat: do synthesized-netlist features predict which survivors Yosys can prove equivalent? (follow-up to `eda-equivpredict`, track 7)

Why it seemed worth doing: `eda-equivpredict` reaches 93% by keying on the mutated source line, and says that rule cannot transfer to another file; a predictor for a new design needs structural features. Yosys and Icarus Verilog are now installable here (`apt`), so this project computes such features for the same 27 survivors and asks whether they carry any signal. Produced with AI assistance (Claude). Stylised and preliminary: 27 mutants of one design (the `chip-accel` MAC engine, p = 8, 4-bit). The headline is negative.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-conefeat/

**Builds on.** `research/eda-equivpredict` (survivors, labels, leave-one-line-out scoring), `research/eda-equivinterval` (the 92.6% to compare with), `research/eda-verify` (mutants and formal verdicts), `research/chip-accel`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- Regenerate each survivor's mutant exactly as `eda-verify` sampled it (same seed; the log's `i` indexes the sampled list, since mutant ids alone repeat).
- Per mutant, with Yosys 0.33: `proc; flatten; memory_map; opt; synth -flatten; stat` for the cell count and cell-type histogram, and the same miter `eda-verify`'s formal stage builds (cells after `opt`). Features: `delta` (mutant minus golden cells; golden is 3,531), `abs_delta`, `cells`, `miter`, `same_types` (histogram identical to golden). None uses the source line.
- Score each feature as a ranking (AUC for "provably equivalent" against the rest) and as a one-split rule under leave-one-line-out, the score `eda-equivpredict` uses. Label: Yosys `equiv_induct` proof, as logged in `eda-verify` (16 equivalent, 9 undecided, 2 killed by formal).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog && pip install numpy
cd research/eda-conefeat
python experiments/run.py        # about a minute on 4 cores; writes experiments/features.jsonl
python experiments/analyse.py    # stdlib only; writes experiments/results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`, per-mutant `experiments/features.jsonl`)
- Under leave-one-line-out, no feature beats guessing the majority class (16 of 27 = 59.3%): the best one-split rule, on `abs_delta`, gets 16 of 27; `delta` and `cells` get 5, `miter` 1, `same_types` 7. The line predictor gets 25 of 27.
- `abs_delta` ranks well in-sample (AUC 0.79) because the nine undecided survivors barely change the netlist (|delta| 0 for six, then 1, 2, 37), while equivalent mutants span 0 to 178. A threshold fitted on other lines does not carry over, since the line groups differ in size and sign.
- The miter is almost the same size for every mutant (1,188 to 1,199 cells), so solver difficulty is not visible in miter size here.
- Ten mutants leave the cell count unchanged: 3 equivalent, 6 undecided, 1 killed. Of the two with an identical cell histogram, one is equivalent and one (a ROM edit) is killed by formal, so "netlist unchanged" does not mean "equivalent" after `synth`.
- Reading: on this design the cheap cell-count features do not replace source position, and the line signal in `eda-equivpredict` is not explained by them. It does not show that richer features (cone depth, fan-in of the mutated register, a structural hash of the fan-in cone) would also fail.

## Limitations
- 27 survivors, 11 lines, one design, one solver and timeouts. A one-split rule on a single feature is the weakest fair test; cone depth and fan-in per mutated register were not computed.
- Cell counts come from whole-design synthesis (generic gates, no ABC technology mapping) and change globally with small edits, so they are a blunt proxy for the size of the affected cone.
- Features were chosen with the label table in view; the negative result is therefore not inflated by that, but a positive one would have been.

## Next steps
Per-mutant cone features (fan-in cone of the changed net: gates, depth, registers reached), then repeat on `chip-systolic`, a second design family, where line number carries no information.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 and Icarus Verilog 12.0 (apt, only `yosys` used here); NumPy (pip) for the `eda-harness` generator. All code original, MIT.
