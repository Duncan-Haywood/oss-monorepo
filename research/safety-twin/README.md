# Safety twin: how wrong is a safety margin certified in a Gaussian-disturbance simulator when real gusts are heavy-tailed?

Pure Python, no dependencies. A stabilised vehicle keeps `|x_t|≤L` over `T=200` steps under `x_{t+1}=a x_t+w_t`; the twin draws `w` Gaussian, the "real" system a Student-t with the same variance, so a variance fit cannot tell them apart. The twin certifies `P(fail)≤δ` exactly (union bound over its Gaussian stationary tail); real failure at that margin is 0.29 (`ν=3`) / 0.19 / 0.13 / 0.052 (`ν=8`) for `δ=0.01` and 0.21 / 0.12 / 0.065 / 0.017 for `δ=0.001`. The margin the real system needs at `δ=0.001` is 7.3× / 3.5× / 2.3× / 1.25× the twin's for `ν`=3/4/5/8 and the ratio grows as `δ` shrinks (single-big-jump tail, checked against simulation). Inflating the twin variance to match real failure at `δ=0.05` still misses `δ=0.001` by 24× (0.024). Repairs: a conformal margin from real episodes is valid (mean real failure 0.010 at `δ=0.01`) but needs `n≥1/δ` episodes (1,000 for `δ=0.001`); a Hill tail fit to one-step disturbances needs no failures and, at `δ=0.001`, has real failure below target in 78%/93%/100% of repeats at `n`=500/2,000/10,000 samples. See `paper/whitepaper.md`.

```bash
cd research/safety-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~10 s
PYTHONPATH=src python3 experiments/run.py                 # ~90 s; output in experiments/results.txt
```

**Builds on.** The safe-autonomy and UAV/field-robot simulation direction of RECUV (<https://www.colorado.edu/recuv/>) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>), where controllers are validated in simulation before flight; no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical: single-big-jump tail asymptotics (Embrechts, Klüppelberg & Mikosch 1997), the Hill (1975) tail estimator, split-conformal quantiles (Vovk, Gammerman & Shafer 2005), statistical model checking (Legay, Delahaye & Bensalem 2010) and sim-to-real context (Zhao, Queralta & Westerlund 2020). Companion to `odometry-twin` (a persistent component that one-step fits cannot identify; here the tail *can* be identified from one-step data), `latency-twin`, `randomized-twin` and `twin-audit` in this repository.

Stylised: 1-D linear system, i.i.d. disturbance, union-bound certificates, a simulated "real" system, no flight data. MIT.
