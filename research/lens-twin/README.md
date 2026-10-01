# Lens twin: a pinhole twin of a radially distorted camera mis-ranges the near field, so how far off does a twin-trained braking policy stop, and does calibrating the focal length fix it?

Pure Python, no dependencies. Real camera: Brown radial distortion `x_d = x(1 + k₁r²)`, camera height 0.5 m over a flat floor; twin: pinhole. Results (all from `experiments/results.txt`): (1) floor range read by the uncalibrated twin is off by exactly `1/(1 + k₁h²/R²)`: with `k₁ = −0.3`, +15.4% at 0.75 m, +8.1% at 1 m, +0.5% at 4 m; (2) a policy trained to stop at 1.0 m stops at 0.909 m (9.1 cm short; 16.4 cm short at 0.75 m), and the first-order formula `k₁h²/R₀` understates it when `ρ` is large; (3) a scene line bows by exactly `k₁dY²`; (4) least-squares focal calibration (`s = 1 + 3k₁ρ_max²/5`) moves the error rather than removing it: near-field 8.1% → 3.2%, new 4.4% far-field under-read, and a 4 m stop lands 17 cm long; (5) one image of a known 7×7 grid identifies `k₁` (RMS 0.001 at 0.002 normalised-pixel noise). Stylised: one distortion term, axis-column floor points, known grid pose, no real lens; see `paper/whitepaper.md`.

```bash
cd research/lens-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # a second; output in experiments/results.txt
```

**Builds on.** The digital-twin sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>), and the field-robot perception of RECUV (<https://www.colorado.edu/recuv/>) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Distortion model and calibration follow Brown (1971) and Zhang (2000); this is a small restatement with closed forms for ground-plane ranging and a check of what a pinhole twin gets wrong, not a new method. Companion to `shutter-twin`, `occupancy-twin` and `grid-twin` in this repository.

Stylised: simulated "real" sensor, no camera data. MIT.
