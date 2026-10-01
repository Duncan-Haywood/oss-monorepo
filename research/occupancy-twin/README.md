# Occupancy twin: what a too-clean sensor twin does to a mapper's commit decisions

Pure Python, no dependencies. Companion to `radar-clutter-twin` (sensor simulation for detection) and the `twin-*` projects. A grid cell is committed free/occupied when its log-odds, built with the sensor model of a *twin*, reach `±A` with `A = ln((1−ε)/ε)`. Under the real sensor the walk has a different drift, and the real error is set by the Lundberg exponent `θ*` (root of `p e^{θa}+(1−p)e^{−θb}=1`, equal to 1 for a correct twin): `P(error) ∈ [(1−e^{−θA})/(e^{θ(A+a)}−e^{−θA}), (1−e^{−θ(A+b)})/(e^{θA}−e^{−θ(A+b)})]`, rigorous by optional stopping. With a twin whose free-space false-hit rate is 0.05 and a real one of 0.15, a mapper designed for 1e-3 errs 1.45e-2 (14.5×, exact by dynamic programming, simulation 1.32e-2); an optimistic hit rate for occupied cells (0.8 vs real 0.6) gives 25.8×. Commit at `ln(1/ε)/θ*` instead and the error returns below target at 1.4–16× the latency; estimating `θ*` from real known-free observations needs several hundred samples before the tempered mapper stops exceeding target in over a quarter of maps. See `paper/whitepaper.md`. Builds on the sensor-simulation and sim-to-real perception directions of the ARPG group (Heckman, CU Boulder) and on classical occupancy mapping (Elfes; Thrun et al.) and sequential testing (Wald); no affiliation with any lab implied.

```bash
cd research/occupancy-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # a few minutes; output in experiments/results.txt
```
Stylised: one independent-beam cell, binary hit/miss sensor, flat prior, known real rates in the exact calculation; MIT.
