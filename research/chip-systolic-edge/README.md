# chip-systolic-edge: do the optima of the fan-in sweep move when C and P go past 8? (negative, 4-bit, stylised)

Follow-up to `chip-systolic-fanin` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). That project reported that at F = 16 and 32 its best MAC engine (P = 8) and its best array (C = 8 at F = 32) sat at the edge of the sweep, and listed "extend P and C beyond 8" as a next step. This project does that. Produced with AI assistance (Claude). Preliminary and small: one toy network family, one seed, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic-edge/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The dataflow is the textbook systolic idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (as cited in `chip-systolic-batch`; the paper was not read in full here). The generators, model and flow are copied unchanged (MIT, same author) from `research/chip-systolic-fanin`; only the package name, the sweep grid in `experiments/run.py` and this README are new.

## Method
- Network F-F-4 (F inputs, F hidden ReLU units, 4 outputs, 4 Gaussian clusters), 4-bit weights, F = 16 and 32.
- Arrays: output-stationary R x C with R = 1 and 2 and C = 4, 8, 16 (six configurations; `chip-systolic-fanin` had 1x2 to 1x8 and 2x4). MAC engine: P = 4, 8, 16, 32 lanes (`chip-accel`'s design).
- Each array is simulated in Icarus on 32 vectors, compared bit for bit with the integer NumPy reference, and its measured cycles compared with the formula. MAC-lane cycles come from the formula and are not simulated.
- Synthesis: Yosys `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops. Metric: cells x cycles per vector (lower is better).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy
cd research/chip-systolic-edge
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src python experiments/run.py                # a few minutes; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
All 12 array configurations matched the NumPy reference and the cycle formula.

| F | best array (cells x cycles/vec) | best MAC engine | array / MAC |
|---|---|---|---|
| 16 | 2x4: 236737 | P=8: 188998 | 1.25 |
| 32 | 2x8: 935950 | P=16: 780124 | 1.20 |

- **Negative result stands.** With the wider grids the best MAC engine still beats the best array at both fan-ins. The F = 16 ratio is unchanged (1.25; the new configurations did not beat 2x4 or P = 8). At F = 32 the ratio falls from 1.26 to 1.20 because the earlier optima were at the sweep edge: the best array moves from 1x8 (1028988) to 2x8 (935950, 9% better), and the best MAC engine from P = 8 (816964) to P = 16 (780124, 5% better).
- **Optima are now interior.** Beyond them cost rises: at F = 32, 1x16 is 1157488 and 2x16 is 1102823; P = 32 is 879036. At F = 16, 1x16 is 409596, 2x16 is 392768; P = 16 is 217512 and P = 32 is 204480. The F = 16 and F = 32 numbers for configurations shared with `chip-systolic-fanin` (for example 2x4 at 236737 and P = 8 at 188998 at F = 16) are identical to its results.
- At F = 16, P = 32 has fewer cells than P = 16 (5680 against 6042) and the same cycles. The generator does not need more than 16 lanes for 16 hidden neurons, so the extra lanes should be unused; the cell difference comes from the synthesis tool and was not investigated.
- Rows and columns beyond 8 pay for themselves in cycles (1x16 at F = 32 takes 146 cycles against 202 for 1x8) but not in cells.

## Limitations
- One network family and seed; the F-F-4 shape grows the hidden layer with F, so P beyond F is wasted by construction. Other shapes were not tried.
- Only R <= 2; weights baked in as ROM functions; no weight-stationary dataflow or RAM weights.
- Gate counts only: no clock period, power, memory or layout (see `chip-pnr`). Nothing here describes a fabricated chip.
- The sweep does not show that no systolic design wins.

## Next steps
Weight-stationary dataflow; a RAM-based weight store; a fixed hidden width with varying input fan-in; R = 4 with the wider C.

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is copied from `chip-systolic-fanin` and is MIT-licensed.
