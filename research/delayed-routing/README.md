# Routing modular experts when feedback is late

Stdlib-only Python. Hedge (= LMSR market) routing of experts when the loss of each round only becomes usable after a device-dependent delay. See `paper/whitepaper.md`.

```bash
cd research/delayed-routing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: with `D` = total number of outstanding rounds summed over decisions, fixed-rate Hedge has regret `≤ ln N/η + ηT/8 + ηD/2` (short proof, checked on random sequences and against an adaptive adversary), so a mean delay `d̄` inflates the horizon by `1+4d̄` and regret by `√(1+4d̄)`; against a punish-the-leader adversary a delay-blind rate has 12× the regret of the delay-tuned rate at d=100; measured regret is only 20–55% of the bound; on oblivious switching data the conservative delay-tuned rate is *worse* than the delay-blind one (215 vs 122); a rate built only from observable outstanding counts recovers most of the gap (154); for an LMSR router the liquidity (and subsidy) needed for a fixed per-round regret target grows about 20× at mean delay 5. Stylised; MIT.
