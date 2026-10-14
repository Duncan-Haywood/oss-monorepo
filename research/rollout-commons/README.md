# Rollout commons

Stdlib-only Python. Rollout sharing in a decentralised RL post-training swarm as a public-goods game. With diminishing returns `a ln(1+y)` and a peer rollout worth `θ` of an own one, symmetric Nash play gives every agent exactly the learning level of a lone agent (`y = a/c − 1`, total effort saturating at `(a/c−1)/θ`) while the efficient level grows linearly in N (welfare 4.5× at N=256); at `θ=1` only the best `a/c` agent generates; a per-rollout Pigouvian matching subsidy `θ Σ_{j≠i} a_j/(1+y_j)` (fraction `θ(N−1)/(1+θ(N−1))` of cost) implements the optimum exactly; junk rollouts beat honesty iff `c − ε > p(τ+F)`. See `paper/whitepaper.md`.

```bash
cd research/rollout-commons
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Log-value model, no rollout heterogeneity beyond `θ`; MIT.
