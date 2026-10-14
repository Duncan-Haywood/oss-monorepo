# Randomized twin: what domain randomization buys a controller, exactly

Pure Python, no dependencies. Companion to `twin-transfer`. The twin's input gain is randomised `b ~ U[b̂(1±ε)]` and one gain is trained to minimise the expected simulated cost (Gauss–Legendre quadrature of the exact LQ cost). Results: any sampled plant that destabilises the gain makes the training objective infinite (`ε < (1+a)/(b̂k) − 1`); the randomised gain is monotonically more conservative in `ε` with the small-width law `k_ε − k* = −(εb̂)² J_kbb/(6 J_kk)`; the price when the twin was right is quartic in `ε`; randomising removes the deployment cliff (regret 84 → 1.4 at `b = 2.3 b̂`); but a uniform-average objective is **not** minimax — its worst-case regret over the range is worse than the nominal gain's for `ε ≤ 0.7` — and the best width tracks the prior's half-width. See `paper/whitepaper.md`.

```bash
cd research/randomized-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Stylised scalar LQ, input-gain uncertainty only; MIT.
