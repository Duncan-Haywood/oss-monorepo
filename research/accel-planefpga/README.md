# accel-planefpga: how many MAC lanes fit on a small open-toolchain FPGA, and which dataflow is fastest? (stylised, synthesis-only)

Track 8 (task-specific AI accelerators) in `PROJECTS.md`, the "multi-lane engine and the UP5K's DSP blocks" step left open by `accel-fpga`. The question: put `accel-plane`'s P-lane output-stationary (OS) and reduction-tree (RT, and RTp with a registered tree) matrix-vector engines, for the keyword-spotting layer shape 64x70 with 4-bit weights, through Yosys and nextpnr-ice40 on an iCE40 UP5K. How many lanes fit, what clock do they reach, what is the latency of one product, and do the UP5K's eight hard multiplier blocks change the answer? **Headline: output-stationary at 16 lanes is the fastest design that fits (10.2 us per product, 2,942 of 5,280 logic cells, 27 MHz); reduction trees clock 1.5 to 2x slower; and asking Yosys for DSP blocks cuts logic by 13 to 41% but fails to place at more than 8 lanes, because it does not fall back to logic when the 8 blocks run out.** Produced with AI assistance (Claude). Nothing was run on a board.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-planefpga/

**Why it seemed worth doing.** `accel-plane` priced the engines in generic gates and `accel-fpga` mapped a single serial MAC. Neither says what a parallel engine costs on a real, cheap, open-toolchain part, which is where a wake-word accelerator would plausibly be prototyped.

**Builds on.** `research/accel-plane` (the engine RTL, imported unchanged and checked bit-exact there), `research/accel-fpga` (the flow and device figures), `research/accel-kws` (the layer shape). Tools: Yosys, nextpnr, Project IceStorm, YoWASP builds. No CU Boulder group's work is built on or implied.

