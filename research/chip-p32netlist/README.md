# chip-p32netlist: at which Yosys stage does the P = 32 versus P = 16 cell gap appear? (localised, mechanism unexplained, stylised)

Follow-up to `chip-macp32cells` (track 3, `PROJECTS.md`), whose next step was "inspect which cells of the extra lanes survive". That project showed the 32-lane MAC engine has fewer generic-gate cells than the 16-lane one at identical cycles (16 hidden units, so lanes 16 to 31 do no work) and that the sign flips with the abc flow. This one asks *where in the flow* the gap is created. Produced with AI assistance (Claude). Preliminary and small: F = 16, three model seeds, Yosys 0.33, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-p32netlist/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection is claimed. `model.py` and `baseline_gen.py` are copied unchanged (MIT, same author) from `research/chip-macp32cells`; `flow.py` and `experiments/run.py` are new.

**Correction (`chip-p32passes`).** In Yosys 0.33 `synth -run :abc` runs the whole script including `abc -fast`, so the "fine" column below is *after* a first abc call, not before. Run pass by pass, the gap is already -114 to -125 cells before any abc; see `research/chip-p32passes`.

## Method
Generate the F-16-4 MAC engine for P = 16 and 32, three seeds, and count cells after three points of one Yosys script: **coarse** (`synth -flatten -run :fine`, word-level cells), **fine** (`-run :abc`, after techmap to bit-level gates, before abc) and **abc** (flow A of `chip-macp32cells`: `synth -flatten; abc -g <nine gates>; opt_clean`).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog python3-numpy    # Yosys 0.33 here
cd research/chip-p32netlist
PYTHONPATH=src python3 -m unittest discover -s tests    # about 20 s
PYTHONPATH=src python3 experiments/run.py               # about 2.5 min on 4 cores; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`; P = 32 minus P = 16, in cells)

| seed | coarse (word-level) | fine (bit-level, pre-abc) | abc |
|---|---|---|---|
| 0 | +638 | -514 | -406 |
| 1 | +773 | -522 | -383 |
| 2 | +640 | -498 | -271 |

- **The sign reverses between the word-level and bit-level netlists, not inside abc.** At the word level the 32-lane engine is 640 to 770 cells *larger* (it has 32 multiplier/adder lanes to 16). After techmap and bit-level opt it is about 500 cells *smaller* in all three seeds, and abc then only shaves 110 to 230 cells off the gap, leaving it the same sign. So the effect seen in `chip-macp32cells` is mostly set before abc runs; the abc library only moves its size.
- Total flip-flops are 368 in both engines before abc; abc's final clean-up leaves 364 (P = 16) and 363 (P = 32), with the 32-lane engine's flip-flops split differently across enable/reset types (seed 0: 294 + 64 against 359).
- Coarse cell counts cannot be compared across designs as area: one word-level multiplier is one cell.

## Limitations
- Which transformation between coarse and fine (alumacc/techmap of the `$macc`/`$mul` cells, constant propagation through the ROM functions that return 0 for lanes `n >= 16`) removes the extra lanes more completely at P = 32 was *not* identified. This project localises the effect to that span; it does not explain it, and it does not say whether P = 16 or P = 32 is "more correct".
- One Yosys version, one task size (F = 16), generic-gate counts rather than area, no timing or layout.

## Next steps
Run `synth` one pass at a time between `coarse` and `fine` (Yosys `-run` labels, or a manual `opt`/`techmap` sequence) to name the pass; compare against the Yosys version in a newer release.

## Owner steps
None needed.

## Outside dependencies
Yosys (apt), NumPy. No LLM API, OpenROAD or PDK. MIT-licensed.
