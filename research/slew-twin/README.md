# Slew twin: how large a manoeuvre can a twin without an actuator rate limit be trusted for?

Pure Python, no dependencies. Plant `x⁺ = x + a⁺`, command `a⁺ = a + clip(−k x − a, −r, r)`; the twin has no rate limit and is first order (`x⁺ = (1−k)x`, never overshoots). The real loop is scale-invariant, so it depends only on `ρ = x₀/r` and `k`. The twin is exact iff `x₀ ≤ r/k` (real minus twin is exactly 0 at 0.999·r/k, 0.1–0.6% of `x₀` at 1.01·r/k). Beyond that the real loop overshoots: undershoot past zero is 0.232 of `x₀` at `ρ=100` (k=0.3) and 0.904 at `ρ=10⁴`, and settling to 1% takes 29418 steps at `ρ=10⁵` against the twin's 13. For `k=1/n` the smallest `ρ` with overshoot is empirically `2n(2n−1)` (equal for n=1…25 listed; not proved). Avoiding overshoot needs a rate limit 12–38× lower than keeping the twin exact.

```bash
cd research/slew-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # <1 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>, UAV actuators); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Rate limits in loops: Stein (2003), Åström & Murray (2008). Companion to `saturation-twin`, `deadband-twin`, `control-twin` and `latency-twin` in this repository.

Stylised: scalar plant, no noise or delay, a simulated "real" system, no field data. The validity amplitude and scale invariance are exact; the `2n(2n−1)` threshold and the settling-time slopes are numerical observations. MIT.
