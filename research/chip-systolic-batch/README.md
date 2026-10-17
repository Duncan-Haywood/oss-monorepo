# chip-systolic-batch: does a larger batch let a systolic array catch a MAC-lane engine? (negative, 4-bit, stylised)

Follow-up to `chip-systolic` (itself a follow-up to `chip-accel`) in the LLM chip-design-loop track (`PROJECTS.md`, track 3). `chip-systolic` found that an R x C output-stationary systolic array loses to a MAC-lane engine on cells x cycles at batch R = 4 and guessed that a larger batch might favour the array. This project tests that guess by sweeping R = 4, 8, 16 at 4-bit weights. Produced with AI assistance (Claude). Preliminary and small: one toy 8-8-4 network, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic-batch/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The dataflow is the textbook systolic idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (bibliographic details confirmed by web search on 2026-10-13; the paper was not read in full here). The generator, model and flow code are copied from `research/chip-systolic` (same author, MIT), which in turn copies `model.py` and `baseline_gen.py` from `research/chip-accel`. Only `experiments/run.py` and the tests are new.

## Method
- Same RTL generator and the same Yosys script as `chip-systolic` (`synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops). Gate counts, not square microns.
- The array has R rows (one per batch vector) and C columns. Cycles per batch of R: `2 + sum over layers ceil(N/C) * (R + C + 7)`, checked in RTL for every configuration.
- Baseline: `chip-accel`'s P-lane engine handles one vector at a time, so a batch costs R x `cycles(P)`. Its area does not depend on R. These cycle counts follow the formula verified in `chip-accel`; they are not re-simulated here.
- Metric: cells x cycles per batch (lower is better), and the same divided by R.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy
cd research/chip-systolic-batch
PYTHONPATH=src python -m unittest discover -s tests     # about 1 minute
PYTHONPATH=src python experiments/run.py                # over an hour; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`, 4-bit weights)
For all 6 systolic configurations the RTL matched the integer NumPy reference on 32 vectors, and every measured cycle count equalled the formula. The tests also check a ragged tile (C = 3) at R = 8, and R = 16.

| R | best systolic (R x 4) cells x cycles | MAC lanes, best (P = 4) | systolic / MAC | cycles per batch: R x 4 array vs P = 4 |
|---|---|---|---|---|
| 4 | 310435 | 194184 | 1.6x | 47 vs 116 |
| 8 | 803698 | 388368 | 2.1x | 59 vs 232 |
| 16 | 2235356 | 776736 | 2.9x | 83 vs 464 |

- **Negative result.** The gap widens with batch size instead of closing. The array is faster per batch (83 against 464 cycles at R = 16), but its cell count grows almost linearly with R (6605, 13622, 26932 cells for R x 4), while the MAC-lane engine stays at 1674 cells. Cells x cycles per vector rises for the array (77608, 100462, 139709) and is constant for the MAC lanes (48546).
- Depth stays flat (41 to 49 for the array, 36 to 37 for the MAC lanes).
- In this design a larger batch costs area in proportion, so it does not favour the array. The sweep does not show that no systolic design wins.

## Limitations
- The array grows a row per batch vector. A fixed-size array fed several batches in turn, which is how real arrays are used, was not built. This probably makes the comparison unfavourable to the array at large R.
- Fan-in stays at 8; only batch size was swept. Only C = 2 and 4, 4-bit weights, and P = 2 and 4 were run. The 6- and 8-bit rows and C = 8 (which `chip-systolic` covers at R = 4) were dropped to keep the run within budget; a larger grid did not finish in over an hour.
- One network, one seed, one synthesis script, gate counts only: no clock period, power, memory or layout (see `chip-pnr`). Nothing here describes a fabricated chip.

## Next steps
A fixed-size array reused across batches; sweep fan-in (needs a generalised model); weight-stationary dataflow; a RAM-based weight store.

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-systolic` and `chip-accel` and is MIT-licensed.
