# Latency twin: what a twin that omits sensor delay does to a tuned controller

Pure Python, no dependencies. Companion to `twin-transfer` and `twin-upkeep` (control-side sim-to-real) and to `occupancy-twin` / `radar-clutter-twin` (sensor twins). A scalar unstable plant `x⁺ = 1.1x + u + w` is controlled with the LQR gain `k0 = 0.703` designed in a twin that has no measurement latency. Under a real delay of `d` steps the exact stable-gain interval shrinks to `(0.1, 1.0), (0.1, 0.591), (0.1, 0.408)…` for `d = 1, 2, 3`, so `k0` tolerates only `d = 1` (cost 5.08 vs 3.15 for the delay-aware optimum, 1.61×) and is unstable from `d = 2`; a gain retuned for the delay recovers stability at 1.13×, 1.34×, 1.62×, 2.02×, 2.63× the optimum for `d = 1…5`. A predictor built for the wrong delay is unstable in nearly every off-diagonal cell tested. The number of probe samples needed to identify the delay grows as `z²·2(1+1/snr)`. See `paper/whitepaper.md`. Builds on the digital-twin fidelity and sim-to-real directions of the CAIRO, HIRO and RECUV groups (CU Boulder) and on classical delay-margin and predictor results (Smith; Åström and Wittenmark); no affiliation with any lab implied.

```bash
cd research/latency-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~15 s; output in experiments/results.txt
```
Stylised: scalar plant, known `a, b`, integer measurement delay, Gaussian noise, one parameter set in the tables; MIT.
