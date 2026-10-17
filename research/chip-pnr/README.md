# chip-pnr: how far do synthesis-only area and delay sit from placed-and-routed numbers on SKY130?

Fifth milestone of the LLM chip-design-loop track (`PROJECTS.md`, track 3), and a fidelity question in the spirit of the twin projects: a cheap model (synthesis estimate) versus a more detailed one (placement, clock tree, global routing, timing repair). No LLM is used. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-pnr/

**Builds on.** Open tools: Yosys and ABC (<https://yosyshq.net/yosys/>), OpenROAD (<https://theopenroadproject.org/>; cited by project page only, no paper is cited) and its OpenROAD-flow-scripts SKY130 HD platform files (liberty, LEF, RC settings, fetched at a pinned commit, not vendored, Apache-2.0 per that repository). The designs and the generic-gate flow are from this repository's [`chip-toolchain`](../chip-toolchain). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. The debate over learned placement (Mirhoseini et al., *Nature* 2021; Cheng et al., ISPD 2023) is context only; nothing from it is reproduced.

## Method
- Designs (copied from `chip-toolchain`, original, MIT): ripple adder and `+` adder at W=8/16/32, `*` multiplier at W=4/8, synchronous FIFO (8-bit, depth 4 and 8), plus a clock-target sweep (2, 3, 5, 8 ns) on the 16-bit `+` adder. 13 runs.
- Three estimates per design: (1) **generic**: Yosys `synth -flatten; abc -g AND,NAND,...`, a gate count with no technology (as in `chip-toolchain`); (2) **mapped**: `dfflibmap` + `abc -liberty` on the SKY130 HD typical-corner liberty file (cells ORFS marks `dont_use` are removed from a copy of it, because Yosys 0.33 has no `abc -dont_use`), reporting um&sup2; and the netlist; (3) **placed and routed**: OpenROAD floorplan at 40% utilisation, tap cells, global placement, pin placement, clock-tree synthesis (FIFO only), `repair_design`, detailed placement, global routing, `repair_timing -setup`, with parasitics estimated from the global route.
- Delay is reported as the implied minimum period, `target &minus; worst slack`, at three points: the mapped netlist with no wires ("netlist"), after detailed placement before timing repair ("post-place"), and after global route plus `repair_timing` ("final"). I/O delays are 0 and the clock is ideal until CTS.
- Area "final" excludes tap cells (physical-only), so it is the logic, clock buffers and repair buffers.

## Reproduce
```bash
sudo apt-get install -y yosys                    # 0.33 used here
nix build --impure --expr 'let p = import (builtins.getFlake "nixpkgs") {system="x86_64-linux";}; in p.openroad.overrideAttrs (_: {doCheck=false;})'
./fetch_pdk.sh pdk                               # SKY130 HD platform files, pinned ORFS commit
OPENROAD=<result>/bin/openroad python3 experiments/run.py && python3 experiments/summarize.py
python3 -m unittest discover -s tests            # 5 tests, under 1 s
```
OpenROAD 26Q2 comes from nixpkgs-unstable and compiles from source (about 1.5 h on 4 cores). With the default `doCheck` the nixpkgs build failed one of its own regression tests (`dbSta.report_cell_usage_file.tcl`, a log comparison), so I disabled the check phase; I did not investigate that failure. Yosys is the Ubuntu 24.04 package. Numbers come from one run; I did not test repeatability across machines.

## Results (all from `experiments/results.txt`, produced by `experiments/run.py`)
| design | generic gates | mapped cells | mapped um&sup2; | final um&sup2; | final/mapped |
|---|---|---|---|---|---|
| adder W=8 (ripple and `+`) | 37 / 38 | 25 | 207.7 | 207.7 | 1.000 |
| adder W=16 | 77 / 82 | 49 | 427.9 | 465.4 | 1.088 |
| adder W=32 | 157 / 170 | 97 | 868.3 | 1069.8 / 1107.3 | 1.232 / 1.275 |
| mult W=4 / 8 | 63 / 332 | 49 / 234 | 341.6 / 1926.8 | same | 1.000 |
| FIFO AW=2 / 3 | 90 / 173 | 114 / 210 | 1559.0 / 2972.9 | 1625.3 / 3154.3 | 1.043 / 1.061 |

- **Generic gate count is a poor guide to library area across kinds of logic.** Mapped um&sup2; per generic gate is 5.1&ndash;5.8 for the 8 combinational designs but about 17.2 for the two FIFOs (sd of the ratio over all 10 designs is 4.97 against a mean of 7.82), because a flop is roughly 20 um&sup2;. Within the combinational designs the ratio stays inside that 5.1&ndash;5.8 band.
- **Mapping erases the ripple/`+` difference.** The two adders differ by up to 13 generic gates at W=32, but ABC with the liberty file gives byte-identical cell counts and area for each pair (same cell multiset at W=8: 13 xnor2, 6 maj3, 2 xor2, 2 nand2, 1 o21ai).
- **Layout adds area only when timing is repaired.** Where the mapped netlist already meets the target (W=8 adder, both multipliers) the final area equals the mapped area. Where it fails (W=16, 32 adders) `repair_design`/`repair_timing` add 9&ndash;28% area. The FIFOs meet 5 ns with 2&ndash;2.5 ns to spare but still grow 4&ndash;6% (clock-tree buffers and `repair_design`).
- **Timing: wires cost 3&ndash;19% before repair.** Post-place implied period over the no-wire netlist is 1.03&ndash;1.04 for the adders, 1.06 and 1.16 for the multipliers (W=4, 8), and 1.13 and 1.19 for the FIFOs (which also include the clock-tree skew and CTS insertion delay). Longer/wider logic suffers more.
- **The ABC clock target did not change the netlist.** For the 16-bit `+` adder at 2, 3, 5 and 8 ns the mapped netlist is identical (428 um&sup2;, implied period 5.63 ns). The target only mattered downstream: `repair_timing` raised area to 511.7 um&sup2; (+19.6%) at 2 and 3 ns and reached an implied 4.72 ns, still missing both targets, and left 8 ns untouched.
- At W=32 the adders miss the 5 ns target by a wide margin (implied 11.9 ns mapped, 9.9 ns after repair); at W=16 the 5 ns target is met only after repair (implied 5.63 &rarr; 5.00 ns).
- Power (OpenROAD `report_power`, default activity) is in `results.json` but not interpreted: it is a vectorless estimate.

## Limitations
- Stylised: 13 small, synthetic designs, one library corner (tt 25C 1.8V), one tool version, one utilisation, I/O delays of 0 and no input/output buffering, and no pad ring. Nothing here says anything about a fabricated chip.
- "Final" is **global-route-estimated**, not post-detailed-route: I did not run `detailed_route`, extract parasitics from the routed layout, or check DRC/LVS. Real post-route numbers would likely differ further.
- The delay comparison mixes a changing set of effects (wires, buffering, CTS, repair). The "post-place" column is the cleanest wire-only comparison; "final" includes optimisation toward the target, so it is not a pure fidelity measure.
- The cell-area ratios depend on utilisation only through tap cells and repair, which I excluded or did not vary; a utilisation sweep is not done.
- ABC's own delay estimate is not read out, so I do not claim a number for how ABC's predicted delay compares with OpenSTA's.
- That flops dominate the FIFO area ratio rests on one cell-usage report from a development run of `fifo` (W=8, AW=2: 40 sequential cells, 800.8 of 1685.4 um&sup2; including taps); the committed run does not keep per-cell reports (`work/` is gitignored).

## Next steps
Run `detailed_route` and parasitic extraction to get true post-route numbers; sweep utilisation and period; feed the mapped-versus-layout area ratio back into `chip-ppa-loop` as a second, higher-fidelity score for rewrites; then a Tiny Tapeout-sized design (owner's call to submit).

## Owner steps
None required. Submitting any design to a shuttle, and paying for it, is the owner's decision.

## Outside dependencies
Yosys 0.33 (apt), OpenROAD 26Q2 (nixpkgs, built from source), SKY130 HD platform files from OpenROAD-flow-scripts at commit `e5cc6e7` (fetched, not vendored). Not made here: the PDK/cell library, the tools. No LLM or paid service.

**Figure.** `python experiments/figure.py` (needs matplotlib) redraws `experiments/ratios.png`, final/mapped area and post-place/netlist period for each design, from the committed `experiments/results.txt` only; it runs nothing new.
