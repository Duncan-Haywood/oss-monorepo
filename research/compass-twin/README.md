# Compass twin: a twin with an ideal magnetometer returns the true heading, so how large is the error from hard-iron and soft-iron distortion, what does it do to a compass-held path, and how much of a turn does a swing calibration need?

Pure Python, no dependencies. Real system: planar magnetometer with hard-iron offset `β` (relative to the field `B`) and soft-iron axis scale `r`; twin: ideal compass. Results (all from `experiments/results.txt`): (1) hard-iron peak heading error is exactly `asin(β/B)` (1.146° at 0.02, 11.537° at 0.20, 53.130° at 0.80), the linear `β/B` is 14% low at 0.80; (2) soft-iron peak is exactly `asin(|1−r|/(1+r))` (6.379° at `r = 0.8`) and is untouched by removing the hard-iron offset; (3) a compass-held 100 m square misses its start by 2.000, 6.000, 20.000 and 60.000 m at `β/B = 0.01, 0.03, 0.1, 0.3`, i.e. `2Lβ/B` for every offset direction tried, while the ideal twin closes to 10⁻¹⁴ m; (4) a compass-held straight leg stays within 1 m cross-track for only 50, 20 and 10 m at `β/B = 0.02, 0.05, 0.10`; (5) a circle-fit swing calibration over a full turn has offset error `≈ 2σ/√n` (0.00400 at n = 100, σ = 0.02), which grows ×1.8 at 180°, ×12 at 90° and ×45 at 60° of turn, turning a 0.18° median heading residual into 2.2° and 10.7°. Stylised: level 2-D sensor, simulated "real" data, no gyro fusion, no ellipse fit; see `paper/whitepaper.md`.

```bash
cd research/compass-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, well under 1 s
PYTHONPATH=src python3 experiments/run.py                 # a few seconds; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>; perception and field robotics), the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>; UAV and field-robot navigation); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Magnetometer calibration follows Kåsa (1976) and Vasconcelos et al. (2011). Companion to `gyro-twin` and `odometry-twin` in this repository.

Stylised: simulated "real" system, no measured magnetometer. MIT.
