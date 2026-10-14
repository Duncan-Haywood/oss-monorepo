# Input-uncertainty twin: how much of a digital twin's error is that it was fitted to finite real data, however long it is simulated?

Pure Python, no dependencies. A shared lab instrument is an M/M/1 queue; its twin takes the arrival and service rates from `n` real interarrival and `n` real service times. Simulated for ever, the twin's mean wait is the single number `λ̂/(μ̂(μ̂−λ̂))`, so its whole error against the real system is input error that extra simulation cannot remove. The relative sd of that number is, by the delta method, `√(1+(2−ρ)²)/((1−ρ)√n)` (matched to simulation: 0.255 vs 0.257 at ρ=0.5, n=200), so the real data needed for a 10% sd is 1300 / 6100 / 22 100 / 84 100 observations per stream at ρ=0.5 / 0.8 / 0.9 / 0.95, growing as `(1−ρ)⁻²`. The fitted twin has no steady state with exact probability `P[F(2n,2n) ≥ 1/ρ]` (0.370 at ρ=0.9, n=20; 0.146 at n=200; simulation 0.369, 0.142). A twin whose wait is used as the truth certifies an SLA that is violated by 10% in 36–46% of fits (ρ=0.8/0.9, n=200/1000). Adding the delta-method upper bound repairs ρ=0.5 but under-covers at high load (coverage 0.87–0.89 at ρ=0.9 vs 0.95 nominal); parametric-bootstrap and posterior bounds reach 0.936–0.955 everywhere tested and cut false certification to 2–5%, at the price of certifying a compliant system (real wait 0.7 of the SLA) only 10–39% of the time. See `paper/whitepaper.md`.

```bash
cd research/input-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~15 s
PYTHONPATH=src python3 experiments/run.py                 # ~3 min; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and the lab-workcell twins of the HIRO Group (<https://hiro-group.ronc.one/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical input-uncertainty analysis for simulation (Cheng & Holland 1997; Barton & Schruben 2001; Henderson 2003; Barton 2012). Companion to `warmup-twin`, `autocorr-twin` and `queue-twin` in this repository, which treat the simulation-noise side of a twin's error.

Stylised: M/M/1 with exponential data from a simulated "real" system (no lab data), both rates estimated, the twin simulated to infinite length so simulation noise is zero by construction, one SLA margin (±10% / −30%), 1500 fits per certification cell. No finite-simulation-length trade-off is measured. MIT.
