# Local-SGD / DiLoCo-style averaging: exact bias, step inflation, optimal sync interval

Stdlib-only Python. Periodic averaging of heterogeneous quadratic workers has a closed-form fixed point; this project works out what it implies for bias, verifiability of step counts, and the communication/accuracy trade-off. See `paper/whitepaper.md`.

```bash
cd research/local-sgd-bias
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: with `H` local steps a worker pulls the server iterate toward its own optimum with weight `1-(1-ηa_i)^H`, so the fixed point is the weight-averaged optimum: exactly unbiased at `H=1`, converging to the *unweighted* mean of the optima as `H→∞` (curvature information is lost), and not monotone in between (bias 0 → −0.094 at H=20 → +0.062 at H=500 in the example). Weighting workers by `a_i/w_i` removes the bias exactly (needs curvature). If the server trusts claimed step counts, a low-curvature worker moves the fixed point from 0.50 to 0.91 by claiming 100 steps instead of 5, so step counts must be verified. With a bias tolerance, the wall-clock-optimal `H` is 5.7× faster than `H=1` at comm cost 20 steps (63× at 500), but the feasible set is not an interval. Noise formulas match Monte Carlo to 1–5%. Stylised; MIT.
