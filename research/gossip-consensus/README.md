# Gossip consensus for decentralised training

Stdlib-only Python. How fast does pairwise gossip contract disagreement, what does local noise leave, and what can one stubborn node do? See `paper/whitepaper.md`.

```bash
cd research/gossip-consensus
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py                  # under a minute; output in experiments/results.txt
```
Results: E[Φ] contracts by exactly `1−1/(n−1)` per random pair and `(n−2)/(2(n−1))≈½` per matching round (~20 rounds for 10⁻⁶ at any n); noise floor `(n−1)(n−2)s²/n` matched to 0.3%; one stubborn node captures the honest mean at exact rate `1−1/(n(n−1))`; a τ-clip caps drift at `τ/(n(n−1))` per step (linear creep, not immunity). Stylised; MIT.
