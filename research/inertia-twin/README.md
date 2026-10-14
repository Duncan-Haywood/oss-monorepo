# Inertia twin: a point-mass twin of a rolling body ignores rotational inertia, so how wrong are acceleration, slip and coast distance, and what does one calibration fix?

Pure Python, no dependencies. Real system: a body with `I = k m r²` (sphere, disc, hoop) rolling or slipping on an incline, simulated with exact stick/slip logic; twin: frictionless point mass. Results (all from `experiments/results.txt`): (1) the twin overstates down-ramp acceleration by exactly `1+k` (1.4, 1.5, 2.0), so a 2 m descent takes 0.90 s instead of 1.07–1.28 s; simulation matches `g sinα/(1+k)` to 3·10⁻⁴ m/s²; (2) the slip threshold `μ* = k tanα/(1+k)` (0.1925 for a disc at 30°) is invisible to the twin, whose prediction does not depend on friction; (3) a launch speed chosen in the twin to coast 1 m carries a rolling body 40%, 50%, 100% farther; (4) a gain fitted on one shape removes its own error but leaves −16% to +20% fall-time error on the others, a pooled fit leaves +6.7% to −10.7%, and the twin cannot rank the shapes (all tie). Stylised: planar incline, Coulomb friction, no rolling resistance or drag, textbook mechanics not measurements; see `paper/whitepaper.md`.

```bash
cd research/inertia-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # about a second; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of HIRO (<https://hiro-group.ronc.one/>) for manipulation and of ARPG (<https://arpg.colorado.edu/>) and RECUV (<https://www.colorado.edu/recuv/>) for field robots; no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The mechanics is textbook (Goldstein et al. 2002); the sim-to-real framing follows Zhao et al. (2020). Companion to `friction-twin`, `slip-twin` and `drag-twin` in this repository.

Stylised: simulated "real" system, no hardware data. MIT.
