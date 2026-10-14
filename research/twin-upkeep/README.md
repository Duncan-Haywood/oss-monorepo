# Twin upkeep: what it costs to keep a digital twin in sync with a drifting plant

Pure Python, no dependencies. Companion to `twin-transfer` and `randomized-twin` (which ask what a *fixed* twin is worth). Here the physical plant's input gain drifts (wear, load, temperature) and the twin is a Kalman filter that tracks it from closed-loop data while a certainty-equivalent controller plays the gain the twin implies. Results: the steady-state tracking variance has a closed form (`m = q/2 + √(q²/4 + qσ²/v)` for a random walk, a quadratic root for AR(1) drift) that matches closed-loop simulation to 1–5%; its control regret is `½ J_kk (dk*/db)² m`; a twin frozen after calibration loses half its advantage over the population mean in `ln 2 / (2(1−ρ))` steps; a dedicated probing (dither) budget never pays for one drifting parameter (information price 0.70 vs marginal value ≤ 0.04), but for two parameters the closed-loop blind direction makes a fixed-gain twin blind and the mean-field optimal dither scales as `q^{1/6}` — while simulation shows the controller's own gain jitter supplies most of that excitation. See `paper/whitepaper.md`.

```bash
cd research/twin-upkeep
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 13 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```
Stylised scalar LQ, Gaussian drift, mean-field information energy; MIT.
