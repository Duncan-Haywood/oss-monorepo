# Replicate twin: one long digital-twin run or many replications, when every run starts in the wrong state?

Pure Python, no dependencies. A fixed budget of `N` twin draws is split into `r` independent replications, each started at offset `δ` from steady state with its first `d` draws deleted. For an AR(1) the MSE of the grand mean and the coverage of the Student-t interval built from the replication means are exact (a noncentral-t integral, matched to simulation: 0.9212 vs 0.9207 at `r`=50, N=2000, φ=0.9). A single run minimises MSE; replicating costs at most 1.07× at φ=0.9 (`r`=50, N=20 000) but 2.2× at φ=0.99. At the MSE-optimal `d` the nominal-95% interval covers 0.921 at `r`=50, N=2000 and 0.918 at N=20 000, φ=0.99, and for `n`=40 draws per replication no `d` reaches 94%. Single-run 30-batch means were *not* worse here (coverage 0.925–0.945, narrower than the `r`=10 interval: 0.185 vs 0.22). For an M/M/1 instrument started empty (ρ=0.9, 6000 jobs, preliminary, 500 runs) 30 replications have bias −3.1 and cover 5.8%; none of the settings tried reach 95%. See `paper/whitepaper.md`.

```bash
cd research/replicate-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~10 s
PYTHONPATH=src python3 experiments/run.py                 # a few minutes; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and the lab-workcell twins of the HIRO Group (<https://hiro-group.ronc.one/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical simulation output analysis: replication-deletion (Law & Kelton 2000), batch means (Schmeiser 1982), MSER (White 1997). Follow-up to `warmup-twin` (which studies one run) and `autocorr-twin`.

Stylised: Gaussian AR(1) with one start offset, a simulated "real" system, no lab data; M/M/1 results are simulation-only with 500 macro-runs. MIT.
