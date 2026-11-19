# Straggler backup workers

Stdlib-only Python. Synchronous decentralised training that waits for the fastest `k` of `n` workers. Exact round-time laws (`E X_(k) = s + (H_n−H_{n−k})/μ`; Pareto closed form, finite iff `n−k+1 > 1/α`, so with `α ≤ 1` waiting for all has infinite mean time), an exact time-to-accuracy model for SGD on a quadratic with a minimum `k` and an interior optimum (34× over wait-for-all at `s=0`, 1.12× at `s=32`, 34× under Pareto(1.5)), joint step-size tuning (a fixed step overstates the gain), and the selection bias of the speed filter when speed correlates with data: exact bias `Σ(π_i/k−1/n)θ_i`, Horvitz–Thompson fixes it at a variance cost (worse with no coupling, 20–25% better with strong coupling). See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/straggler-backup/

```bash
cd research/straggler-backup
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 13 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                  # ~6 s; output in experiments/results.txt
```
Independent finishing times, quadratic objective, no strategic speed manipulation; MIT.

## Known gaps (quality audit 2026-11-19)

The [audit](../../portfolio/quality/audits/2026-11-19-straggler-backup.json) reproduced every number but found the write-up short of the research bar. Fixed in the audit's PR: the "fewest workers to drop" rule now reads `⌊1/α⌋` (it said `⌈1/α⌉−1`, wrong when `1/α` is a whole number), `sgd_rounds` returns `inf` instead of crashing for steps with `|1−ηa| ≥ 1`, and tests now pin the Pareto finiteness boundary and the Hájek estimator. Still open: the nearest prior work (Dutta et al., AISTATS 2018, on K-sync SGD round times and error against runtime; Cho, Wang & Joshi, AISTATS 2022, on fastest-worker selection bias; Dean & Barroso 2013) is not cited, so sections 2 and 3 overstate novelty; the E4 gain from tuning the step with `k` comes from a 1-D quadratic where `η ≈ 1/a` solves it in one round and vanishes at `a = 0.1`; and "Hájek is a safe default" is contradicted by the paper's own table at `k = 2`.
