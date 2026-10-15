# Peer prediction without ground truth: output agreement, Dasgupta–Ghosh, and the gold-check rate

Stdlib-only Python. Workers report labels, are scored only against each other, and privately choose how much effort to spend. See `paper/whitepaper.md`.

```bash
cd research/peer-prediction-effort
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: output agreement pays 1.0 for "always report the majority label" vs 0.68 for honesty (and honesty stops being an equilibrium once the prior is skewed);
the Dasgupta–Ghosh payoff is exactly `2p(1-p)·g_i·g_j` (Monte Carlo agrees), uninformative equilibria pay 0; under peer scoring effort is a coordination game
(continuous effort: zero effort is unstable iff `α > c/(2p(1-p)κ²)`, threshold ×12.8 at p=0.02; fixed-cost effort: the shirking equilibrium survives unless a fraction
`r* = c/(A·g_H)` of comparisons use ground truth); cost-optimal gold-check rate `sqrt(c·g_H/G)` in closed form. Stylised; MIT.
