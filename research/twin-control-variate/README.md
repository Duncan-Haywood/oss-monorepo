# Twin control variate: certifying real-world policy cost with a few real rollouts and many twin rollouts

Pure Python, no dependencies. A digital twin is biased, so a policy's cost estimated on the twin alone is wrong by a fixed amount no matter how many twin rollouts you run. Used as a *control variate*, the same twin removes variance without adding bias. In scalar LQ with a fixed policy the rollout cost is a Gaussian quadratic form, so everything is exact: the twin/plant cost correlation is `ρ = λ·tr(GG′)/√(tr G² tr G′²)` (`λ` = fraction of the real disturbance the twin can replay); the optimal twin-to-real rollout ratio is `N/n* = ρ/√((1−ρ²)w)` and the speed-up over real-only is `1/(√(1−ρ²)+ρ√w)²` at cost ratio `w`. Twin gain error enters the bias to first order (5% error → 2.7% bias) but `1−ρ` only to second order (`4.7·10⁻⁴`), so **the value of a twin as a variance reducer is limited by how much of the real disturbance it can replay, not by its parameter error**; twin-only estimates beat real-only ones only below `n̂ = Var/bias²` real rollouts (35 at 10% gain error) and give ≈0% coverage of nominal 95% intervals. See `paper/whitepaper.md`.

Builds on multifidelity Monte Carlo (Peherstorfer–Willcox–Gunzburger 2016) and control variates (Lavenberg–Welch 1981); extends the digital-twin line `twin-transfer`, `randomized-twin`, `twin-upkeep`, `twin-elicitation` from *what a twin is worth for training* to *what it is worth for certification*. Relates to sim-to-real evaluation in robotics and autonomy (ARPG, HIRO, RECUV themes); no affiliation or endorsement implied.

```bash
cd research/twin-control-variate
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~4 s
PYTHONPATH=src python3 experiments/run.py                 # ~5 min; output in experiments/results.txt
```
Stylised scalar LQ, fixed policy, Gaussian disturbances, a single parameter of model error, replayable-noise fraction `λ` as a parameter (not derived from a real replay pipeline); MIT.
