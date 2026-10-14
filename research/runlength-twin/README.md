# Runlength twin: how long must a real test run be when its length was sized in a wrong-pole twin?

Pure Python, no dependencies. A gain `K` is the LQR gain of a twin whose plant pole is `m·a`; the real closed-loop pole is `a_c = a − bK`. For a stationary Gaussian AR(1) the run mean of the cost has exact relative variance `(2/n)[(1+ρ)/(1−ρ) − 2ρ(1−ρ^n)/(n(1−ρ)²)]`, `ρ = a_c²` (matches the double sum and simulation), so the run length for a given half-width scales as `(1+ρ)/(1−ρ)` and the real/twin sizing ratio is `(1+ρ_r)(1−ρ_t)/((1−ρ_r)(1+ρ_t))`. Results, all from `experiments/results.txt` (`a`=0.9, `b`=1, `q`=1, ±5% at 95%): (1) the twin-sized run is too short by 3.8× at `m`=2, `r`=0.1 (3,177 vs 12,110 steps) and at `m`=0.5, `r`=5 (4,007 vs 15,069), and 2.1× too long at `m`=1.5, `r`=5; (2) the ±5% claim then has real coverage 0.685 and 0.688 (simulated 0.678, 0.673) against a nominal 0.95; (3) for `m`=3 the gain destabilises the real loop, so no run length exists; (4) sizing from a real pilot's lag-one autocorrelation is close to median-unbiased (5,142 vs 5,145 at 100 pilot steps) but under-sizes about half the time, so it needs a safety margin. See `paper/whitepaper.md`.

```bash
cd research/runlength-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~15 s; output in experiments/results.txt
```

**Builds on.** The sim-to-real and safe-autonomy direction of ARPG (<https://arpg.colorado.edu/>), RECUV (<https://www.colorado.edu/recuv/>) and the HIRO group (<https://hiro-group.ronc.one/>), where the length of a hardware validation run is budgeted from simulated rollouts; no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The variance of a time average of a correlated process is classical (Anderson 1971; Glynn & Whitt 1992; Geyer 1992); this project works out the exact scalar case and what the twin's wrong pole does to the sizing. Companion to `control-twin`, `horizon-twin` and `twin-audit` in this repository.

Stylised: scalar linear-Gaussian plant, fixed known gain, normal-approximation interval, pilot repair without a coverage guarantee. Preliminary. MIT.
