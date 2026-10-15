# Bond-escalation dispute games

Stdlib-only Python. Escalating-bond disputes with a fallible final oracle, solved exactly: how small can the opening bond be, what does the defender's capital have to be, and what does latency buy? See `paper/whitepaper.md`.

```bash
cd research/escalation-bonds
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results (exact backward induction, cross-checked by a strategic-form Nash test on 300 random games): the largest opening bond at which a false challenge pays is `εV/((1−ε)C−εD)` (matched on 400 random instances) and falls geometrically in the number of rounds (20.4 → 10⁻⁵ over 21 rounds at γ=2) while the attacker's total outlay barely moves (20.41 → 20.62); against a capital-limited attacker the defender needs `γ·max{C(r) ≤ B_C}` ≤ `γ·B_C`, a sharp closed form (500/500 random matches), so the responder pays a factor γ per exchange; γ trades defender capital (∝γ) against latency (∝1/ln γ); griefing by lock-up is ~1% of the attacker's loss at 1% interest per round. Stylised: complete information, one attacker; MIT.
