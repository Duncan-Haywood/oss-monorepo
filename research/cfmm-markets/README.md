# CFMM markets

Stdlib-only Python. A constant-product pool (Gnosis FPMM / Uniswap-style, invariant `∏ r_i = C0ⁿ`) is an ordinary cost-function prediction market with implicit cost `∏(C−q_i)=C0ⁿ`, prices `p_i ∝ 1/(C−q_i)` and worst-case maker loss `C0` (never attained). An informed trader who moves the price to their belief `π` earns exactly `C0(1 − n·GM(π))` (geometric mean) versus `C0(1 − H(π)/ln n)` for LMSR at equal worst-case loss: locally the CFMM concedes `ln n` times as much (cheaper than LMSR for n=2, dearer from n=3), but its price tails are polynomial (`(C0/gap)ⁿ`) so reaching p=0.999 costs 3.4× LMSR. As an expert router it obeys an exact regret identity `settlement ≤ C0` plus Bregman terms, and with regime switches it shows no advantage over Hedge. See `paper/whitepaper.md`.

```bash
cd research/cfmm-markets
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Symmetric (equal-weight) pools, no fees, no LP dynamics; MIT.
