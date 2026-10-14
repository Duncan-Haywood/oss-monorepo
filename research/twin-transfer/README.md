# Twin transfer: what a digital twin is worth for training a controller

Pure Python, no dependencies. Scalar linear-quadratic plant `x' = a x + b u + w`; a controller is trained in a digital twin `(â, b̂)` and deployed on the plant. Exact results: the deployment cost `σ²(q+rk²)/(1−c²)`, `c = a−bk`, and the regret of the twin-trained gain (asymmetric, with a stability cliff at `b̂/b ≈ 0.21` where regret is infinite); a **validation blind spot** — the twin's one-step log-score gap is `[Δa²Ex² + 2ΔaΔb·Exu + Δb²Eu²]/(2σ²)`, zero for a passive log however wrong `b̂` is, and zero on the deployed policy itself along `Δa = kΔb` — so predictive fit does not certify control without probing; and the **worth of a twin in real transitions**: a twin with bias δ used as a ridge prior is worth exactly `σ²/(vδ²)` real probe steps at every accuracy target, and rescues small-sample divergence. Matched to simulation within 1–4%. See `paper/whitepaper.md`.

```bash
cd research/twin-transfer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, ~10 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt (~35 s)
```
Stylised scalar LQ, Gaussian noise, `a` known when identifying `b`; MIT.
