# chip-mac-lanes: which MAC-lane count P is best for a tiny quantised MLP when every P from 1 to 20 is built and checked? (stylised, generic-gate counts)

Follow-up to `chip-systolic-hidewide` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). That project swept only P = 4, 8, 16, took the MAC engine's cycles from a formula rather than simulating them at F = 16 and 32, and said the F = 32 optimum "may lie further out". This project closes those gaps. Produced with AI assistance (Claude). Preliminary and small: one toy network family, one seed, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The engine is `chip-accel`'s P-lane MAC design, copied (MIT, same author) via `research/chip-systolic-hidewide`; `model.py` and `baseline_gen.py` are copied unchanged apart from a docstring line, and `flow.py` is a trimmed copy of that project's. Tools: Yosys and Icarus Verilog.

## Method
- Network F-16-4 (F inputs, 16 hidden ReLU units, 4 outputs), 4-bit weights, same data, seed and trained weights as `chip-systolic-hidewide`; F = 16 and 32.
- Every P from 1 to 20. For each: generate the RTL, simulate it in Icarus on 32 test vectors, compare outputs bit for bit with the integer NumPy reference, and compare the measured cycles per vector with the formula `2 + ceil(16/P)*(F+1) + ceil(4/P)*17`.
- Synthesis: `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`, cells include flip-flops (gate counts, not square microns). Metric: cells x cycles per vector (lower is better).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
python -m venv .venv && . .venv/bin/activate && pip install numpy matplotlib   # a venv: apt's python3-numpy can shadow numpy
cd research/chip-mac-lanes
PYTHONPATH=src python -m unittest discover -s tests          # about 30 s
PYTHONPATH=src python experiments/run.py                     # about 15 min; rewrites experiments/results.txt
python experiments/figure.py                                 # redraws experiments/lanes.png from results.txt only
```

## Results (from `experiments/results.txt`)
All 40 designs (20 values of P at each of 2 values of F) matched the NumPy reference on all 32 vectors, and the measured cycles equalled the formula in every case.

| F | best P (cells x cycles) | next best | worst power of two |
|---|---|---|---|
| 16 | 8: 188680 | 4: 198099, 16: 217548 | 1: 497268 |
| 32 | 16: 360932 | 8: 372045, 4: 512494 | 1: 1439386 |

- **The earlier P = 4, 8, 16 numbers reproduce exactly** (188680 and 217548 at F = 16; 372045 and 360932 at F = 32), a cross-check on the copied code.
- **F = 32 optimum is not further out.** P = 17 to 20 all have the same cycle count as P = 16 (52) and every one has more cells (smallest is P = 20 with 11251 against 6941), so they are worse. This follows from H = 16: with 16 hidden neurons, P > 16 cannot cut cycles.
- **Non-powers of two never win.** The best non-power-of-two is P = 6 at F = 16 (272160, 44% behind the best) and P = 20 at F = 32 (585052, 62% behind). P = 6 is the cheapest design that reaches 3 hidden groups, but it sits above P = 4 and P = 8 on both sides.
- **Cell count is far from monotone in P.** At F = 32, P = 12 has 7072 cells and P = 13 has 14697; P = 15 has 16679 against 6941 for P = 16. Possible cause, not tested here: the neuron index `grp*P + j` in the generated RTL becomes a general multiplier unless P is a power of two. Isolating that (for example by rewriting the index as an addition) is a next step; it is a property of this generator, not of MAC engines in general.
- Most of the hand-picked sweep in `chip-systolic-hidewide` was therefore already at the optimum of this design family at H = 16; the exhaustive sweep adds the evidence rather than a new winner.

## Limitations
- One network family, one seed, H = 16 only, 4-bit weights, weights baked in as ROM functions.
- Gate counts only: no clock period, power, memory or layout (see `chip-pnr`). The depth column in `results.txt` is Yosys's longest topological path in gates, not a timing result. Nothing here describes a fabricated chip.
- The non-power-of-two penalty may be an artefact of this generator's index arithmetic and of Yosys 0.33 with this ABC script; a different generator or script could change the ranking among non-powers.
- The systolic arrays of `chip-systolic-hidewide` were not re-run; comparisons with them use that project's committed numbers.

## Next steps
Rewrite the neuron index as incremental additions and rerun, to test whether the non-power-of-two penalty disappears; repeat at H = 8 and H = 32 to see whether the optimum tracks H; weight-stationary arrays against the best lane count.

## Owner steps
None needed (simulation only).

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy and matplotlib (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-systolic-hidewide` and is MIT-licensed.
