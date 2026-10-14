# Compressed reports in local SGD

Pure Python, no dependencies. Companion to `noisy-local-sgd` and `partial-participation`: DiLoCo-style local SGD whose workers send compressed pseudo-gradients. Exact stationary loss for unbiased multiplicative compression (`α V_w (1+ω)/(M s (2−αsc))`, `c = 1+ω/M`, stable iff `αsc<2`, which contains random participation as `ω = 1/p−1`) and for dithered quantisation (`α (V_w+Δ²/12)/(M s (2−αs))`, stability unchanged), matched to simulation within 0.2–3%; at fixed bandwidth, sparsification favours few full reports while quantisation has an interior optimum near 1.3 bits per coordinate, ~4× below 8-bit reports. See `paper/whitepaper.md`.

```bash
cd research/compressed-outer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~5 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt (~4 min)
```
Quadratics, Gaussian noise, independent unbiased compressors; MIT.
