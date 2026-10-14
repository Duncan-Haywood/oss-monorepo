# Friction twin: a twin with viscous-only friction never stops, how wrong is its stopping distance?

Pure Python, no dependencies. Real coast-down `m v' = −b v − c` (viscous plus Coulomb friction) stops in finite time with exact distance `(m/b)[v0 − (c/b) ln(1 + b v0/c)]` (matches RK4 to 9.4e-9); the viscous twin `m v' = −k v` has distance `m v0/k` and only decays exponentially (6.5 s, 12.1 s, 17.7 s to reach 1e-3, 1e-6, 1e-9 from `v0`=3 vs 1.95 s real). The least-squares fitted gain is `b + c·E[v]/E[v²]`, so it depends on the logged speed range (1.23 on [1,3], 3.44 on [0.05,0.3]). Fitted on [1,3] the twin overestimates the stopping distance ×1.8 at `v0`=1 and ×17 at 0.05, is exact at `v*`=7.34 and underestimates (×0.835 at 100) above it. Negative result: no single viscous `k` covers a wide range, since even the minimax gain has worst relative error 0.87 over [0.05,3]; affine regression recovers `(b, c)` exactly. See `paper/whitepaper.md`.

```bash
cd research/friction-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # <1 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The friction models are classical (Armstrong-Hélouvry et al. 1994; Olsson et al. 1998). Companion to `backlash-twin`, `deadband-twin` and `slew-twin` in this repository.

Stylised: one-dimensional mass, symmetric Coulomb plus viscous friction, noiseless logs, a simulated "real" system, no field data. MIT.
