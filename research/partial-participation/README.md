# Partial participation in local SGD

Pure Python, no dependencies. Companion to `noisy-local-sgd`: DiLoCo-style local SGD where each of `N` workers joins a round with probability `p`. Exact stationary loss for participant averaging (`α V_w E[1/K|K≥1] / (s(2−αs))`) and for a fixed expected-count normaliser (`α V_w / (Np s(2−αsc))`, `c = 1+(1−p)/(Np)`, stable iff `αsc<2`), matched to simulation within 0.5%; at matched speed the fixed normaliser is quieter at small steps by `E[K|K≥1]E[1/K|K≥1]` and averaging wins only at fast rates; and reliable workers bias the fixed point unless displacements are inverse-propensity weighted. See `paper/whitepaper.md`.

```bash
cd research/partial-participation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Quadratics, Gaussian noise, independent Bernoulli participation; MIT.
