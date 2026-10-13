# Shutter twin: a global-shutter twin of a rolling-shutter camera ignores target motion, so how wrong is a twin-trained orientation estimate, and what does the same frame reveal?

Pure Python, no dependencies. Real sensor: rolling shutter, row `r` exposed at `t = r·τ/H` (H = 480 rows, τ = 30 ms); twin: global shutter. Target: a 200×120 px rectangle translating at `(u, w)` px/s and rotated by `θ`. Results (all from `experiments/results.txt`): (1) a moving target's image is a sheared, stretched rectangle with exact edge normals `n' = (cos θ, sin θ(1−wk) − cos θ·uk)` and `m' = (−sin θ, cos θ(1−wk) + sin θ·uk)`, `k = τ/H`, matching a row-by-row forward simulation to 10⁻¹⁵; (2) at `u = 1000 px/s` the vertical edges tilt by 3.58° and the horizontal ones by 0, so an estimator that averages the two edge families (what a global-shutter twin certifies) is biased by half of that, 1.79°; at `w = 1000 px/s` the target appears 6.7% taller; (3) one frame of a rectangle of known size identifies `(θ, u, w)` in closed form; with 0.25 px edge noise the orientation error falls from 0.24–0.97° (twin-trained) to 0.027° and speeds are recovered to 16 px/s (u) and 4.8 px/s (w); (4) the recovery of `w` is very sensitive to the assumed target size (a 5% height error moves `w` by about 800 px/s). Stylised: straight edges, constant velocity within a frame, known size, no lens distortion; see `paper/whitepaper.md`.

```bash
cd research/shutter-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # a few seconds; output in experiments/results.txt
```

**Builds on.** The digital-twin sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>), and the UAV and field-robot perception of RECUV (<https://www.colorado.edu/recuv/>) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Rolling-shutter geometry and single-view pose-and-velocity recovery follow Meingast et al. (2005) and Ait-Aider et al. (2006); this project is a small restatement with closed forms for a rectangle and a check of what a global-shutter twin gets wrong, not a new method. Companion to `doppler-twin`, `latency-twin` and `odometry-twin` in this repository.

Stylised: simulated "real" sensor, no camera data. MIT.
