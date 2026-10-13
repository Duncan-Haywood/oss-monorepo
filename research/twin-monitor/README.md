# Twin monitor: anytime-valid monitoring of a deployed digital twin

Pure Python, no dependencies. Companion to `twin-transfer`. A mixture e-process over the twin's closed-loop prediction residuals gives a peeking-safe alarm (2.3% false alarms vs 51.6% for a repeatedly refit χ² test at nominal 5%); its detection rate is exactly the twin-transfer score gap `[(Δa−kΔb)²E x² + Δb²v]/(2σ²)`, affine in the dither `v`; a **blind line** `Δa = kΔb` of twins is invisible without dither (rate exactly 0) but has rate `Δb²v/2σ²` with it; most blind twins have tiny regret so dithering does not pay, but the one that believes actuation is nearly dead (regret 0.23) is worth detecting with a `v≈0.006` dither that cuts expected cost 12×. See `paper/whitepaper.md`.

```bash
cd research/twin-monitor
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 13 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt (~40 s)
```
Stylised scalar LQ, Gaussian noise; MIT.
