# Gravity twin: a twin with no gravity says PD hits every target exactly, what does the real arm do?

Pure Python, no dependencies. Real plant: pendulum `θ'' = −g sin θ + u` (θ = 0 hangs down, g = 1 sets the units) under PD control `u = kp(θ* − θ) − kd ω` toward a target `θ*`. The twin omits gravity (`θ'' = u`): closed loop `s² + kd s + kp`, stable for every gain, zero steady-state error, independent of `θ*`. The real hold sags to the root of `kp(θ* − θ) = g sin θ` nearest the target (RK4 matches the root to six digits; sag 0.182 rad at `θ* = 1`, `kp = 4`, where the twin says 0), and falls only as `≈ g sin θ*/(kp + g cos θ*)` (first-order formula within 3% at `kp = 4`, exact to four digits by `kp = 100`). Holding upright (`θ* = π`) is stable iff `kp > g`: at `kp/g = 0.5, 0.9, 0.99` the twin-certified gain leaves the arm 1.90 / 0.79 / 0.24 rad from upright instead (simulated from 0.05 rad away), and just above the threshold the basin is tiny (an 0.116 rad start fails at `kp/g = 1.02`, 0.519 at 1.05, none below 3 rad from 1.1). A gravity feedforward `ĝ sin θ*` with calibration error leaves a sag proportional to `(g − ĝ)` (0.0185 rad at 10% low, −0.0186 at 10% high). Stylised: one joint, noiseless, rigid, no friction; see `paper/whitepaper.md`.

```bash
cd research/gravity-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 10 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>, UAV and field-robot simulation); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. PD regulation with gravity and the `kp > g` condition are classical (Takegaki & Arimoto 1981; Spong, Hutchinson & Vidyasagar 2006). Companion to `lag-twin`, `flex-twin`, `slew-twin`, `stiction-twin` and `control-twin` in this repository, which cover other features a twin omits.

Stylised: one pendulum joint, PD plus constant feedforward, noiseless, a simulated "real" system, no field data. MIT.
