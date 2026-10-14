# When to give up waiting for a human: what a light-tailed simulated human does to a collaborative robot's timeout

Pure Python, no dependencies. A collaborative robot waits for a human response (handover, confirmation, hand-guided step) and aborts after a timeout `τ`, at cost `w` per second waiting and `c` per abort: `J(τ) = w·E[min(T,τ)] + c·P(T>τ)`. Exactly, `J'(τ) = S(τ)(w − c·h(τ))`, so a simulated human whose response-time law has constant or increasing hazard (exponential, Weibull k≥1) has no interior optimum: its best timeout is a corner, and when `c > w·E[T]` it says "never abort". Real response times have heavy right tails (distraction, walking away); with a lognormal (σ=1.2) the optimum is the right-hand root of `h(τ)=w/c` (9.40 s, hazard 0.2000). Results, all from `experiments/results.txt`: in this base case the light-tailed twin's regret is small (0.073 on an optimum of 1.98, 3.7%), but it grows with tail weight and with cheap aborts (σ=1.6, c=1.5·w·E[T]: 37%; σ=2: 81%). A lognormal twin with the right mean and wrong σ recovers most of the value (σ_twin 1.0 or 1.4: under 0.5%). Fitting the correct family from `n` real trials costs `≈0.5·J''·Var(τ̂)`, matched by the delta method to within 11% (n=10: 0.0323 measured vs 0.0353; n=1000: 0.00034 vs 0.00035) and halving per doubling of `n`; 91% of fits at `n=10` already beat never-abort. See `paper/whitepaper.md`.

```bash
cd research/handover-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The human-robot collaboration and simulated-human-model directions of the CAIRO Lab (<https://cairo-lab.com/>) and the embodied/social-intelligence work of the HIRO Group (<https://hiro-group.ronc.one/>); no specific paper from either is reproduced and nothing here is affiliated with or endorsed by those labs. Timeout policies are optimal stopping / hazard-rate results in the reliability literature (e.g. Barlow & Proschan 1965, *Mathematical Theory of Reliability*); the lognormal response-time family follows common practice in human-timing models (e.g. Ulrich & Miller 1993, *J. Mathematical Psychology* 37(4)). Companion to the twin projects `twin-transfer`, `twin-recalibration`, `radar-clutter-twin`.

Stylised: one scalar response time, i.i.d. across trials, a single fixed timeout, linear waiting and abort costs, no real human data (the lognormal σ is a chosen value, not a measurement), no human adaptation to the robot's timeout. MIT.
