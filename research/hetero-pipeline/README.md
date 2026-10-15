# Heterogeneous pipeline partition

Stdlib-only Python. Cutting a layer chain into contiguous stages for devices of unequal speed and memory. Greedy filling is an exact feasibility test for a fixed device order (checked against an independent DP, with and without memory caps); every order obeys `W/V ≤ T* < W/V + m·w_max/V`; a speed-blind equal split costs exactly `v̄/v_min` × the lower bound (2.40× at log-speed σ=0.5, 8.25× at σ=1) versus 1.014× for aware cutting; the device order is the residual decision (worst/best 1.34× at L=14, sorts no better than arbitrary, swap search within 1.1%, penalty fading to 1.03× at L=224); memory inversely related to speed inflates the bottleneck 1.7×. See `paper/whitepaper.md`.

```bash
cd research/hetero-pipeline
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Static speeds, no communication cost; MIT.
