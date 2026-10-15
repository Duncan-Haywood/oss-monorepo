# Deadband twin: what does a twin with no actuator deadband promise a proportional loop, and what does the real one do?

Pure Python, no dependencies. Real actuator `dz(u) = u − d·sgn(u)` for `|u| > d`, else 0; twin actuator is the identity. On the servo `x+ = x + dz(−k x)` the real loop rests at exactly `|x| = d/k` (0.100000 / 0.500000 / 0.222222 simulated vs `d/k` for three settings) while the twin converges to ~1e-91, so a tolerance `ε` needs `k ≥ d/ε` and the twin certifies tolerances the real loop can never meet (twin: 7 steps to 0.2; real: 0.5 forever at k=0.4). A linear twin fitted from Gaussian excitation of std `s` recovers `2Q(d/s)` (0.0457 vs 0.0455 at `s=0.5`, 0.8414 vs 0.8415 at `s=5`), an excitation-dependent gain, while the small-signal gain is 0. Bisection with `n` real yes/no probes bounds the deadband error by `2^{-(n+1)}` of the bracket; compensating with the estimate leaves an exact `(d−d̂)/k` (under) or a period-2 chatter `(d̂−d)/(2−k)` (over): 8 probes cut the stall 0.7842 → 0.00047. See `paper/whitepaper.md`.

```bash
cd research/deadband-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # <2 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation workcells) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical: Stein's lemma (Stein 1981) and actuator-nonlinearity analysis (Tao & Kokotović 1996). Companion to `control-twin` (wrong actuator gain) and `saturation-twin` (missing actuator limit) in this repository.

Stylised: scalar integrator, symmetric deadband, noiseless observation, `k ≤ 1`, a simulated "real" system, no field data. MIT.
