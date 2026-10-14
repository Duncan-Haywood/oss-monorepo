# Fog twin: a clear-air lidar twin vs real attenuation, closed-form detection range `W(αr0)/α`, and what a fog-blind twin does to a driving policy

Pure Python, no dependencies. Real system: lidar with hard-threshold detection of an extended Lambertian target through fog with extinction `α`; clear-air range `r0 = 100 m`. Results (all from `experiments/results.txt`): (1) in uniform fog the detection range solves `r e^{αr} = r0`, i.e. `r = W(αr0)/α`, and a clear-air twin overstates it by exactly `e^{αr}` (×1.34 at V = 1 km, ×2.32 at 200 m, ×6.8 at 30 m); (2) a relative error in the twin's extinction moves the range by the elasticity `W/(1+W) < 1` times as much (0.46 at V = 200 m); halving `α` still gives +32.7% range, quartering it +64.3%; (3) when fog density varies between episodes (lognormal, σ = 0.8), a policy that sets its speed to stop within its twin's believed range is violated with probability 1.000 (clear air), 0.500 (median extinction), 0.345 (mean extinction) and exactly 0.050 using the 5%-quantile range, which costs 43.5% of speed; closed forms match Monte Carlo to ±0.001; (4) with a fog bank, one extinction calibrated on a bright target underestimates a dark target's range by up to 29% and calibrated on a dark one overestimates bright targets by 61–168%, whereas in uniform fog calibration transfers exactly.

```bash
cd research/fog-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 15 tests, about 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 20 s; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>) and the field-robot digital-twin fidelity and safe-autonomy direction of RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Beer–Lambert attenuation and Koschmieder visibility are classical (Koschmieder 1924; Rasshofer et al. 2011); the Lambert W function follows Corless et al. (1996). Companion to `radar-detection-twin`, `fusion-twin`, `range-twin` and `multipath-twin`.

Stylised: simulated "real" system, no lidar data; hard threshold, Beer–Lambert medium with no backscatter clutter or multiple scattering, extended target only, assumed lognormal fog and fixed braking model. MIT.
