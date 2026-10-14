# Eliciting the tail of benign drift: VaR and expected shortfall

Stdlib-only Python. Verifiers forecast the upper tail of benign floating-point drift (a tolerance threshold and the mean drift beyond it); this project gives an exactly-checkable proper score for the pair (VaR, ES), and shows why pinball loss alone and ES alone both fail. Follows up the "CVaR via (quantile, expectile-like) pair" item left open in `research/property-elicitation-verification`. See `paper/whitepaper.md`.

```bash
cd research/tail-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Results: the 0-homogeneous score `ln e − 1 + (v + (y−v)₊/(1−τ))/e` is minimised exactly at (VaR_τ, ES_τ) and its profile over e is `ln` of the Rockafellar–Uryasev objective; ES alone is not elicitable (a 50/50 mixture of two ES=10 laws has ES 12.5); excess score has exact closed forms `ln r + 1/r − 1` for an ES misreport and `∫(F−τ)/(ES(1−τ))` for a VaR misreport (matched to 1e-10); pinball loss scores a forecaster with the right VaR and ES off by 30% identically to the truth, while the joint score separates them with ≈0.6–1.2k samples at τ=0.9–0.95 (≈4–7k at τ=0.99); the classical quantile-part weight λ scales signal and noise together and buys no power. Stylised; MIT.
