# Straggler backup workers

Stdlib-only Python. Synchronous decentralised training that waits for the fastest `k` of `n` workers. Exact round-time laws (`E X_(k) = s + (H_n−H_{n−k})/μ`; Pareto closed form, finite iff `n−k+1 > 1/α`, so with `α ≤ 1` waiting for all has infinite mean time), an exact time-to-accuracy model for SGD on a quadratic with a minimum `k` and an interior optimum (34× over wait-for-all at `s=0`, 1.12× at `s=32`, 34× under Pareto(1.5)), joint step-size tuning (a fixed step overstates the gain), and the selection bias of the speed filter when speed correlates with data: exact bias `Σ(π_i/k−1/n)θ_i`, Horvitz–Thompson fixes it at a variance cost (worse with no coupling, 20–25% better with strong coupling). See `paper/whitepaper.md`.

```bash
cd research/straggler-backup
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Independent finishing times, quadratic objective, no strategic speed manipulation; MIT.
