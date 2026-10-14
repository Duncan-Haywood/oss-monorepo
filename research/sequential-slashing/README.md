# Sequential (anytime-valid) slashing of verifiers

Stdlib-only Python. How should a protocol decide, while checking outcomes as they arrive, that a verifier's reported fault probabilities are miscalibrated, without slashing honest verifiers more than α of the time? See `paper/whitepaper.md`.

```bash
cd research/sequential-slashing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
PYTHONPATH=src python3 experiments/run.py                  # ~10 s; output in experiments/results.txt
```
Results: re-running a fixed-sample z-test at every step falsely slashes 37% of honest verifiers within 2000 rounds (nominal 5%); a likelihood-ratio e-process with Ville's inequality holds 3.8% (mixture: 2.0%); detection delay tracks Wald's `ln(1/α)/KL` to within 12% and grows only logarithmically in 1/α; not knowing the cheating rate costs a factor 1.36. Stylised; MIT.
