# Compressed sync in local SGD

Pure Python, no dependencies. Companion to `noisy-local-sgd`: DiLoCo-style local SGD where each worker sends an unbiased *compressed* displacement. Coordinate-wise compression (rand-k, relative variance `ω`) has exact floor `α V_w (1+ω)/(N s ((2−αs) − αsω/N))` and stability limit `αs(1+ω/N) < 2` (more workers restore the step, never the floor); norm-scaled quantisation (QSGD-style) has a closed form through one scalar `T = E|d|²` and redistributes the same error energy across modes (equal loss to 4 digits at `H=1`, about 10% worse at `H=16`, stiff mode's variance doubled); and at equal communication, syncing `1/ρ` times less often leaves the floor unchanged at `α=1`, whereas keeping a fraction `ρ` multiplies it by `1/ρ`. Matched to simulation within 2%. See `paper/whitepaper.md`.

```bash
cd research/compressed-sync
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~5 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Quadratics, Gaussian noise, independent unbiased compressors; MIT.
