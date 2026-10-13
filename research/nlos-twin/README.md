# NLOS twin: how wrong is a twin's localisation error when real ranges have non-line-of-sight bias?

Pure Python, no dependencies. A twin draws every anchor range as true distance plus Gaussian noise; real sites also have non-line-of-sight (NLOS) ranges biased long by an exponential excess path. On a ring of anchors (σ=0.3 m, excess mean 3 m) the rms position error is exactly `GDOP·√(σ²+p(2−p)m²)` (simulated 1.105 vs law 1.095 m at p=0.1, n=6), 4.5× / 7.3× the twin's at p=0.1 / 0.3, with zero mean: uniform NLOS is spread, not bias. Structured NLOS (a blocked side) is a bias the linear formula `(HᵀH)⁻¹Hᵀμ` predicts to about 0.02 m per coordinate (0.924 predicted vs 0.930 simulated for two blocked anchors), while the twin predicts zero. Sized on the twin, a 1 m / 95% corridor needs 4 anchors at any NLOS rate; the NLOS site needs about 28 (p=0.1) or 46 (p=0.2), and the 4-anchor ring leaves the corridor 34.7% of the time instead of 5%. Dropping the largest-residual anchor cuts rms error 0.947→0.414 m at p=0.1 (n=8) but costs 24% when there is no NLOS. See `paper/whitepaper.md`.

```bash
cd research/nlos-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The radar/lidar sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>) and the field-robot twin direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Methods are classical: dilution of precision (Langley 1999) and TOA NLOS mitigation (Guvenc & Chong 2009). Companion to `fusion-twin`, `radar-clutter-twin` and `odometry-twin` in this repository.

Stylised: 2-D ring geometry, iid exponential NLOS, linearised error model checked against Gauss–Newton fixes at the ring centre only, simulated "real" site, no sensor data; anchor counts in result 3 are from a 2000-draw first-crossing search. MIT.
