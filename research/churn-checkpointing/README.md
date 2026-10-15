# Checkpointing under churn

Stdlib-only Python. How often should preemptible, decentralised workers commit checkpoints, and how far can synchronous training scale before churn eats it? See `paper/whitepaper.md`.

```bash
cd research/churn-checkpointing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: exact segment time `(1/λ+R)(e^{λ(w+C)}−1)` (matches Monte Carlo to 0.1%); exact optimal interval `w* = (1+W₀(−e^{−1−λC}))/λ`, independent of restart cost, with Young/Daly `√(2C/λ)` overshooting by 5% at `λC=0.01` and 25% at `λC=0.2`; intervals within 2× of `w*` cost ≤3.5% extra; a synchronous job on `n` workers restarts at rate `nλ`, so efficiency falls to 50% at `n≈691` (`λ=10⁻⁴`, `C=1`); adding flaky workers to a synchronous job cut throughput 5× (82 → 17). Stylised; MIT.
