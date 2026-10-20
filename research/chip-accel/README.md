# chip-accel: a parameterised MAC-lane accelerator for a tiny quantised MLP, checked cycle by cycle against NumPy

Fourth milestone of the LLM chip-design-loop track (`PROJECTS.md`, track 3). A Python generator emits Verilog for an 8-8-4 integer MLP engine with P multiply-accumulate lanes and WB-bit weights and activations; the RTL is simulated in Icarus Verilog and must match an integer NumPy reference bit for bit and in cycle count; then P and WB are swept against synthesised gate count, depth and cycles. Produced with AI assistance (Claude). Preliminary and small: one toy network, one tool version, one generic-gate synthesis script. No LLM is in this loop; it supplies the design under test for the later loop projects.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-accel/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. Conceptually it follows the generate-simulate-score pattern of the earlier `chip-*` projects here. Quantisation is plain post-training symmetric rounding, a textbook technique (see Jacob et al., "Quantization and Training of Neural Networks for Efficient Integer-Arithmetic-Only Inference", CVPR 2018, <https://doi.org/10.1109/CVPR.2018.00286>; cited from search results on 2026-10-13, the paper itself was not read). The design is not a systolic array and is not derived from any published accelerator.

## Method
- `src/chip_accel/model.py`: 400 points from 4 Gaussian clusters in 8-D; an 8-8-4 ReLU MLP trained in float by full-batch gradient descent; post-training quantisation to WB-bit signed integers with per-layer power-of-two output shifts; `int_forward` is the integer-exact specification.
- `src/chip_accel/gen.py`: emits `accel.v`. Weights and biases are baked in as ROM `case` functions (so ROM logic is counted in area). Each layer's neurons are processed P at a time: 8 MAC cycles plus 1 write-back cycle per group, plus 1 load and 1 layer-transfer cycle, so `cycles(P) = 2 + 9*(ceil(8/P) + ceil(4/P))`: 110, 56, 29, 20 for P = 1, 2, 4, 8.
- `src/chip_accel/flow.py`: Icarus testbench that applies vectors and counts cycles to `done`; Yosys score = `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`, total cells (flip-flops included), flip-flop count, and depth from `ltp -noff`. Same generic-gate script as `chip-toolchain`: gate counts, not square microns.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog      # Yosys 0.33, Icarus 12.0 here
pip install numpy
cd research/chip-accel
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src python experiments/run.py    # rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
Float model: 0.965 held-out accuracy (400 points; binomial standard error about 0.01). The RTL matched the NumPy reference on all 40 checked vectors in all 12 configurations, and the measured cycle count equalled `cycles(P)` every time (the tests also cover P = 3, which does not divide the layer sizes, and extreme inputs).

| WB | int accuracy | cells x cycles at P = 1 / 2 / 4 / 8 | cells at P = 1 / 8 |
|---|---|---|---|
| 4 | 0.935 | 94710 / 61488 / **48546** / 56000 | 861 / 2800 |
| 6 | 0.970 | 150260 / 101136 / **84100** / 96040 | 1366 / 4802 |
| 8 | 0.968 | 199320 / 140336 / **118842** / 142080 | 1812 / 7104 |

- Area grows with lanes, latency falls less than linearly (110 to 20 cycles for 1 to 8 lanes), so cells x cycles has an interior minimum at P = 4 for every bit width. This is a proxy that ignores clock period, memory and routing.
- Bit width: 6 bits matched the float accuracy within one standard error on this toy task; 4 bits lost about 3 points. 8 bits costs about 2.1x the cells of 4 bits at P = 1 and about 2.5x at P = 8, for no accuracy gain over 6 bits here. The task is easy, so this says little about real networks.
- Depth barely changes with P (36 to 54), as expected, since lanes are parallel; it grows with WB through the multiplier-accumulate path.

## Limitations
- One 8-8-4 network on a synthetic task, one training seed, 400 test points; accuracy differences under about 2 points are noise.
- Weights are constants in logic, not a RAM, and activations are flip-flops: the area is not that of a weight-programmable accelerator. No clock-period, power, or post-layout numbers (see the planned `chip-pnr`). Nothing here describes a fabricated chip.
- Single-ported sequential schedule, no pipelining, no handshake; `start` is only accepted when idle. 40 vectors per configuration were checked in RTL; the full test set was checked only in NumPy.
- Not a systolic array; the milestone's "MAC or systolic array" was satisfied by the MAC-lane variant only.

## Next steps
Systolic-array variant and a RAM-based weight store; an `ANTHROPIC_API_KEY`-gated proposer (stubbed) that rewrites the datapath under the equivalence gate of `chip-ppa-loop`; then `chip-pnr` on SKY130 to see how far these gate counts sit from post-layout area.

## Outside dependencies
Yosys and Icarus Verilog (apt), NumPy (pip). No LLM API, OpenROAD or PDK. All code is original and MIT-licensed.
