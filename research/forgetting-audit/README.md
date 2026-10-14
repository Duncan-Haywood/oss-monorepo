# Forgetting audit

Stdlib-only Python. Companion to `research/forgetting-law`: a trainer that skips tasks (probability `s`) or takes only a step fraction `a` of each converging step has an exact final-checkpoint loss on the task at position `t` of `T` (lag `k`): `ρ^{t−1}[(1−2m₁+m₂)(r/d)λᵏ + (r/d)ρ(ρᵏ−λᵏ)]` with `ρ=1−(2m₁−m₂)r/d`, `λ=1−2m₁r/d+m₂c₁` (`m₁=E a, m₂=E a²`), reducing to the forgetting law when honest. A skipped task is at least `d/(d−r)` times worse than a trained one at every lag but only clearly so inside a window (ratio ≥ 2 for lags ≤ 6.7 at `d=16, r=2`); yet catching a skipping trainer needs the same ~17–20 jobs at any audit lag (20% skipping) and scales as `N ≈ 0.7/s²`, while a 10% step shortfall needs ~9600 jobs. See `paper/whitepaper.md`.

```bash
cd research/forgetting-audit
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                  # ~2 min; output in experiments/results.txt
```
Linear regression, Haar-random task subspaces, one loss sample per job, z-test power by resampling; MIT.
