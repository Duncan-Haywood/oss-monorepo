# Quantization twin: what does a Kalman filter tuned in an ideal-sensor twin cost on a quantizing real sensor?

Pure Python, no dependencies. A twin models the sensor as `y = x + v` (variance `R`); the real sensor rounds to a grid of step `D`. Plant `x' = a x + w`, `a`=0.9, `Q`=1. The twin's steady-state gain is `K_t`; the "Sheppard" alternative treats quantization error as white noise of variance `D²/12` and tunes on `R + D²/12`. If that model were right the real MSE would be exactly `((1−K)²Q + K²(R+D²/12))/(1−(1−K)²a²)`. Measured by paired simulation (10⁵ steps, gain grid step 0.02; regrets below ~1% are grid/sampling noise): with `R`=1 the twin gain is within 0.1% of best up to `D`=1 and costs +1.4% at `D`=2, +11% at `D`=4, +19% at `D`=8; with `R`=0.01 (`D`/σ_v = 5…80) the twin costs +1% (`D`=0.5), +6.7%, +26%, +64%, +42% (`D`=8). The Sheppard gain is within 1% of the simulation-optimal gain in every one of the 12 configurations, and the Sheppard MSE formula is accurate to ~0.5% in most, but it under-predicts the real MSE by 28–43% at `D`=8 (`R`=1) and 9–43% at `D`≥4 or 8 with `R`=0.01 (0.73 vs 0.80 at `D`=4, 1.61 vs 2.82 at `D`=8), where the step exceeds the signal scale and the rounding error is no longer noise-like. So: retune the noise level, and do not trust the resulting MSE claim once `D` exceeds the state's standard deviation (≈1.5 here). See `paper/whitepaper.md`.

```bash
cd research/quantization-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>) and the UAV / field-robot state-estimation direction of RECUV (<https://www.colorado.edu/recuv/>). No specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Kalman (1960); Sheppard's correction for grouped data (Sheppard 1897); Widrow & Kollár (2008) on quantization-noise models. Companion to `filter-twin` (wrong noise levels) in this repository.

Stylised: scalar linear-Gaussian plant, mid-tread uniform quantizer, fixed gain, no saturation, no robot or sensor data. Preliminary. MIT.
