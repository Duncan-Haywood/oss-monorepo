# Aliasing twin: what does a radar twin with unlimited unambiguous velocity over-certify?

Pure Python, no dependencies. A pulsed Doppler radar reports radial velocity modulo `2V`; a twin that renders velocity as a real number has no aliasing. For the mean of `n` returns `y = μ + N(0, s²)` wrapped to `[−V, V)`, the real bias is an exact Gaussian tail series (`−V` at `μ=V`, `−2V` beyond), and the exact real MSE (Gaussian partial moments over wrap cells) has a floor `bias²`, so averaging makes the gap to the twin's claim `s²/n` grow: at `V=10, s=1` the real/claimed MSE is 7.9× at `μ=8, n=1` and 2.1×10³ at `n=10⁴`; 185× → 10⁶× at `μ=10`. Speeds with |bias| ≤ 0.1 extend only to 87%/74%/48% of `V` for `s`=0.5/1/2 (closed-form leading term `V+sΦ⁻¹(tol/2V)` agrees to 4 decimals). Unwrapping against a prior has exact failure probability `2Φ(−V/√(s²+s_p²))` and exact MSE; it stays within 10% of the twin's claim only for prior error `s_p ≤ 0.257V`. All matched to Monte Carlo in the tests. See `paper/whitepaper.md`.

```bash
cd research/aliasing-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~10 s; output in experiments/results.txt
```

**Builds on.** The radar sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>) and the field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Doppler ambiguity is textbook (Richards 2005); the estimation setting follows Kellner et al. (2013). Companion to `doppler-twin` (moving-target contamination), `radar-clutter-twin` and `cfar-family-twin` in this repository.

Stylised: one radial channel, one target, known Gaussian noise, independent returns, mean estimator, idealised Gaussian prior for unwrapping, a simulated "real" radar, no radar data; staggered-PRF and chirp-sequence disambiguation are not modelled. Preliminary. MIT.
