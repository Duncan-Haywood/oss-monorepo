# Deadtime twin: a linear photon-counter twin of a single-photon lidar has no dead time, so it misses count saturation, a paralyzable-detector ambiguity, and a first-photon range bias that does not average out

Pure Python, no dependencies. Real system: a SPAD lidar detector with dead time `τ` (non-paralyzable `y = x/(1+x)` or paralyzable `y = x e^{−x}`, `x = nτ`), firing on the first photon of a Gaussian pulse with `N` expected photons. The twin is an ideal linear counter: observed = true, mean detection time unbiased with the pulse's std. Results (all from `experiments/results.txt`; Monte Carlo matches exact quadrature): (1) at `x = 1` the non-paralyzable detector reports half the flux and the paralyzable one 36.8%; (2) the paralyzable curve peaks at `y = 1/e`, so one reading has two fluxes, e.g. `y = 0.2` is `x = 0.259` or `2.543` (a twin reading `y` as flux is 12.7× too low on the high branch); (3) first-photon mean time bias is `−N/(2√π)σ` at small `N` (exact) and saturates near `−2σ`: −0.28σ at `N = 1`, −1.50σ at `N = 10`, i.e. −4.2 cm and −22.6 cm of range for σ = 1 ns, while the std shrinks to 0.62σ, so it is bias, not noise; (4) the Coates correction on the first-photon histogram brings the mean to within 0.02σ (+0.004, +0.005, −0.018 at `N = 1, 3, 10`).

```bash
cd research/deadtime-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 2 s; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>) and the digital-twin simulation-fidelity direction of RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Dead-time models are classical (Knoll 2010), the pile-up correction is Coates (1968), and single-photon lidar with Coates-style correction appears in Heide et al. (2018). Companion to `shot-twin` and `saturation-twin` (what a simplified detector twin gets wrong); citations in `paper/references.bib`.

Stylised: simulated "real" system, no sensor data; one Gaussian pulse, no background light, afterpulsing or crosstalk, a known pulse shape, and a constant dead time. The twin is a deliberately naive baseline. MIT.
