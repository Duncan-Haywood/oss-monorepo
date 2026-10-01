# Lag twin: a twin with an instantaneous actuator promises any bandwidth, what does the real loop with actuator lag allow?

Pure Python, no dependencies. Unit mass under PD control `u_cmd = −kp x − kd v`, real actuator `τ u̇ = u_cmd − u`, twin `τ = 0`. The twin's closed loop `s² + kd s + kp` is stable for every positive gain; the real one, `τ s³ + s² + kd s + kp`, is stable iff `τ < τ* = kd/kp = 2ζ/ωn` (Routh; agrees with the roots in 168 of 168 grid cases). At the limit the loop hunts at exactly the twin's own natural frequency `ωn`, and just beyond it the growth rate is `ωn²/(2(1+4ζ²))·(τ−τ*)` (formula, numeric slope and a simulated rate agree to 4–6 digits). A twin-tuned "faster is better" design is therefore wrong: the real decay rate peaks at 0.26–0.46 of the limit `ε = ωnτ = 2ζ` and falls to zero at `ε = 2ζ` (τ = 0.05, ζ = 0.7: best ωn ≈ 8 with rate 4.8, zero at ωn = 28 where the twin promises 19.6), and since the poles sum to `−1/τ` no gains at all decay faster than `1/(3τ)` (triple pole at `ωn = 1/(√27 τ)`, ζ = √3/2). Mild lag is invisible in a step test (twin RMS error ≈ 0.04 ε) and even speeds decay slightly at ε = 0.1 (0.755 vs 0.700). Stylised: linear, one actuator lag, no noise; see `paper/whitepaper.md`.

```bash
cd research/lag-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, about 1 s
PYTHONPATH=src python3 experiments/run.py                 # about a minute; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>, UAV and field-robot simulation); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The Routh criterion and lag-limited bandwidth are classical (Åström & Murray 2008). Companion to `slew-twin`, `deadband-twin`, `backlash-twin`, `stiction-twin`, `latency-twin` and `control-twin` in this repository, which cover other actuator and sensor features a twin omits.

Stylised: unit mass, PD loop, one first-order actuator lag, noiseless, a simulated "real" system, no field data. MIT.
