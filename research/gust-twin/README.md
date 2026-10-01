# Gust twin: a twin whose wind gusts are matched to the logged variance, step by step, how wrong is the position variance of a PD-held vehicle?

Pure Python, no dependencies. Real system: unit-mass position error `x'' = −k_p x − k_d x' + d` with an Ornstein–Uhlenbeck gust `d` (variance `s²`, rate `a`). Twin A draws iid `N(0, s²)` gusts each step of length `dt`. Twin B is a white-noise twin with the real low-frequency spectral density `2s²/a`. Results (all from `experiments/results.txt`; `k_p=1`, `k_d=1.4`, `s²=1`): (1) the real variance is exactly `s²(a+k_d)/(k_d k_p (a²+a k_d+k_p))` (Lyapunov equation, verified against the exact discretised joint SDE); (2) twin A gives `s² dt/(2 k_d k_p)`, so real/twin = `2(a+k_d)/(dt(a²+a k_d+k_p))`: 141× at `a=1, dt=0.01` (270× at `a=0.05`, 4× at `a=50`), and the twin's standard deviation scales as `√dt`, so refining the step changes its answer (real/twin std 3.8, 11.9, 37.6 at `dt` = 0.1, 0.01, 0.001); (3) twin B is always conservative, real/twin = `a(a+k_d)/(a²+a k_d+k_p) < 1` (0.07 at `a=0.05`, 0.71 at `a=1`, 0.99 at `a=10`); (4) a margin for exceedance probability 1e-3 set by twin A is exceeded with probability 0.78 on the real system; (5) fitting `(a, s²)` from logged wind at 0.1 s spacing recovers the real variance to within 20% at 1000 samples and 1% at 10⁵.

```bash
cd research/gust-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, about 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 10 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of RECUV (<https://www.colorado.edu/recuv/>; UAV and field-robot simulation, targeted observation of severe weather), the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and ARPG (<https://arpg.colorado.edu/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Stationary variance of linear systems under coloured noise is classical (Åström 1970; Gardiner 2009). Companion to `safety-twin` (heavy-tailed gusts), `autocorr-twin` (autocorrelated outputs), `jitter-twin` (persistence of delay) and `sample-twin`.

Stylised: simulated "real" system, no wind data; linear second-order loop, one gust axis, Gaussian OU gusts. MIT.
