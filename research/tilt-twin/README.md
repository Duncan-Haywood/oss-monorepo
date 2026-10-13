# Tilt twin: how do you estimate a 1e-6 failure probability from a twin you can only run a thousand times?

Pure Python, no dependencies. A failure is `n=10` unit-Gaussian disturbances summing past a threshold, `p = Q(b/√n)` exactly. Drawing disturbances with mean shift `θ` and reweighting is unbiased for every `θ`, and its variance is exact, `e^{nθ²}Q((b+nθ)/√n)` (matched to simulation: 5.53 vs 5.51 at θ=1). At the optimal shift (≈`b/n`) the runs needed for 10% relative error at p=1e-6 fall from 10⁸ to 535 (1.9·10⁵×), and at p=1e-12 from 10¹⁴ to 809. The shift is a narrow target with a cliff on one side: half the optimal shift costs 23× the variance, 1.5× costs 23×, 2× costs 1.7·10⁵×, and a shift tuned for one design is 1.6–17.6× worse at thresholds 0.8–1.5× away. The usual 95% interval is unreliable exactly then (N=1000): 94.9% coverage at the optimum, 2.8% at 2× (0% at 3×, where the exact relative error is 1.6·10⁹ but the sample shows 1.0), and only the effective sample size (1.5 at 2×) warns. See `paper/whitepaper.md`.

```bash
cd research/tilt-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # seconds; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and safe-autonomy direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical rare-event simulation (Bucklew 2004; Rubinstein & Kroese 2017) and the Kish effective sample size (Kong, Liu & Wong 1994). Companion to `stop-twin` (rare-failure stopping by counts) and `twin-certification` in this repository.

Stylised: Gaussian additive disturbances with a closed-form optimum, constant mean shift only, a simulated "real" system, no field data; no cross-entropy adaptation, splitting or first-passage failures. MIT.
