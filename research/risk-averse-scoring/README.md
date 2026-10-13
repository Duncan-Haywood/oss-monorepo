# Risk-averse verifiers under proper scoring rules

Stdlib-only Python. A verifier with CARA utility is paid by a proper scoring rule; what does it report? See `paper/whitepaper.md`.

```bash
cd research/risk-averse-scoring
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results (`k = αb`, risk aversion × score scale): under log score the report is exactly `odds^(1/(1+k))`; under Brier it solves `logit p = logit r + k(2r−1)`, so reports can be debiased exactly; both shrink toward ½. Aggregation by summing logits is exactly repaired by the factor `1+k` when `k` is known and is worse than doing nothing when a mean `k` is used with heterogeneous verifiers; a tempered report moves a `τ=0.9` accept threshold to 0.964 at `k=0.5`; a binarised (lottery) Brier rule is truthful for every increasing utility at a certainty-equivalent cost of 2.6–27%. Stylised (binary event, CARA); MIT.
