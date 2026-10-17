# accel-fpga: what does the keyword-spotting engine cost on a small open-toolchain FPGA? (stylised, synthesis-only)

Sixth milestone of track 8 (task-specific AI accelerators) in `PROJECTS.md`. It takes the serial-MAC engine `accel-kws` built and checked bit for bit (`../accel-kws/rtl/kws_engine.v`), wraps it with on-chip weight ROMs, and runs it through the open iCE40 flow (Yosys `synth_ice40`, then nextpnr-ice40 place and route) for 15 geometries on two devices, UP5K and HX8K. It reports logic cells, block RAMs and maximum clock. Produced with AI assistance (Claude). Nothing was run on a board.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-fpga/

**Why it seemed worth doing.** `accel-kws` counted Yosys generic gates, which say little about a real FPGA. The track asks what the design costs in LUTs and clock, and whether always-on keyword spotting fits a cheap part.

**Builds on.** `accel-kws` (this repository): the engine RTL, the integer reference, the trained-model accuracies and cycle counts that this project quotes from its `results.json`. Tools: Yosys (<https://yosyshq.net/yosys/>), nextpnr (<https://github.com/YosysHQ/nextpnr>; Shah et al., "Yosys+nextpnr: an open source framework from Verilog to bitstream for commercial FPGAs", FCCM 2019 — venue and year from memory, not checked here), Project IceStorm for the iCE40 database (<https://github.com/YosysHQ/icestorm>), and the YoWASP builds of the tools (<https://github.com/YoWASP>). It builds on none of the CU Boulder groups listed in `prompt.md` and claims no connection to them.

## Method
- **Top** (`rtl/kws_top.v`, written here): `kws_engine` with its five external memories as constant ROMs (`$readmemh`, combinational read, as the engine expects), a power-on reset, `start` tied high so the engine re-runs forever, and the logit outputs XOR-reduced to one pin so they are not optimised away.
- **Configurations**: input size 70 (7 time segments), hidden width H in {8, 16, 32, 64, 128}, weight bits in {2, 4, 8}; accumulators 24 bits, as in `accel-kws`.
- **Weights are random, not trained.** The dataset is not reachable from this session (Hugging Face returns 403 through the proxy), so no model was trained. The weights are uniform random integers of the right width (`flow.random_model`). Resource use and clock do not depend on accuracy. They can depend on ROM contents only for ROMs mapped to logic; see the finding on block RAM below. The accuracy column in the table is **copied from `accel-kws`'s trained models** of the same shape (mean test accuracy over 3 seeds), not measured here.
- **RTL check**: for each configuration the top is simulated in Icarus Verilog on 3 random inputs and its class is compared with the NumPy integer reference (`accel-kws`'s `int_forward`): 45 of 45 agree. This checks the wrapper, not the trained models; `accel-kws` did the bit-exact logit comparison.
- **Flow**: Yosys 0.33 `synth_ice40`, then nextpnr-ice40 0.11.1 (`--placer heap`, 60 MHz target so it always reports the achievable clock, `--timing-allow-fail`) on `up5k`/`sg48` and `hx8k`/`ct256`, seeds 1, 2, 3. "Fmax" is nextpnr's post-route estimate for the one clock, median of the 3 seeds. Pins are placed automatically (no constraints file), so the design is not tied to a board.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog
pip install numpy matplotlib yowasp-nextpnr-ice40     # or a native nextpnr-ice40 on PATH
cd research/accel-fpga
python3 experiments/run.py        # about 15 min; writes experiments/results.json and results.txt
python3 experiments/figure.py     # experiments/fpga.png
python3 -m unittest discover -s tests -v    # 5 tests, about 10 s
```
`flow.py` imports `accel_kws.model` from `../accel-kws/src`.

## Results
Logic cells (LC) after place and route, block RAMs (EBR) and median Fmax; the HX8K columns have identical LC and EBR counts and are omitted below (see `experiments/results.txt`). Latency = engine cycles / UP5K Fmax. "acc" is the trained accuracy from `accel-kws` (not this project's random weights).

| H | weight bits | acc | cycles | UP5K LC | EBR | UP5K Fmax (MHz) | HX8K Fmax (MHz) | latency (ms) |
|---|---|---|---|---|---|---|---|---|
| 8 | 2 | 0.280 | 651 | 734 | 1 | 17.3 | 47.0 | 0.04 |
| 8 | 8 | 0.505 | 651 | 1138 | 2 | 15.4 | 42.4 | 0.04 |
| 32 | 2 | 0.361 | 2595 | 733 | 3 | 21.8 | 53.9 | 0.12 |
| 32 | 4 | 0.685 | 2595 | 785 | 5 | 17.4 | 42.9 | 0.15 |
| 64 | 4 | 0.722 | 5187 | 831 | 7 | 17.5 | 43.4 | 0.30 |
| 128 | 2 | 0.680 | 10371 | 643 | 9 | 20.4 | 50.1 | 0.51 |
| 128 | 4 | 0.749 | 10371 | 798 | 14 | 16.9 | 41.4 | 0.62 |
| 128 | 8 | 0.748 | 10371 | 1054 | 24 | 14.9 | 37.2 | 0.70 |

(All 15 rows in `experiments/results.txt`; per-seed Fmax in `results.json`.)

- **Every configuration fits the smaller part with room to spare.** The largest uses 1,138 of the UP5K's 5,280 logic cells (22%) and the 128-wide 8-bit net uses 24 of its 30 block RAMs. Nothing was close to not fitting on logic; block RAM is the first limit as H and weight bits grow.
- **The weights landed in block RAM, so logic barely depends on H.** Yosys merged the engine's address registers into the ROM read ports and mapped the large ROMs to EBR, even though the RTL reads combinationally (the result is functionally equivalent; the Icarus check ran on the RTL, not on the netlist). So logic cells stay at 643 to 734 across H = 8 to 128 at 2-bit weights, while EBR count rises from 1 to 9. Logic grows with weight bits instead (about 990 to 1,140 cells at 8-bit against 640 to 730 at 2-bit), which is the multiplier and the small ROMs.
- **Clock is about 15 to 22 MHz on UP5K and 37 to 54 MHz on HX8K**, falling as weight bits rise (2-bit is fastest in every row). I did not inspect the critical path, so I cannot say which stage limits it. The 4 Hz always-on rate in `accel-kws` needs a clock of a few kHz, so timing is not the constraint at that rate.
- **Latency** at Fmax is 0.04 to 0.70 ms per inference, so at 4 inferences per second the engine is busy at most 0.3% of the time. The engine could run far slower than the part allows.
- **Against `accel-kws`'s generic-gate counts**: those were 1,066 to 3,979 gates for the same engine core without memories, against 516 to 1,138 LCs here with ROMs. These are not like for like (4-input LUTs and carry chains against generic two-input gates) and should not be compared as an area ratio.

## Limitations
- **No power, no board.** Nothing here estimates or measures power; the FPGA's static power may dominate the always-on budget in `ambient-wearable`, and that is the question that matters for a wake-word engine. Only the owner can measure it.
- **Weights are random and the accuracy column is borrowed**, as above. No trained model was put through the flow.
- nextpnr's Fmax is a static-timing estimate for one clock with automatically placed pins; real boards add I/O constraints. The spread across 3 seeds was up to about 10% of Fmax (for example 35.0 to 38.6 MHz on HX8K at H = 64, 8-bit), so differences under about 1 MHz are not resolved.
- Only the single-engine geometry of `accel-kws` was mapped: no multi-lane variant, no SPRAM use, no input/MFCC front end (it is not in the RTL).
- Yosys 0.33 (apt) was used for synthesis and the YoWASP build of nextpnr for place and route; other versions may map differently.

## Next steps
Train on real Speech Commands features when reachable and load those weights; put the front end in hardware; inspect the critical path; try a multi-lane engine and the UP5K's SPRAM; estimate power with the vendor-neutral models if any are open.

## Owner steps
A physical test needs an iCE40 UP5K board (for example iCEBreaker or UPduino) and a way to measure supply current. I did not look up prices, so a bill of materials with sources and dates is still to be made; nothing was ordered.

## Outside dependencies
Yosys, Icarus Verilog (apt); nextpnr-ice40 via the YoWASP wheel (PyPI); NumPy, matplotlib; the `accel-kws` engine and results.

**Figure.** `experiments/fpga.png`: logic cells and Fmax against hidden width.
