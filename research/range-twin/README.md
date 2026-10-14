# Range twin: a twin whose sensor reads at any distance says the loop converges geometrically, what does a range-limited sensor do?

Pure Python, no dependencies. Real sensor reads `clip(x, −R, R)`; twin reads `x`. The P loop `x+ = x − k·y` is speed-capped at `kR` beyond `R`, with exact step-count law `⌈(x0−R)/(kR)⌉ + ⌈ln(tol/x1)/ln(1−k)⌉` (108/108 cases match simulation); for `k=0.25` the twin says 49 steps from `1000R` and the real loop takes 4021 (82×), with error linear in `x0/R` (slope `1/k`). For a PI loop the twin's overshoot is neither bound nor lower bound: real overshoot is smaller at 2–5R, 4.1× larger at 1000R (870R vs 211R), and settling is 2006 vs 37 steps; conditional integration repairs overshoot but not settling. Overshoot/R is exactly scale invariant. Logs within range fit the gain exactly (and so cannot reveal `R`); from logs uniform on `[−L,L]` the fitted gain factor is `1.5q−0.5q³`, `q=R/L` (Monte Carlo matches to 3·10⁻⁴). See `paper/whitepaper.md`.

```bash
cd research/range-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # <2 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>, radar/lidar sensing), the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Anti-windup is classical (Åström & Rundqvist 1989). Companion to `beam-twin`, `dropout-twin`, `saturation-twin` and `backlash-twin` in this repository.

Stylised: scalar loop, symmetric hard clip, noiseless, three gain settings, a simulated "real" system, no field data. MIT.
