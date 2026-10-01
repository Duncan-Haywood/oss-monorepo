# Warm-up twin: how much of a digital-twin run should be thrown away because it started in the wrong state?

Pure Python, no dependencies. A twin is started from a convenient state (empty queue, sensor at nominal), not from the steady state it is meant to represent. For an AR(1) started at offset `δ` the run-mean bias is exact, `δ φ^d (1−φ^m)/(m(1−φ))` for `m` kept draws after discarding `d` (matched to simulation: 0.3000 vs 0.3002 at φ=0.9, n=100), and so is its variance (`s²/m²[S_stat − (Σφ^t)²]`, 0.162 vs 0.161). The MSE-optimal warm-up is about one relaxation time `1/(1−φ)` and gains at most 1.5× MSE (φ=0.99, n=100), 1.03× once n is about 100 relaxation times: the transient matters only for short runs. For an M/M/1 lab instrument started empty the mean wait is biased low by 21% / 6% / 1.2% at ρ=0.9 with n=500 / 2000 / 10⁴ jobs (ρ=0.5: under 1%), but at n=5000 the bias (−0.14) is far below the run-to-run RMSE (2.4). Discarding does not pay: fixed 10% removes the bias and leaves RMSE at 2.60, 30% raises it to 2.93, and MSER-5 (White 1997) truncates a mean 376 jobs yet is *more* biased (−0.77), covers 60.7% vs 71.7% for no truncation, and passes a violating system (true mean 9, SLA 8) 28.1% of the time at n=3000 vs 18.1%. See `paper/whitepaper.md`.

```bash
cd research/warmup-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and the lab-workcell twins of the HIRO Group (<https://hiro-group.ronc.one/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical simulation output analysis: initial-transient deletion and MSER (White 1997; Law & Kelton 2000) and batch means (Schmeiser 1982). Companion to `autocorr-twin` (which treats the stationary part of a run) and `queue-twin` in this repository.

Stylised: Gaussian AR(1) with a deterministic start and M/M/1 waits from an empty queue, one run length per table, batch count fixed at 30, a simulated "real" system, no lab data. MSER-5 is tested only in its plain form (no other truncation heuristics, no replication-deletion). MIT.
