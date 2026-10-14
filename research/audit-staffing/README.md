# Audit staffing

Stdlib-only Python. A refereed-verification protocol deters cheating only if a fraction `a = G/(G+S)` of jobs is audited, so stake fixes the audit stream and the audit stream must be *staffed*. Exact Erlang-C waiting (checked against simulation), square-root safety staffing (`c = R + 1.06√R` for P(wait) ≤ 0.2: 60% spare capacity at R=5, 1.1% at R=10⁴), and a stake-versus-capacity trade-off with first-order optimum `G+S = √(w s G/(r d₀))` (exact 9.68 vs rule 9.00; total cost 24 at the optimum against 77 at S=0.5 and 65 at S=60). Bursty audit demand breaks the usual Allen–Cunneen correction: batch size 4 gives 1.45 mean wait against a predicted 0.82. See `paper/whitepaper.md`.

```bash
cd research/audit-staffing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
M/M/c and M/G/c queues, static outages, stylised costs; MIT.
