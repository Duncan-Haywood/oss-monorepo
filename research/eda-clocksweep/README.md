# eda-clocksweep: do the SKY130 area and latency conclusions for a MAC-engine family survive a target clock period?

Why it seemed worth doing: `eda-sky130rung` mapped each design with an unconstrained ABC `map`, so every design ran at its own, different clock, and it listed "rerun with a clock-constrained `abc -D` sweep" as the open step. A real chip has one clock. Its finding that logic depth ranks delay badly (Spearman 0.611) and that the (area, latency) front differs from the generic front could be an artefact of letting each design pick its own period. This project fixes the period instead. Produced with AI assistance (Claude). Preliminary: one design family, one ABC recipe, no wires, no place and route.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-clocksweep/

**Builds on.** `research/eda-sky130rung` (flow, rank statistics), `research/eda-harness` (the 40 designs and their generic-gate log), `research/eda-flowtune` (`fetch_pdk.sh`). Tools: Yosys 0.33 and ABC (apt), SKY130 HD `tt_025C_1v80` liberty at ORFS commit `e5cc6e799f`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- Same 40 designs (p = 1..8 lanes, wb = 4..8 bits), same flow (`synth -flatten -noabc; dfflibmap; abc -liberty`). Only the ABC script changes: `strash; dc2; map -D T; topo; upsize -D T; dnsize -D T; stime` for T = 3, 4, 5, 6, 8, 10 ns, plus the unconstrained baseline of `eda-sky130rung`. 280 mappings in all (`experiments/run.py`, 4 processes, about 15 minutes).
- A design *meets* T if ABC's reported critical-path delay is at most T. With one fixed clock, latency = cycles × T, so the (area, latency) front among designs that meet T is the (area, cycles) front among them (`src/eda_clocksweep/sweep.py`, `feasible_front`).
- `experiments/analyze.py` writes `results.txt`; `experiments/figure.py` draws `tradeoff.png`.

## Reproduce
```bash
sudo apt-get install -y yosys && pip install numpy matplotlib
cd research/eda-clocksweep
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src:../eda-harness/src:../chip-accel/src python experiments/run.py   # ~15 min; fetches the PDK to /tmp/pdk/p
cd experiments && PYTHONPATH=../src python analyze.py && python figure.py
```

## Results (`experiments/results.txt`, data `experiments/swept.json`)
- **Cell count still ranks area at every target:** Spearman 0.995 to 0.996 between generic cells and mapped area at all seven settings.
- **Logic depth ranks delay badly, and how badly depends on T:** Spearman 0.611 unconstrained, 0.82 at T = 3 ns, 0.73 at 4 ns, 0.64 at 5 ns, 0.72 at 6 ns, 0.34 at 8 ns, 0.58 at 10 ns. No setting makes depth a reliable delay proxy, and the correlation is not monotone in T, so a single figure from one recipe should not be quoted.
- **No design reaches 3 ns:** 0 of 40 meet it (fastest design reached about 3.1 ns). 6 of 40 meet 4 ns, 15 meet 5 ns, 25 meet 6 ns, 39 meet 8 ns, 40 meet 10 ns. At 4 ns the 8-lane 4-bit design (p8w4) drops out (it reaches 4.5 ns).
- **With one shared clock the front is the generic front.** For every T from 5 ns up, the feasible (area, cycles) front is p8w4, p4w4, p2w4, p1w4, identical to the generic (cells, cycles) front; at 4 ns it is p4w4, p2w4, p1w4. So the "front loses one design and gains another" result of `eda-sky130rung` came from giving every design its own clock, not from the cell library. The best design by area × latency is p4w4 at every feasible T (12.0 to 12.2 thousand µm², 29 cycles), matching the generic cells × cycles winner.
- **Sizing to a target shrinks area slightly:** relaxing from unconstrained `map` (which minimises delay first) to a target recovers 4 to 9% of area for the four 4-bit designs at T of 4 ns and up, while tightening to 3 ns costs at most 3% extra area (p1w4: area +3%, delay 4598 → 3194 ps; p8w4 area is 3% lower, delay 7828 → 3451 ps).
- Figure: `experiments/tradeoff.png`.

## Limitations
- ABC's `stime` delay is combinational only: no wires, no clock tree, no setup or clk-to-q, no placement. "Meets T" means ABC's estimate meets T, not that a chip would. Post-route numbers do not exist here (OpenROAD is not installed), and open-flow numbers are estimates, not sign-off.
- One design family (the 4 to 8-bit MAC engines) and one recipe (`dc2; map -D; upsize; dnsize`); `eda-flowtune` shows the recipe matters. One run per setting; ABC here is deterministic, so no seeds.
- The fixed-clock front compares designs at equal cycles-per-T, which assumes each design can be clocked at exactly T; a design with slack could run faster. The ranking of designs by area × cycles does not depend on T by construction, so "p4w4 is best at every T" says only that feasibility never changes the winner here.
- The flip-flop count column parsed from `stat` was unreliable under `upsize`/`dnsize` (cell names change), so it is not used.

## Next steps
Repeat on `chip-systolic-*` arrays, where a fixed clock may remove more designs; add an OpenROAD post-route rung when installable; use the feasible front as the objective in `eda-fidelity`'s successive-halving replay.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 and ABC (apt); the SKY130 HD liberty from OpenROAD-flow-scripts (Apache-2.0, fetched at run time); NumPy (design generators) and matplotlib (figure). All code original, MIT.
