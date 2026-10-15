# Kelly markets: wealth-weighted expert routing

Stdlib-only Python. Agents bet a fraction `λ` of wealth Kelly-style in a binary market; the clearing price is the `λ·wealth`-weighted mean belief and wealth follows a conserved multiplicative update. This gives an exact Bayes identity at `λ=1`, a per-expert `ln(1/s₀)/λ` regret bound, a closed-form growth-optimal fraction `(π−p)/(q−p)`, and a manipulation cost `V·χ²(p₀‖p)` compared with LMSR. See `paper/whitepaper.md`.

```bash
cd research/kelly-markets
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: `λ=1` reproduces the Bayes mixture to 1e-8; regret bound holds against adversarial sequences but is loose (0.08–1.0 of bound on i.i.d. data); manipulation costs `Vχ²` (matches LMSR `b·KL` for small shifts at `b=2V`, 7.5× stiffer at price 0.99); on a switching truth full Kelly is wrong about half the time (regret ≈1630 at T=4000 for every period) while `λ≈0.1–0.2` cuts it 3–7×. Binary events, static experts, stylised; MIT.
