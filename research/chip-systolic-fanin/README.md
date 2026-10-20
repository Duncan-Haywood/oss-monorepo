# chip-systolic-fanin: does a wider fan-in let a small systolic array catch a MAC-lane engine? (negative, 4-bit, stylised)

Follow-up to `chip-systolic-small` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). That project found the best small array 1.35x worse than 4 MAC lanes on cells x cycles per vector at fan-in 8, and listed "sweep fan-in" as a next step. This project makes the network F-F-4 and runs F = 8, 16 and 32. Produced with AI assistance (Claude). Preliminary and small: one toy network family, one seed, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic-fanin/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The dataflow is the textbook systolic idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (details as cited in `chip-systolic-batch`; the paper was not read in full here). The generators, model and flow are copied (MIT, same author) from `research/chip-systolic-small`, then generalised from fan-in 8 to a parameter F (index and counter widths, accumulator width `2*WB + 2 + ceil(log2 F)`, cycle formulas). `experiments/run.py`, the tests and this README are new.

## Method
- Network F-F-4: F inputs, F hidden ReLU units, 4 outputs, trained on 4 Gaussian clusters in F dimensions; both layers have fan-in F. 4-bit weights.
- Arrays: output-stationary R x C with (R, C) = (1,2), (1,4), (1,8), (2,4). MAC engine: P = 2, 4, 8 lanes (`chip-accel`'s design).
- Cycles per batch of R: `2 + sum over layers ceil(N/C) * (R + C + F - 1)`; MAC engine: `2 + sum ceil(N/P) * (F + 1)`.
- Each array is simulated in Icarus on 32 vectors (32/R back-to-back batches on one instance), compared bit for bit with the integer NumPy reference, and its measured cycles compared with the formula. MAC-lane cycles come from the formula and are not simulated here.
- Synthesis: Yosys `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops (gate counts, not square microns). Metric: cells x cycles per vector (lower is better).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy
cd research/chip-systolic-fanin
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src python experiments/run.py                # about 15 minutes; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
All 12 array configurations matched the NumPy reference and the cycle formula.

| F | best array (cells x cycles/vec) | best MAC engine | array / MAC |
|---|---|---|---|
| 8 | 1x4: 63650 | P=4: 46835 | 1.36 |
| 16 | 2x4: 236737 | P=8: 188998 | 1.25 |
| 32 | 1x8: 1028988 | P=8: 816964 | 1.26 |

- **Negative result.** At every fan-in tried the best MAC engine beats the best array. The gap narrows from 1.36x at F = 8 to about 1.25x at F = 16 and 32, but does not close, and it does not keep narrowing from 16 to 32. A likely reason, not tested here: the per-pass fill and drain overhead (R + C - 1 cycles against F of useful work) shrinks relatively as F grows, while the array's extra registers do not.
- Rows: at the same C = 4, the 2x4 array beats 1x4 at F = 16 (236737 against 245004) and F = 32 (1086070 against 1263250) but loses at F = 8 (68101 against 63650). Against all arrays, 2x4 is best only at F = 16; at F = 32 the 1x8 array (1028988) is 5% better.
- At F = 16 and 32 the best MAC engine is the largest tried (P = 8), and at F = 32 the best array has the widest C tried (8). Both optima sit at the edge of the sweep, so the true best ratio could differ.
- Re-generated F = 8 numbers differ from `chip-systolic-small` (1x4: 1675 cells here, 1729 there; P = 4: 1615 against 1674) although that project reproduces its own numbers with the same Yosys (checked). The generator here uses narrower ROM index and counter widths at F = 8; this is the likely cause but was not isolated. Use only comparisons within this table.

## Limitations
- One network family and seed; the F-F-4 shape grows the hidden layer with F, so area grows roughly with F^2 as well as cycles. Other shapes were not tried.
- Sweep edges (above); only R <= 2; weights are baked-in ROM functions; no weight-stationary dataflow or RAM weights.
- Gate counts only: no clock period, power, memory or layout (see `chip-pnr`). Nothing here describes a fabricated chip.
- The sweep does not show that no systolic design wins.

## Next steps
Extend P and C beyond 8 to find the optima; weight-stationary dataflow; a RAM-based weight store; a fixed hidden width with varying input fan-in.

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-systolic-small` and is MIT-licensed.
