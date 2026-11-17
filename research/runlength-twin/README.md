# Runlength twin: how long must a real test run be when its length was sized in a wrong-pole twin?

Pure Python, no dependencies. A gain `K` is the LQR gain of a twin whose plant pole is `m·a`; the real closed-loop pole is `a_c = a − bK`. For a stationary Gaussian AR(1) the run mean of the cost has exact relative variance `(2/n)[(1+ρ)/(1−ρ) − 2ρ(1−ρ^n)/(n(1−ρ)²)]`, `ρ = a_c²` (matches the double sum and simulation), so the run length for a given half-width scales as `(1+ρ)/(1−ρ)` and the real/twin sizing ratio is `(1+ρ_r)(1−ρ_t)/((1−ρ_r)(1+ρ_t))`. Results, all from `experiments/results.txt` (`a`=0.9, `b`=1, `q`=1, ±5% at 95%): (1) the twin-sized run is too short by 3.8× at `m`=2, `r`=0.1 (3,177 vs 12,110 steps) and at `m`=0.5, `r`=5 (4,007 vs 15,069), and 2.1× too long at `m`=1.5, `r`=5; (2) the ±5% claim then has real coverage 0.685 and 0.688 (simulated 0.678, 0.673) against a nominal 0.95; (3) for `m`=3 the gain destabilises the real loop, so no run length exists; (4) sizing from a real pilot's lag-one autocorrelation is close to median-unbiased (5,142 vs 5,145 at 100 pilot steps) but under-sizes about half the time, so it needs a safety margin. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/runlength-twin/

```bash
cd research/runlength-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 15 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~35 s; output in experiments/results.txt
```

**Builds on.** The sim-to-real and safe-autonomy direction of ARPG (<https://arpg.colorado.edu/>), RECUV (<https://www.colorado.edu/recuv/>) and the HIRO group (<https://hiro-group.ronc.one/>), where the length of a hardware validation run is budgeted from simulated rollouts; no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The variance of a time average of a correlated process is classical (Anderson 1971; Glynn & Whitt 1992; Geyer 1992); this project works out the exact scalar case and what the twin's wrong pole does to the sizing. Companion to `control-twin`, `horizon-twin` and `twin-audit` in this repository.

Stylised: scalar linear-Gaussian plant, fixed known gain, normal-approximation interval, pilot repair without a coverage guarantee. Preliminary. MIT.

## Known gaps (quality census 2026-11-17)

From the first audit, [`portfolio/quality/audits/2026-11-17-runlength-twin.json`](../../portfolio/quality/audits/2026-11-17-runlength-twin.json):

- No baseline against the procedure practitioners use: fixed-width sequential stopping with batch-means or spectral variance estimated from the real run (Glynn & Whitt 1992; Jones et al. 2006; Flegal & Jones 2010). The 0.685 coverage describes sizing that ignores the real run, and the core law is the textbook integrated autocorrelation time of an AR(1).
- The figure labels `m` "gain multiplier" (it scales the twin's plant pole) and `r` "noise ratio" (it is the LQR control weight).
- The "Builds on" paragraph says those groups budget hardware runs from simulated rollouts without citing where.
- `tests/test_pinned.py` now pins the headline row against a closed-form DARE and the textbook IACT; the sizing-ratio, coverage and Riccati mutants that survived before are caught.
