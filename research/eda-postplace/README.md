# eda-postplace: does ABC's pre-layout delay and area view of 40 MAC engines survive placement and timing repair on SKY130?

Next step listed by `eda-clocksweep`, `eda-fidelity` and `eda-delayproxy`: add a placed rung to the eda loops, which only ever scored designs with Yosys and ABC. The obstacle was OpenROAD, which `chip-pnr` built from source with Nix (about 1.5 h). **Headline finding for the tooling:** `pip install openroad` gives a working OpenROAD (floorplan through placement, parasitic estimation and `repair_timing`) in seconds, and one 2000-cell design takes about 5 s. Headline result: ABC's **area** ranking survives placement almost exactly (Spearman 0.997 to 0.999), its **delay** ranking only partly (0.61 to 0.80 before repair), and a design ABC says meets 5 ns never does after placement. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-postplace/

**Builds on.** `eda-clocksweep` (the same 40 designs and ABC script), `eda-harness` and `chip-accel` (generators), `chip-pnr` (the stage layout of the OpenROAD flow and the finding that wires cost 3 to 19% of delay there), Yosys/ABC and OpenROAD with the OpenROAD-flow-scripts SKY130 HD platform files (Apache-2.0, fetched at a pinned commit). It builds on none of the CU Boulder groups in `prompt.md`.

## Method
- 40 MAC-engine designs (1 to 8 lanes, 4 to 8-bit) mapped with Yosys 0.33 and ABC `map -D T; upsize -D T; dnsize -D T` at T = 5 and 8 ns: 80 netlists.
- Each netlist goes through OpenROAD (the `openroad` 0.0.1 PyPI wheel): floorplan at 40% utilisation, global placement, pin placement, detailed placement, then `estimate_parasitics -placement` with the platform's `setRC.tcl`; then `repair_design` and `repair_timing -setup` against the same T. Three timings per design: **netlist** (OpenSTA, no wires), **placed** (before repair), **repaired**. Implied period = T minus worst slack, I/O delay 0, ideal clock.
- Compared with ABC's own `stime` delay and area, and with `gen_depth`/`gen_cells` from the generic rung.

## Reproduce
```bash
sudo apt-get install -y yosys && pip install numpy matplotlib
python3 -m venv /tmp/orv && /tmp/orv/bin/pip install openroad   # the OpenROAD wheel; ~46 MB
cd research/eda-postplace
PYTHONPATH=src python -m unittest discover -s tests            # 7 tests
OPENROAD_PYTHON=/tmp/orv/bin/python PYTHONPATH=src:../eda-harness/src:../chip-accel/src python experiments/run.py   # ~7 min, fetches the PDK
cd experiments && PYTHONPATH=../src python analyze.py && python figure.py
```

## Results (`experiments/results.txt`, data `experiments/placed.json`, figure `experiments/placed.png`)
| | T = 5 ns | T = 8 ns |
|---|---|---|
| Spearman ABC delay ~ no-wire STA period | 0.745 | 0.755 |
| Spearman ABC delay ~ placed period | 0.763 | 0.610 |
| Spearman ABC delay ~ repaired period | 0.796 | 0.346 (see caveat) |
| Spearman ABC area ~ repaired area | 0.997 | 0.999 |
| wire penalty, placed / no-wire period (min, median, max) | 1.18, 1.36, 1.88 | 1.23, 1.36, 1.99 |
| repaired area / ABC area (median) | 1.131 | 1.035 |
| designs meeting T: ABC / no-wire STA / placed / repaired | 15 / 0 / 0 / 0 | 39 / 7 / 1 / 27 |

- **Area carries over, delay does not.** Cell count and ABC area still rank repaired area at 0.99+, so area-only decisions made at the synthesis rung hold. ABC's delay is a weaker guide after placement, and at 5 ns every design misses: the 15 ABC calls "meets" fail even without wires, because ABC's figure omits flop clock-to-q and setup (STA period is 1.03 to 1.69 times ABC's delay).
- **Wires add a median 36% to the period at both targets,** more for wider arrays: mean penalty 1.28 to 1.35 for 1 to 3 lanes, 1.70 and 1.79 at 8 lanes (5 and 8 ns).
- **At 8 ns, placement alone loses almost every design** (39 ABC-feasible, 7 without wires, 1 placed); `repair_timing` recovers 27 for 3.5% median area.
- **Winners and fronts are unchanged where a front exists.** At 8 ns the placement-feasible (area, cycles) front is p8w4, p4w4, p2w4, p1w4, the same as ABC's, and p4w4 has the best area × cycles both ways and when each design runs at its own achieved period (also at 5 ns, where no design is feasible). This agrees with `eda-clocksweep`: the area × latency conclusion is robust to the placed rung; the delay-feasibility boundary is not.
- Figure: `experiments/placed.png`.

## Limitations
- **Caveat on the repaired period.** `repair_timing` stops once slack is non-negative, so a repaired period at or under T measures "met", not how fast the design could run. That caps the repaired periods at 8 ns and explains the fall of that Spearman to 0.346; use the placed (unrepaired) column to compare speed.
- ABC delays sit close to their target by construction (4.9 to 6 ns at 5 ns), so the delay rank correlations are over a narrow spread.
- **No routing and no clock tree.** The wheel's Tcl `initialize_floorplan` and `make_tracks` segfault (OpenROAD 0.0.1 wheel, "HDL-HEAD"), so the floorplan uses the Python API, tracks are absent, and parasitics come from placement, not global routing. The clock is ideal and I/O delay is 0, unlike `chip-pnr`, which ran CTS and global routing. These numbers are placement-level estimates, not sign-off.
- One family, one recipe, one utilisation (40%), one corner (tt 25 °C), one run per setting; I did not test determinism across machines or thread counts.
- Pin placement is automatic, so the I/O wire lengths of the 32-bit input bus are part of the penalty.

## Next steps
Get routing back (build tracks through the Python API and run `global_route`) and add CTS; sweep utilisation; use the placed period as the truth for `eda-fidelity`'s halving replay and for a screen in `eda-screen`; repeat on `chip-systolic` and report an `openroad` wheel rung for the loop harness.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 (apt); `openroad` wheel from PyPI (BSD-3-Clause per its sources; not vendored); SKY130 HD platform files from OpenROAD-flow-scripts (Apache-2.0, fetched at run time); NumPy, matplotlib. All code original, MIT.
