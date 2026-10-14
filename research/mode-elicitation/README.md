# Mode elicitation

Stdlib-only Python. The mode of a drift distribution is not elicitable, but the centre of the width-`2α` window holding the most mass is, with the bounded loss `1[|y−r|>α]`. Exact regret is a window-mass difference, the best window is `α=σ` (normal) and `σ/√3` (Cauchy, where the mean does not exist), a 50/50 bimodal mixture at separation `μ` has a single α-mode iff `α ≥ α*` (closed form), and against a contaminating cheater the α-mode keeps ~0.0 bias where the mean drifts by `εμ`. See `paper/whitepaper.md`.

```bash
cd research/mode-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral verifiers, known mixture family, one report per task; MIT.
