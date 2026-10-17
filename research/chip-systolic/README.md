# chip-systolic: does a systolic array beat a MAC-lane engine for a tiny quantised MLP? (negative at this size)

Follow-up to `chip-accel` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). A Python generator emits Verilog for an R x C output-stationary systolic array that runs the same 8-8-4 integer MLP on a batch of R = 4 vectors. The RTL is simulated in Icarus Verilog and must match the integer NumPy reference bit for bit and in cycle count; it is then scored with Yosys against `chip-accel`'s MAC-lane engine at 4, 6 and 8 bits. Produced with AI assistance (Claude). Preliminary and small: one toy network, one batch size, one tool version, one generic-gate synthesis script. No LLM is in this loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-systolic/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. The systolic dataflow is the textbook idea of H. T. Kung, "Why systolic architectures?", *IEEE Computer* 15(1):37-46, 1982, <https://doi.org/10.1109/MC.1982.1653825> (bibliographic details confirmed by web search on 2026-10-13; the paper was not read in full). The output-stationary variant implemented here is generic and not derived from any published accelerator. `model.py` and `baseline_gen.py` are copied from `research/chip-accel` (same author, MIT). Quantisation is plain post-training symmetric rounding (see `chip-accel`).

## Method
- `src/chip_systolic/gen.py`: PE(r,c) multiplies the activation moving right along row r by the weight moving down column c and accumulates in place. Row r's activations enter r cycles late and column c's weights c cycles late, so PE(r,c) sees input k at cycle k + r + c. Weights are baked-in ROM functions (as in `chip-accel`, so ROM logic is in the area). A tile of C neurons takes R + C + 6 compute cycles plus 1 write-back, so `cycles(C, R) = 2 + sum over layers ceil(N/C) * (R + C + 7)`. Bias, ReLU/shift and clipping are applied at write-back, identical to `chip-accel`.
- `src/chip_systolic/flow.py`: Icarus testbench and the same Yosys script as `chip-accel` (`synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`; cells include flip-flops; depth from `ltp -noff`). Gate counts, not square microns.
- Baseline: `chip-accel`'s P-lane engine handles one vector at a time, so a batch of 4 costs 4 x `cycles(P)` cycles (formula verified in `chip-accel`; not re-simulated in this project).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy
cd research/chip-systolic
PYTHONPATH=src python -m unittest discover -s tests     # about 1 minute
PYTHONPATH=src python experiments/run.py                # about 15 minutes; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
The RTL matched NumPy on all 40 checked vectors for all 12 systolic configurations, and every measured cycle count equalled `cycles(C, R)`. Tests also cover a ragged tile (C = 3), batch sizes 1 to 4, and extreme inputs.

cells x cycles per batch of 4 (lower is better; smallest per bit width in bold):

| WB | systolic 4x1 / 4x2 / 4x4 / 4x8 | MAC-lane P = 1 / 2 / 4 / 8 |
|---|---|---|
| 4 | 423546 / 326160 / 310435 / 439920 | 378840 / 245952 / **194184** / 224000 |
| 6 | 1004188 / 696640 / 612551 / 856280 | 601040 / 404544 / **336400** / 384160 |
| 8 | 972506 / 769520 / 770283 / 1169600 | 797280 / 561344 / **475368** / 568320 |

- **Negative result.** At matched MAC count the MAC-lane engine has fewer cells x cycles at every bit width; its best point (P = 4) beats the best systolic point (4x4 at 4 and 6 bits, 4x2 at 8) by about 1.6x at 4 bits, 1.8x at 6 bits and 1.6x at 8 bits. Systolic wins only on latency: 40 cycles for 4x8 against 80 for P = 8, and 47 for 4x4 against 116 for P = 4, at 3.9x the cells in both cases at 4 bits.
- Likely causes (not isolated by experiment): each PE carries two WB-bit pipeline registers and an accumulator (flip-flops are 450 to 5126 of the cells), the fan-in is only 8 so fill and drain (R + C - 2 cycles of a 15-cycle tile at 4x4) is a large share, and the weight ROM is replicated per column injection point. A larger fan-in or batch would favour the array; this project does not test that.
- Depth is flat across array shapes (41 to 43 at 4 bits) and similar to the MAC-lane design (36 to 37), as expected for registered neighbour-to-neighbour links.

## Limitations
- One 8-8-4 network, one training seed, one batch size (R = 4); K = 8 is small for a systolic array. Conclusions do not extend to real accelerators.
- Gate counts from one generic ABC script; no clock period, power, memory or post-layout numbers (see `chip-pnr`). The ROM weights are constants in logic. Nothing here describes a fabricated chip.
- 40 vectors per configuration were checked in RTL. MAC-lane figures come from the `chip-accel` generator, scored again here with the identical script.
- The Kung citation details were checked by search; its content was not read here, so no claim rests on it beyond the name of the dataflow.

## Next steps
Sweep batch size and fan-in to find where the array overtakes the MAC lanes; a RAM-based weight store; a weight-stationary variant; an `ANTHROPIC_API_KEY`-gated proposer (stubbed) that rewrites the datapath under the equivalence gate of `chip-ppa-loop`.

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-accel` and MIT-licensed.
