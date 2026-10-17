# chip-systolic-hidden: does the array/MAC gap change when the hidden width is fixed at 8 and only the input fan-in grows? (negative, 4-bit, stylised)

Follow-up to `chip-systolic-fanin` and `chip-systolic-edge` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). Those projects grew the input and hidden widths together (F-F-4), and `chip-systolic-edge` listed "a fixed hidden width with varying input fan-in" as a next step. This project makes the network F-8-4 and runs F = 8, 16 and 32. Produced with AI assistance (Claude). Preliminary and small: one toy network family, one seed, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic-hidden/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The dataflow is the textbook systolic idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (details as cited in `chip-systolic-batch`; the paper was not read in full here). The generators, model, flow and experiment script are copied (MIT, same author) from `research/chip-systolic-fanin`, then changed so the hidden width H is separate from the input fan-in F: the second layer's fan-in is H, passes and the MAC schedule use the current layer's fan-in, and the cycle formulas follow. The tests and this README are new.

## Method
- Network F-8-4: F inputs, 8 hidden ReLU units, 4 outputs, trained on 4 Gaussian clusters in F dimensions. 4-bit weights. Layer 1 has fan-in F, layer 2 has fan-in 8.
- Arrays: output-stationary R x C with (R, C) = (1,2), (1,4), (1,8), (2,4). MAC engine: P = 2, 4, 8 lanes (`chip-accel`'s design).
- Cycles per batch of R: `2 + ceil(8/C)*(R + C + F - 1) + ceil(4/C)*(R + C + 7)`; MAC engine: `2 + ceil(8/P)*(F + 1) + ceil(4/P)*9`.
- Each array is simulated in Icarus on 32 vectors (32/R back-to-back batches on one instance), compared bit for bit with the integer NumPy reference, and its measured cycles compared with the formula. MAC-lane cycles come from the formula and are not simulated here.
- Synthesis: Yosys `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops (gate counts, not square microns). Metric: cells x cycles per vector (lower is better).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy
cd research/chip-systolic-hidden
PYTHONPATH=src python -m unittest discover -s tests          # about 25 s
PYTHONPATH=src python experiments/run.py                     # a few minutes; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
All 12 array configurations matched the NumPy reference and the cycle formula.

| F | best array (cells x cycles/vec) | best MAC engine | array / MAC |
|---|---|---|---|
| 8 | 1x4: 63308 | P=4: 46835 | 1.35 |
| 16 | 2x4: 118645 | P=4: 97065 | 1.22 |
| 32 | 2x4: 220853 | P=8: 183304 | 1.20 |

- **Negative result.** At every F tried the best MAC engine beats the best array, by 20 to 35% in cells x cycles per vector. The ratio falls from 1.35 to 1.22 to 1.20, so the gap narrows with F but the last step is small and it does not close in this range.
- Compared with `chip-systolic-fanin` (hidden width = F), the ratios at F = 16 and 32 are 1.22 and 1.20 here against 1.25 and 1.26 there. Absolute numbers are far smaller because the hidden layer no longer grows with F (F = 32: 220853 against 1028988 for the best array). Whether the ratio difference comes from the fixed hidden width or from the different F-dependent weights and training was not isolated.
- At F = 32 the best MAC engine is P = 8, the largest tried, so its optimum may lie further out. The best array at F = 32 is 2x4, ahead of 1x8 (251140) and 1x4 (267030), so row-batching helps here.
- The F = 8 network is the same shape as in `chip-systolic-fanin`, but the generator changed (a layer-dependent fan-in signal), and the cell counts differ slightly (1x4: 1666 cells here, 1675 there; P = 4: 1615 in both). Use only comparisons within this table.

## Limitations
- One network family and seed; H = 8 only; training data and weights differ at each F. Other shapes were not tried.
- Sweep edges (above); only R <= 2; weights are baked-in ROM functions; no weight-stationary dataflow or RAM weights.
- Gate counts only: no clock period, power, memory or layout (see `chip-pnr`). Nothing here describes a fabricated chip.
- The sweep does not show that no systolic design wins.

## Next steps
Weight-stationary dataflow; a RAM-based weight store; H other than 8; P beyond 8 at F = 32; R = 4.

## Owner steps
None needed (simulation only).

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-systolic-fanin` and is MIT-licensed.
