# eda-systolicclock: does the systolic-array versus MAC-lane verdict of `chip-systolic` survive a shared SKY130 clock target?

Why it seemed worth doing: `eda-clocksweep` listed "repeat on `chip-systolic` arrays, where a fixed clock may remove more designs" as its next step. `chip-systolic` ranked an R x C systolic array against chip-accel's P-lane MAC engine by Yosys generic-gate cells x cycles and found the lane engine ahead. Generic cells carry no clock, and the arrays have long unconstrained critical paths (14 to 33 ns for 4-bit designs below), so the verdict could change once every design must meet one clock. Produced with AI assistance (Claude). Preliminary: one model, one ABC recipe, no wires, no place and route.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-systolicclock/

**Builds on.** `research/chip-systolic` (the 24 designs: 4xC arrays and P-lane engines, C and P in 1, 2, 4, 8, word length 4, 6, 8, batch of 4 vectors, cycle counts from its generators), `research/eda-clocksweep` (ABC target-period script, `feasible_front`), `research/eda-sky130rung` (flow), `research/eda-flowtune` (`fetch_pdk.sh`). Tools: Yosys 0.33 and ABC (apt), SKY130 HD `tt_025C_1v80` liberty at ORFS commit `e5cc6e799f`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- 24 designs x 7 settings = 168 mappings (`experiments/run.py`, 4 processes): `synth -flatten -noabc; dfflibmap; abc -liberty` with `strash; dc2; map -D T; topo; upsize -D T; dnsize -D T; stime` for T = 3, 4, 5, 6, 8, 10 ns, plus unconstrained `map`.
- A design meets T if ABC's critical-path delay is at most T; latency = cycles x T, so designs are compared by area x cycles among those that meet T (`src/eda_systolicclock/clock.py`). RTL equivalence to the integer reference is `chip-systolic`'s result and is not re-run.
- `experiments/analyze.py` writes `results.txt`; `experiments/figure.py` draws `tradeoff.png`.

## Reproduce
```bash
sudo apt-get install -y yosys && pip install numpy matplotlib
cd research/eda-systolicclock
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src:../chip-systolic/src python experiments/run.py   # ~10 min; fetches the PDK to /tmp/pdk/p
cd experiments && PYTHONPATH=../src:../../chip-systolic/src python analyze.py && python figure.py
```

## Results (`experiments/results.txt`, data `experiments/swept.json`)
- **The verdict survives.** At every target that any design meets, the best area x latency design is a MAC-lane engine (P=4, 4-bit) at every word length that has a feasible design; its best-systolic competitor (4x4, 4-bit) is 1.61x worse unconstrained and 1.66x worse at 5 to 10 ns.
- **A fixed clock removes many arrays.** Unconstrained, the 4-bit arrays take 12.8 to 32.9 ns; with a target they reach 3.5 to 4.8 ns at 3 to 4 ns. Designs meeting the target (systolic / lane out of 12 each): none at 3 ns, 0 / 3 at 4 ns, 2 / 7 at 5 ns, 3 / 9 at 6 ns, 8 / 12 at 8 and 10 ns. No 6- or 8-bit design meets 4 ns, so only the 4-bit lane engines are left there.
- **The front changes only at the slow end.** Unconstrained, the (area, cycles) front holds 4x8 and 4x4 arrays ahead of the lanes; at 4 ns it is three lane engines only (P=4, 2, 1); at 5 and 6 ns the 4x4 array returns and the 4x8 array is out; at 8 ns and above both arrays are back. So a conclusion drawn from the front depends on the clock, while the area x latency winner does not.
- **Sizing recovers little area.** Target mapping gives 4 to 9% less area than the unconstrained map for the 4-bit designs (table in `results.txt`), against the 3x to 7x critical-path cut for the arrays (WB=4: 14.3 to 4.3, 12.8 to 4.0, 15.6 to 3.5, 32.9 to 4.4 ns at 3 ns).
- Figure: `experiments/tradeoff.png`.

## Limitations
- ABC's `stime` delay is combinational only: no wires, clock tree, setup or clk-to-q, placement. "Meets T" is ABC's estimate. Not sign-off, not silicon.
- One quantised MLP, one batch size (4), one recipe, one run per setting (ABC is deterministic). Cycle counts are the generators' formulas, not re-simulated here.
- Latency = cycles x T assumes every design is clocked at exactly T; a design with slack could run faster, which would favour designs whose delay is well under T. The winner is therefore partly set by cycles, not the clock.

## Next steps
Re-run on larger batches (R = 8, 16) where arrays amortise their fill/drain cycles and may overtake lanes; an OpenROAD post-route rung when installable.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 and ABC (apt); the SKY130 HD liberty from OpenROAD-flow-scripts (Apache-2.0, fetched at run time); NumPy and matplotlib. All code original, MIT.
