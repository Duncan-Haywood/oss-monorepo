# chip-systolic-p32: does the MAC-engine lead survive MAC lanes up to P = 32 and arrays up to R = 4? (negative, 4-bit, stylised)

Follow-up to `chip-systolic-hidewide` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). That project listed "P = 32 at F = 32", "R = 4" and "simulate the MAC engine at H = 16 against NumPy" as next steps. This project runs the same F-16-4 network at F = 16 and 32 with P up to 32, arrays 2x16 and 4x8 added, and every MAC engine's RTL simulated. Produced with AI assistance (Claude). Preliminary and small: one toy network family, one seed, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic-p32/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The dataflow is the textbook systolic idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (details as cited in `chip-systolic-batch`; the paper was not read in full here). Code is copied (MIT, same author) from `research/chip-systolic-hidewide` (itself copied from `chip-systolic-hidden`; the H = 16 changes are described there) and changed only in the sweep script and one added test; the generators are unchanged. Earlier changes in `chip-systolic-hidewide`:: H = 16; the index width now covers max(F, H) (it covered only F, which breaks when H > F); and the activation buffers hold max(F, H) entries per row, with the input repacked on load (they held F, which cannot store a hidden vector wider than the input). The README is new.

## Method
- Network F-16-4: F inputs, 16 hidden ReLU units, 4 outputs, 4 Gaussian clusters in F dimensions, 4-bit weights.
- Arrays: output-stationary R x C with (R, C) = (1,4), (1,8), (1,16), (2,8), (2,16), (4,8). MAC engine (`chip-accel`'s design): P = 4, 8, 16, 32 lanes.
- Cycles per batch of R: `2 + ceil(16/C)*(R + C + F - 1) + ceil(4/C)*(R + C + 15)`; MAC engine: `2 + ceil(16/P)*(F + 1) + ceil(4/P)*17`.
- All 6 arrays and all 4 MAC engines are simulated in Icarus on 32 vectors at each F, compared bit for bit with the integer NumPy reference, and their measured cycles compared with the formulas (new here: MAC-engine RTL is simulated, not just its formula).
- Synthesis: Yosys `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops (gate counts, not square microns). Metric: cells x cycles per vector (lower is better).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
python -m venv .venv && .venv/bin/pip install numpy   # a virtualenv: apt's python3-numpy can shadow pip's
cd research/chip-systolic-p32
PYTHONPATH=src ../../.venv/bin/python -m unittest discover -s tests   # about 1 min
PYTHONPATH=src ../../.venv/bin/python experiments/run.py              # about 15 min; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
All 20 simulated designs (12 array runs, 8 MAC-engine runs) matched the NumPy reference and the cycle formulas.

| F | best array (cells x cycles/vec) | best MAC engine | array / MAC |
|---|---|---|---|
| 16 | 1x4: 245106 | P=8: 188680 | 1.30 |
| 32 | 2x8: 458345 | P=32: 358488 | 1.28 |

- **Negative result.** The best MAC engine beats the best array by 23% to 30% in cells x cycles per vector at both F. The gap is essentially the same as in `chip-systolic-hidewide` (1.30 and 1.27); the only change in a best design is P = 32 at F = 32 (358488 against P = 16's 360932, 0.7% better).
- **The P optimum was at the edge, and the edge is not an open end.** P = 32 has the same cycle count as P = 16 (36 at F = 16, 52 at F = 32), since layer 1 has only 16 hidden outputs to spread across lanes. Only the synthesised cell count differs (5637 against 6043 at F = 16; 6894 against 6941 at F = 32), a small synthesis effect that this study did not investigate. At F = 16, P = 32 (202932) is behind P = 8 (188680).
- **R = 4 and 2x16 do not help.** 4x8 is behind 2x8 at both F (270580 against 268037 at F = 16; 476416 against 458345 at F = 32), and 2x16 is behind 1x4 / 2x8 (394944; 586068).

## Limitations
- One network family and seed; H = 16 only; training data and weights differ at each F.
- Only R <= 4 and C <= 16; weights are baked-in ROM functions; no weight-stationary dataflow or RAM weights.
- The 0.7% F = 32 gain of P = 32 over P = 16 rests on a single synthesis run and is within what a different abc script could change; do not read it as a trend.
- Gate counts only: no clock period, power, memory or layout (see `chip-pnr`). Nothing here describes a fabricated chip.
- The sweep does not show that no systolic design wins.

## Next steps
Weight-stationary dataflow; a RAM-based weight store; H larger than F and P/C beyond the hidden width tested with a deeper network.

## Owner steps
None needed (simulation only).

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-systolic-hidewide` and is MIT-licensed.
