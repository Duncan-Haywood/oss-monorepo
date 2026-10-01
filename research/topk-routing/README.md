# Top-k routing as a capped market

Stdlib-only Python. Mixture-of-experts top-k gating as an expert-advice game where the router must pick `k` *distinct* experts each round. The fractional play lives on the capped simplex `{p ≤ 1, Σp = k}`; the capped-entropy (Hedge) market prices expert `i` at `min(1, λ·w_i)` with `w_i = e^{−ηL_i}` and a single shadow price `λ`. Includes the exact `O(N log N)` KL projection (KKT and minimiser checked), regret against the best fixed `k`-set compared with `k ln(N/k)/η + ηTk/2` on three streams (held in every run, at 41–58% of the bound), the failure of plain normalisation (prices above 1 make the play infeasible), and Madow systematic sampling to realise exactly `k` distinct experts (8–14× lower loss variance than independent draws in our runs). See `paper/whitepaper.md`.

```bash
cd research/topk-routing
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
The regret bound is checked numerically, not proved here (see limits in the paper); MIT.
