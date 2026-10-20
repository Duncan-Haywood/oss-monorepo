# chip-systolic-hidewide: does the MAC-engine lead survive a wider hidden layer (H = 16) and more MAC lanes? (negative, 4-bit, stylised)

Follow-up to `chip-systolic-hidden` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). That project fixed the hidden width at 8 and listed "H other than 8" and "P beyond 8 at F = 32" as next steps. This project makes the network F-16-4 and runs F = 16 and 32, with MAC lanes up to P = 16. Produced with AI assistance (Claude). Preliminary and small: one toy network family, one seed, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic-hidewide/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The dataflow is the textbook systolic idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (details as cited in `chip-systolic-batch`; the paper was not read in full here). Code is copied (MIT, same author) from `research/chip-systolic-hidden` and changed in three places: H = 16; the index width now covers max(F, H) (it covered only F, which breaks when H > F); and the activation buffers hold max(F, H) entries per row, with the input repacked on load (they held F, which cannot store a hidden vector wider than the input). The tests and this README are new.

## Method
- Network F-16-4: F inputs, 16 hidden ReLU units, 4 outputs, 4 Gaussian clusters in F dimensions, 4-bit weights. Layer 1 has fan-in F, layer 2 has fan-in 16.
- Arrays: output-stationary R x C with (R, C) = (1,4), (1,8), (1,16), (2,8). MAC engine: P = 4, 8, 16 lanes (`chip-accel`'s design).
- Cycles per batch of R: `2 + ceil(16/C)*(R + C + F - 1) + ceil(4/C)*(R + C + 15)`; MAC engine: `2 + ceil(16/P)*(F + 1) + ceil(4/P)*17`.
- Each array is simulated in Icarus on 32 vectors (32/R back-to-back batches on one instance), compared bit for bit with the integer NumPy reference, and its measured cycles compared with the formula. MAC-lane cycles come from the formula; the MAC engine's RTL is simulated against NumPy only in the unit tests (F = 8 with P = 4, 16; F = 16 with P = 8, 16), not in the F = 16 and 32 experiment.
- Synthesis: Yosys `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops (gate counts, not square microns). Metric: cells x cycles per vector (lower is better).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy                           # use a virtualenv: apt's python3-numpy can shadow it
cd research/chip-systolic-hidewide
PYTHONPATH=src python -m unittest discover -s tests          # about 30 s
PYTHONPATH=src python experiments/run.py                     # a few minutes; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
All 8 array configurations matched the NumPy reference and the cycle formula.

| F | best array (cells x cycles/vec) | best MAC engine | array / MAC |
|---|---|---|---|
| 16 | 1x4: 245106 | P=8: 188680 | 1.30 |
| 32 | 2x8: 458345 | P=16: 360932 | 1.27 |

- **Negative result.** At both F the best MAC engine beats the best array, by 27 to 30% in cells x cycles per vector.
- Against `chip-systolic-hidden` (H = 8; ratios 1.22 at F = 16 and 1.20 at F = 32) the gap is slightly larger here. Different arrays and lane counts were swept, the weights differ, and there is one seed, so this is not isolated as an effect of H.
- At F = 32 the best MAC engine is P = 16, the largest tried, ahead of P = 8 by 3% (360932 against 372045), so its optimum may lie further out. At F = 16 the optimum is P = 8 (P = 16: 217548).
- At F = 32 the best array is 2x8 (458345), ahead of 1x8 (477106); at F = 16 the best is 1x4 (245106) and 2x8 (268037) is behind 1x8 (274762) too. Wider rows or R > 2 were not tried.

## Limitations
- One network family and seed; H = 16 only; training data and weights differ at each F.
- Sweep edges: P = 16 at F = 32 and C = 4 at F = 16 are the extremes of their ranges; only R <= 2; weights are baked-in ROM functions; no weight-stationary dataflow or RAM weights.
- MAC-engine cell counts are from synthesis, and its cycles from the formula. Its RTL was checked against NumPy only in the unit tests at the F and P values listed in Method, not at F = 32 or for every P in the table.
- Gate counts only: no clock period, power, memory or layout (see `chip-pnr`). Nothing here describes a fabricated chip.
- The sweep does not show that no systolic design wins.

## Next steps
Weight-stationary dataflow; a RAM-based weight store; simulate the MAC engine at H = 16 against NumPy; P = 32 at F = 32; R = 4.

## Owner steps
None needed (simulation only).

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-systolic-hidden` and is MIT-licensed.
