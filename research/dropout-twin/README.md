# Dropout twin: how wrong is the smallest obstacle a lidar twin certifies as detectable when real beam dropout is clustered?

Pure Python, no dependencies. A thin obstacle subtends `m` adjacent lidar beams and is detected iff at least `k` return. Every beam drops with marginal probability `p=0.10`; the twin drops beams i.i.d., the "real" sensor as a two-state Markov chain along the scan with the same `p` and lag-1 correlation `λ` (dust, glare, an absorbing patch). The exact miss probability is a small DP (matched to enumeration and to 200,000-scan Monte Carlo); for `k=1` it is `p·q^(m−1)` with `q=p+λ(1−p)`, so the real/twin ratio is `(1+λ(1−p)/p)^(m−1)`. The width certified for miss ≤ 10⁻³ is `m=3` (`k=1`) in the twin; the real miss there is 0.041 / 0.067 (41× / 67×) at `λ`=0.6 / 0.8, and the real sensor needs `m`=12 / 25, i.e. the certified detection range is 4× / 8.3× too long (`k=2`: 2.8× / 5.4×). Inflating the twin's drop rate to match real miss at one width is wrong at every other width (at `m₀=4` it certifies `m=8`, real miss 4.4×10⁻³, not 10⁻³). Fitting the chain's `(q,r)` from an `n`-beam log of a flat target recovers the median width (12) but 40% of repeats still miss δ at `n=5,000` (the width is discrete and δ sits on a knife edge); two extra beams cut that to 1% at `n=5,000`. See `paper/whitepaper.md`.

```bash
cd research/dropout-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~60 s; output in experiments/results.txt
```

**Builds on.** The radar/lidar sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>) and the field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical: the two-state Markov (Gilbert–Elliott) burst-error channel (Gilbert 1960; Elliott 1963), run-length/scan statistics (Balakrishnan & Koutras 2002), and sim-to-real context (Zhao, Queralta & Westerlund 2020). Companion to `odometry-twin` and `safety-twin` (a distributional feature a marginal fit cannot see), `occupancy-twin` and `radar-clutter-twin` in this repository.

Stylised: 1-D beam sequence, two-state dropout with one obstacle in one scan (no range/reflectivity dependence or temporal persistence across scans), a simulated "real" sensor, no lidar data. MIT.
