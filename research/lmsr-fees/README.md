# LMSR fees

Stdlib-only Python. A proportional fee `f` on an LMSR verification market gives every trader an exact no-trade band `[q/(1+f), (q+f)/(1+f)]` of width `f/(1+f)` whatever their belief, so a lone informed trader leaves the price at `q/(1+f)`. At price ½ a signal of log-likelihood ratio λ moves the price iff `f < tanh(λ/2)` (`= 2a−1` for accuracy `a`): above that the market is dead. Fee revenue on a monotone path is exactly `f·b·ln((1−p₀)/(1−p_T))`. With ten 0.65-accurate traders a break-even fee (~0.11) raises Brier error 0.115→0.16, and revenue is hump-shaped in `f`. See `paper/whitepaper.md`.

```bash
cd research/lmsr-fees
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Naive-price-taking traders, fee on gross purchase cost, synthetic signals; MIT.
