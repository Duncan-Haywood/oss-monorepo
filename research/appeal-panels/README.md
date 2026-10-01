# Escalating appeal panels

Stdlib-only Python. An appeal ladder of jury panels (3 → 11 → 27 …) with fee-priced appeals: if the fee sits in the window `V(1−q) ≤ j·n < V·q` only the wrongly ruled truth side appeals and the final error is exactly `∏(1−M_k)`; below it both sides appeal and only the last tier counts, above it nobody appeals. Smallest deterring panel is 11 jurors at prize 100 (23 at 1000, 41 at 10⁴); the 3→11→27 ladder errs 2.4·10⁻⁴ at 5.8 expected seats vs 12.6% for a single 7-seat panel; shared jury bias `ρ` sets a floor `ρ(1−a)` no ladder removes. See `paper/whitepaper.md`.

```bash
cd research/appeal-panels
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Independent jurors, myopic appeals, exact enumeration checked by Monte Carlo; MIT.
