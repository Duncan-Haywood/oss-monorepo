# chip-systolic-small: does a small, reused systolic array beat a MAC-lane engine? (negative, 4-bit, stylised)

Follow-up to `chip-systolic-batch` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). That project found the array's cells x cycles disadvantage widening as the batch R grew (1.6x at R = 4 to 2.9x at R = 16), and listed "a fixed-size array reused across batches" as a next step. This project runs the other end of the curve: arrays with R = 1, 2, 4 rows, each reused for a stream of 32 vectors (32/R successive batches on one instance). Produced with AI assistance (Claude). Preliminary and small: one toy 8-8-4 network, one tool version, one generic-gate synthesis script, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic-small/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The dataflow is the textbook systolic idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (bibliographic details as cited in `chip-systolic-batch`; the paper was not read in full here). The generator, model and flow code are copied (MIT, same author) from `research/chip-systolic-batch`, which copies from `chip-systolic` and `chip-accel`. Only `experiments/run.py`, the tests and this README are new.

## Method
- Same RTL generator and Yosys script as `chip-systolic-batch` (`synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops). Gate counts, not square microns.
- Cycles per batch of R: `2 + sum over layers ceil(N/C) * (R + C + 7)`. Every configuration is simulated in Icarus on 32 vectors as 32/R back-to-back batches on one instance, compared with the integer NumPy reference, and its measured cycle count compared with the formula.
- Baseline: `chip-accel`'s P-lane engine, one vector at a time; cycles per vector from its formula (not re-simulated here).
- Metric: cells x cycles per vector (lower is better). Input buffering outside the array is not counted.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy
cd research/chip-systolic-small
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src python experiments/run.py                # about 1 minute; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`, 4-bit weights)
RTL matched the NumPy reference on all 6 array configurations, and every measured cycle count equalled the formula.

| design | cells | cycles per batch | cells x cycles per vector |
|---|---|---|---|
| systolic 1x2 | 1136 | 62 | 70432 |
| systolic 1x4 | 1729 | 38 | 65702 |
| systolic 2x2 | 2091 | 68 | 71094 |
| systolic 2x4 | 3269 | 41 | 67014 |
| systolic 4x2 | 4077 | 80 | 81540 |
| systolic 4x4 | 6605 | 47 | 77608 |
| MAC lanes P = 2 | 1098 | 56 | 61488 |
| MAC lanes P = 4 | 1674 | 29 | 48546 |

- **Negative result.** The best array (1x4) has 1.35x the cells x cycles per vector of 4 MAC lanes (65702 against 48546). Shrinking the array from R = 4 to R = 1 improves it by 15% but does not close the gap. Per-vector cost rises monotonically with R at fixed C, so with this generator more rows never help.
- A 1x4 array is slower than 4 MAC lanes (38 against 29 cycles per vector) and bigger (1729 against 1674 cells). The per-pass fill and drain overhead of the array (`R + C + 7` cycles) outweighs what its structure saves at fan-in 8.
- The sweep does not show that no systolic design wins.

## Limitations
- Fan-in is 8, so each pass is short and fill/drain overhead dominates; a wider layer could reverse the result. Not tested.
- Weight-stationary dataflow and RAM-based weights were not tried; weights are baked-in ROM functions.
- One network, one seed, one synthesis script, gate counts only: no clock period, power, memory or layout (see `chip-pnr`). Nothing here describes a fabricated chip.
- The MAC-lane cycle counts come from the `chip-accel` formula and are not re-simulated here.

## Next steps
Sweep fan-in (needs a generalised model); weight-stationary dataflow; a RAM-based weight store.

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-systolic-batch` and is MIT-licensed.
