# EIV twin: what does a twin get wrong when its gain is fitted from a noisy logged input, and does more data fix it?

Pure Python, no dependencies. The real plant is `y = a·u + w`; the twin builder only has a logged, noisy measurement of the input, `x = u + v`, and fits the gain by least squares of `y` on `x`. The fit converges to `a·λ` with reliability ratio `λ = σu²/(σu²+σv²)` (0.800 vs 0.802 simulated at λ=0.8, 0.500 vs 0.501 at λ=0.5). It is bias, not variance, so more data makes the twin's own 95% interval worse: it covers the true gain 53% / 15% / 0% at n = 20 / 50 / 200 (0% at 1000 and 5000) while covering the attenuated value 94–97%. The fit residuals are exactly uncorrelated with the regressor (~1e-14), so no residual diagnostic warns, and the fit R² (0.755 at λ=0.8) still looks fine. A feedforward controller `u = r/â` then overshoots the real plant by exactly `1/λ` (1.250 at λ=0.8, 2.0 at λ=0.5; simulated 1.249, 1.998). Repairs work at moderate n but are not free: a known-noise correction or a second independent measurement as instrument cuts RMSE/a from 0.20 to 0.02–0.05 at n = 200–1000 (λ=0.8), a 20% misjudged noise variance leaves a ±5% bias, and at λ=0.5, n=20 both repairs have RMSE/a of 7.8–13.7 against 0.52 for the biased fit. See `paper/whitepaper.md`.

```bash
cd research/eiv-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                 # ~35 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical measurement-error regression (Fuller 1987; Carroll et al. 2006) and instrumental variables (Wooldridge 2010). Companion to `control-twin` (wrong actuator gain) and `filter-twin` (wrong noise levels) in this repository, which take the wrong parameter as given; here it is derived from how the twin was fitted.

Stylised: scalar static Gaussian gain, a simulated "real" system, no dynamics, no field data; noise variances are constants, no heavy tails or correlated sensor errors. MIT.
