# Replicate or skip? Stage redundancy for pipeline-parallel training

Stdlib-only Python. Pipeline-parallel training on unreliable workers: stage replication `r` versus a SkipPipe-style skip budget `s`, with correlated failure domains. See `paper/whitepaper.md`.

```bash
cd research/pipeline-replication
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: drop probability is the exact binomial tail `P(Bin(L,q)>s)`; replicas cannot beat the shared-domain floor `(1−ρ)^L` (at `L=48, ρ=10⁻³` no `r` reaches 1% drop, one skip fixes it with `r=3`); a four-stage skip budget halves the workers for a `10⁻³` drop rate (240 → 96); cost-optimal designs are skip-heavy for cheap skips and replicate as skips get costly. Stylised independent-outage model; MIT.