## Method
- **Top** (`rtl/plane_top.v`, written here): the engine fed by a free-running shift register (operands are never constants, so nothing folds away), `start` tied high, power-on reset, and the engine outputs XOR-reduced into one registered pin so no lane is optimised out. **No weight memory:** operands come from flip-flops, so these numbers are the compute plane only. A real design adds weight storage (`accel-fpga` found block RAM is the first limit as models grow).
- **Sweep**: engine in {OS, RT, RTp} x P in {1, 2, 4, 8, 16, 32} x DSP mapping off/on (`synth_ice40 -dsp`); layer 64x70, 4-bit weights, 8-bit inputs, 24-bit accumulators.
- **Flow**: Yosys 0.33 `synth_ice40`, nextpnr-ice40 (YoWASP build, `--up5k --package sg48`, `--placer heap`, 60 MHz target, `--timing-allow-fail`), seeds 1, 2, 3; Fmax is the median post-route estimate.
- **Cycles** are `accel-plane`'s closed form without its fixed 2 to 3 cycle handshake (RTL-checked there at all 36 of its points); latency = cycles / Fmax. This project did not re-simulate the wrapped engine: bit-exactness is `accel-plane`'s result for the unmodified RTL.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog
pip install yowasp-nextpnr-ice40 matplotlib      # or a native nextpnr-ice40 on PATH
cd research/accel-planefpga
python3 experiments/run.py        # about 30 min (YoWASP is slow); writes results.json and results.txt
python3 experiments/figure.py     # experiments/latency_vs_cells.svg
python3 -m unittest discover -s tests -v    # 5 tests, about 15 s
```

## Results
Full table in `experiments/results.txt` (36 points); logic cells (LC) after place and route, UP5K has 5,280 LC and 8 DSP blocks.

| engine | P | DSP map | cycles | LC | DSP | Fmax MHz | latency us |
|---|---|---|---|---|---|---|---|
| OS | 1 | no | 4480 | 241 | 0 | 31.1 | 144.0 |
| OS | 8 | no | 560 | 1507 | 0 | 28.8 | 19.5 |
| OS | 8 | yes | 560 | 1044 | 8 | 34.8 | 16.1 |
| OS | 16 | no | 280 | 2942 | 0 | 27.4 | **10.2** |
| RT | 8 | no | 576 | 1128 | 0 | 19.1 | 30.1 |
| RT | 32 | no | 192 | 3834 | 0 | 14.8 | 13.0 |
| RTp | 8 | yes | 576 | 601 | 8 | 25.8 | 22.4 |
| RTp | 32 | no | 192 | 3708 | 0 | 16.1 | 12.0 |

- **OS wins on latency among designs that fit.** 10.2 us at P = 16 (2,942 LC) against 12.0 us for RTp at P = 32 (3,708 LC) and 13.0 us for RT at P = 32. OS keeps 24-bit partial sums in the lanes so its critical path stays one multiply-add (27 to 31 MHz); RT adds a log2(P)-deep adder tree (Fmax falls from 33 MHz at P = 1 to 15 MHz at P = 32), and registering the tree (RTp) recovers 1 to 19 MHz at the cost of a cycle.
- **Cost per lane is about 180 LC for OS and 110 for RT** (no DSP; slopes between P = 8 and 16). OS pays for P accumulators; RT has one.
- **OS at 32 lanes does not fit** (nextpnr could not expand the region; it needs more than the 5,280 LC). So 16 lanes (4 tiles of 70 inputs) is the largest OS engine that fits here.
- **DSP mapping saves 13 to 41% of logic and raises Fmax by 2 to 8 MHz, but only up to 8 lanes.** Yosys infers one SB_MAC16 per multiplier; at P >= 16 it asks for more than 8 and nextpnr fails with "no BELs remaining" for all of OS, RT and RTp, rather than leaving the extra multipliers in logic. A hybrid (8 multipliers in DSP, the rest in LUTs) would need hand-instantiated cells or Yosys flags I did not try, so the 16-lane OS point has no DSP counterpart here, and it is open whether it would beat 10.2 us.
- **The wrapper's XOR reduce is included, not subtracted.** It costs about 128 LUTs for OS at P = 16 and 64 at P = 8 (analytic, `wrapper_luts`), 4 to 5% of the OS totals, and 8 LUTs for RT at any P. It slightly overstates OS area relative to RT; the ranking above does not depend on it. Whether it also limits Fmax I did not check.
- **Timing is never the constraint for keyword spotting.** At 4 products per second, even the slowest point (144 us) is busy 0.06% of the time, as in `accel-fpga`; the fastest designs matter only if the layer shape or frame rate grows.

## Limitations
- Synthesis and place-and-route only: no power, no board, no weights loaded, no front end, no second layer (11x64) and no bias or requantisation. Static power may dominate the always-on budget and nothing here estimates it.
- No weight storage; operands come from a shift register. Adding ROM/RAM adds EBRs and read-port timing that could lower Fmax.
- nextpnr's Fmax is a static-timing estimate at one clock; seed spread was up to about 10% (for example RT P = 8: 18.7 to 19.5 MHz), so differences under about 1 MHz are not resolved. Critical paths were not inspected, so the explanations of why OS clocks faster are inferences.
- One layer shape, one weight width (4 bits), one device (UP5K), Yosys 0.33 and one nextpnr build.

## Next steps
Hand-instantiate 8 SB_MAC16 plus LUT multipliers for the 16-lane OS point; add `accel-fpga`'s ROMs to a wide engine and see when block RAM, not logic, binds; the 11x64 second layer; power from a measured board (owner step).

## Owner steps
Optional: buy an iCE40 UP5K board (prices not checked here) and measure power of the 8-lane DSP design. Nothing else; no hardware was specified or bought, so no bill of materials.

## Outside dependencies
`accel-plane`'s RTL and cycle model; Yosys, nextpnr-ice40 (YoWASP wheel) and IceStorm's device database; the figure helper is stdlib only.
