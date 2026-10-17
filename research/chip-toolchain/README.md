# chip-toolchain: a reproducible open RTL flow, with synthesis area and depth for smoke designs

First milestone of the LLM chip-design-loop track (`PROJECTS.md`, track 3). It installs an all-open front end in the container, records exact tool versions, and measures what the flow reports for a few small designs. It also checks that the flow can prove two adders equivalent and catch a deliberately broken one. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-toolchain/

**Builds on.** The open tools Yosys (<https://yosyshq.net/yosys/>), Icarus Verilog and Verilator (<https://www.veripool.org/verilator/>); the later milestones target the LLM-for-RTL line of work (VerilogEval, Liu et al., ICCAD 2023, <https://doi.org/10.1109/ICCAD57390.2023.10323812>; RTLLM, Lu et al., ASP-DAC 2024, <https://doi.org/10.1109/ASP-DAC58780.2024.10473904>). Nothing from those papers is reproduced here. This project builds on none of the CU Boulder groups listed in `prompt.md` and claims no connection to them.

## Method
- `designs/`: a structural ripple-carry adder, the same adder written with `+`, an operator multiplier, a synchronous FIFO, a deliberately broken adder (negative control), and two Verilog testbenches. All written for this project.
- `src/chip_toolchain/flow.py`: wrappers that (a) synthesise with `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX` and read cell counts from `stat` and depth from `ltp -noff`; (b) prove combinational equivalence with a Yosys miter and `sat -prove`; (c) simulate with Icarus Verilog; (d) lint with Verilator `-Wall`.
- "Area" is a **gate count** in a generic library with no technology data, and "depth" is the longest path in cells. Neither is square microns or nanoseconds.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog verilator     # Ubuntu 24.04 packages
cd research/chip-toolchain
python3 -m unittest discover -s tests -v              # 8 tests, about 2 s
python3 experiments/run.py                            # output in experiments/results.txt
```

## Results (all from `experiments/results.txt`)
Versions used: Yosys 0.33 (git 2584903a060), Icarus Verilog 12.0, Verilator 5.020.

| design | params | cells | depth | flops |
|---|---|---|---|---|
| adder_ripple | W=4 / 8 / 16 / 32 | 17 / 37 / 77 / 157 | 7 / 15 / 31 / 63 | 0 |
| adder_op (`+`) | W=4 / 8 / 16 / 32 | 17 / 38 / 82 / 170 | 7 / 15 / 31 / 63 | 0 |
| mult_op (`*`) | W=4 / 8 | 63 / 332 | 12 / 30 | 0 |
| fifo | W=8, AW=2 / 3 | 90 / 173 | 6 / 8 | 40 / 75 |

- The ripple adder costs 5W−3 cells (exact for W=4, 8, 16, 32 in this run) and depth 2W−1. The `+` form comes out with the same depth, so with this ABC script the tool did not build a faster carry structure, and it uses 0, 1, 5 and 13 more cells at W=4, 8, 16, 32.
- The SAT miter proves `adder_ripple == adder_op` for W=4, 8, 12, and correctly reports non-equivalence for the broken adder (W=8).
- Simulation: 256 exhaustive 4-bit vectors for both adders, 0 mismatches against Python `a+b`; the FIFO testbench refuses pushes when full and returns values in order (checked in the unit tests).
- Verilator lint is clean for `adder_op`, `mult_op` and `fifo`. For `adder_ripple` it warns `UNOPTFLAT` (circular logic on the carry vector). The path is bitwise acyclic; Verilator reports it because the carry is one vector. This is left as is rather than suppressed.
- The FIFO maps to 40 flops against the 38 expected from memory and pointers (32 + 2×3). The two extra are unexplained here; I did not inspect them further (possibly Yosys registering the 2-bit write address).

## Limitations
- Generic gate counts only: no liberty library, so no real area, delay or power. Post-layout numbers are the `chip-pnr` milestone.
- **OpenROAD, SKY130 and cocotb are not part of this run.** No OpenROAD package is available from the container's apt sources; I did not install an unverified PyPI package of that name. Placing and routing is therefore not covered. cocotb was not exercised; testbenches are plain Verilog.
- Few designs, one tool version, one ABC script. Gate counts depend on it.

## Next steps
`chip-rtl-loop` (generate RTL with lint/simulation/formal feedback), and getting OpenROAD plus the SKY130 PDK from a released binary or the OpenROAD-flow-scripts build.

## Outside dependencies
Yosys, Icarus Verilog, Verilator (apt). Not used: any LLM, OpenROAD, a PDK. All designs and testbenches are original and MIT-licensed.
