# accel-plane: does a loop-nest cycle model survive contact with RTL at more than one lane? (stylised)

Fourth step of track 8 (task-specific AI accelerators) in `PROJECTS.md`, closing the first item in `accel-dataflow`'s "Next steps": it checked its schedule model against RTL only at P = 1. Here are two real P-lane engines, written in Verilog, simulated in Icarus Verilog and synthesised with Yosys. The question: for the two layer shapes of the `accel-kws` keyword-spotting MLP, do the RTL cycle counts equal the schedule model's at P = 1 to 32, including the ragged last tile; and what do the output-stationary and reduction-tree engines cost in generic gates?

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-plane/

**Builds on.** `research/accel-dataflow` (its `closed_form` cycles are the thing being checked), `research/accel-kws` (layer shapes 64x70 and 11x64, 4-bit weights, 8-bit inputs, 24-bit accumulators, and the Yosys recipe). Dataflow vocabulary after Chen, Emer and Sze (2016), Eyeriss, ISCA. No lab in `prompt.md` works on this directly, so no lab tag is claimed beyond the repository's digital-twin theme (a cheap model checked against a more faithful one).

## Method
- `rtl/os_engine.v`: output-stationary. Lane j owns output `t*P+j`; one input element is broadcast per cycle; partial sums stay in P accumulators. Lanes past O are masked.
- `rtl/rt_engine.v`: reduction tree. Lane j takes input `it*P+j` of one output; a balanced adder tree sums the P products; one accumulator spans the input tiles. `PIPE=1` (called `RTp`) registers the tree output. Lanes past I are masked.
- Both read operands through external ports (no memory is synthesised). The testbenches (`rtl/tb_os.v`, `rtl/tb_rt.v`) return a nonzero garbage value for out-of-range lanes, so a missing mask shows up as a wrong result. Matrix-vector only, batch 1, no bias, no ReLU or requantisation between layers.
- `src/accel_plane/rtl.py` drives the testbenches with random int4 weights and int8 inputs, compares every output with `X @ W.T` in NumPy, takes cycles from the clock edge after `start` to `done`, and compares them with `accel_dataflow.flows.closed_form` (OS for the OS engine, RT for the others).
- Area is Yosys `synth -flatten` then `abc` to generic gates (the `accel-kws` recipe, Yosys 0.33 from apt); each row is an engine specialised to its layer shape.

## Reproduce
```bash
sudo apt-get install -y iverilog yosys python3-numpy   # plus matplotlib for the figure
cd research/accel-plane
python3 -m pytest tests -q            # 6 tests, ~20 s
python3 experiments/run.py            # ~3 min: 36 RTL runs and 36 syntheses; writes results.json and results.txt
python3 experiments/figure.py         # writes experiments/plane.png from results.json only
```

## Results (from `experiments/results.txt`)
- **All 36 sweep points are bit-exact against NumPy** (2 shapes x 3 engines x P in 1, 2, 4, 8, 16, 32; 4 random vectors each) and every vector takes the same number of cycles. The tests add shapes with tails in both dimensions, P larger than O or I, single-element dimensions and extreme values (all -128 inputs times -8 weights).
- **The schedule model's cycle count is exact up to a constant.** RTL cycles minus model cycles is 2 for OS, 2 for RT and 3 for RT with the registered tree, at every one of the 36 points (and in the extra test shapes). The constant is start and finish handshake in my testbench plus one pipeline register, not a property of the dataflow. So at P > 1, including the tail effects (11 outputs on 16 lanes, 70 inputs on 8 lanes), the loop-nest model predicted the RTL's cycles with no error beyond that offset.
- **Tails decide which engine is faster, as the model said.** 64x70 at P = 32: OS 142 cycles against RT 194, since 70 inputs need 3 tiles of 32 (96 slots). 11x64 at P = 16: OS 66 against RT 46, since OS leaves 5 of 16 lanes idle and cannot go below 64 cycles however many lanes it has (11 outputs fit one tile; each input takes a cycle).
- **Generic-gate area.** At P = 8 on 64x70 the OS engine is 2,989 cells and 403 flops, the RT engine 2,275 cells and 71 flops; at P = 32 it is 11,799 against 8,216. OS grows by about 48 flops per lane; RT stays near 70 flops. Cells times cycles (lower is better) is lowest for RT at P = 8 (1.32 million) on 64x70 and for RT at P = 16 (0.20 million) on 11x64; OS's best is 1.68 million (P = 8 to 32) and 0.28 million (P = 16). Cells times cycles is a crude figure of merit, not an energy.