# Deadband noise twin: does measurement noise, or dither, hide an actuator deadband the twin lacks?

Pure Python, no dependencies. Follow-up to `research/deadband-twin`, which derives the noise-free stall `d/K` and the exact compensation residuals; this project adds measurement noise and dither. Integrator plant `x⁺ = x + f(u)`, `u = −K(x+n)`, K=0.5, d=0.1. The linear twin's exact stationary rms is `s√(K/(2−K))`. The real deadband loop's simulated rms is 27.6× that at `s=0.01` (0.1591 vs 0.0058), 1.6× at 0.04, then **below** it from `s=0.05` (0.0107 vs 0.0289): noise dithers the actuator, so real rms is non-monotone in `s` (0.2000 at s=0, minimum near 0.05). The twin is dangerously optimistic at low noise and conservative at high noise, so a validation run in the high-noise regime would call the deadband harmless. Deliberate dither `U(−a,a)` on the command cures the noise-free stall (rms 0.2000 → 0.0001 at `a=d`) but with noise the best amplitude shrinks (best listed 0.08 at s=0.02; a=0 at s=0.05, where a=d costs 0.0226 vs 0.0103). Inverse compensation at s=0.02 gives rms 0.1209 uncompensated, 0.0053 at d̂=0.08, 0.0116 at d̂=d, 0.0399 at d̂=0.15.

```bash
cd research/deadband-noise-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # ~6 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and HIRO Group (<https://hiro-group.ronc.one/>, manipulation actuators); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Dither and inverse-deadband compensation are classical (Zames & Shneydor 1976; Tao & Kokotović 1996). Companion to `deadband-twin`, `control-twin`, `saturation-twin` and `quantization-twin` in this repository.

Stylised: scalar integrator, known deadband shape, discrete time, a simulated "real" system, no field data. The noise, dither and compensation-under-noise numbers are simulations (200,000 steps, one seed each, no confidence intervals), not closed forms; the twin rms and the noise-free tests are exact. MIT.
