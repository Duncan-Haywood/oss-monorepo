# Private data market

Stdlib-only Python. A market that buys private data with a telescoping log score: each contributor releases a statistic plus Gaussian-mechanism noise and is paid the log-score gain of the public belief, whose expected value is exactly the information released, `(λ/2)ln(1+τ/a)`. The best noise is a closed-form quadratic root, and participation is possible iff `κa<1` with `κ=cΔ²/λ`: the market's precision is capped at `λ/(cΔ²)` no matter how many contributors arrive, approached geometrically at rate `2σ²/(2σ²+κ)`. The sequential market over-collects from early arrivals (first agent adds 1.5–5× too little noise, 1–22% welfare loss vs a planner), and with heterogeneous data admitting small holders first lifts final precision from 28.0 to 34.2. See `paper/whitepaper.md`.

```bash
cd research/private-data-market
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # ~10 s; output in experiments/results.txt
```
Gaussian statistics, ex-ante noise commitment, zCDP-linear privacy cost; MIT.
