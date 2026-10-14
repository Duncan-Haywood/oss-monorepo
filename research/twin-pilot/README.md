# Twin pilot: how big a pilot decides whether a biased digital twin is worth using?

Pure Python, no dependencies. Follow-up to `twin-evaluation` (a biased twin as a control variate for evaluating a robot policy). The twin pays iff its correlation with the real return exceeds `ρ*(r) = 2√r/(1+r)` for cost ratio `r = c_T/c_R` (0.426 at `r`=0.05), and the gain is *linear* in `ρ−ρ*` at that threshold (slope `2√r(1+r)/(1−r)`), so a pilot's wrong call is cheap exactly where it is likely: with `m` = 10/20/40/80/160 pilot pairs the wrong-call probability at `ρ`=0.50 is 0.36/0.33/0.27/0.20/0.11, but the regret stays at 0.004–0.016 of the real-only variance there. Prior-averaged decision regret follows `f·slope·(1−ρ*²)²/(2m)` (simulated/law 0.63 at `m`=10, 0.94 at 80, 1.00 at 160), and the plug-in allocation from `ρ̂` costs `≈0.27–0.30/m` extra variance (delta-method constant matched: 0.267 vs 0.27 at `ρ`=0.9). Run end to end with the pilot reused, the estimator stays unbiased (|bias| ≤ 0.002 against a twin bias of 0.7), the 95% interval covers 0.946–0.955, and at `m`=10 a noise-free twin already gets variance 1.11× the oracle's against 1.34× for real-only. See `paper/whitepaper.md`.

```bash
cd research/twin-pilot
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, ~7 s
PYTHONPATH=src python3 experiments/run.py                 # ~6 min; output in experiments/results.txt
```

**Builds on.** The sim-to-real and manipulation-in-simulation direction of the HIRO group (<https://hiro-group.ronc.one/>), the perception/field-robot simulation direction of ARPG (<https://arpg.colorado.edu/>) and the safe-autonomy direction of RECUV (<https://www.colorado.edu/recuv/>), where a policy is compared in simulation before real trials. No specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The estimator is the multifidelity control variate (Lavenberg & Welch 1981; Peherstorfer, Willcox & Gunzburger 2016; cf. prediction-powered inference, Angelopoulos et al. 2023); `ρ̂` uses Fisher's (1915) distribution of the sample correlation. Direct sequel to `twin-evaluation`; related to `twin-audit`, `twin-elicitation` and `twin-certification` in this repository.

Stylised: Gaussian returns linear in an observed context, a simulated "real" system, exact context replay; the regret law is asymptotic (1.6× too large at `m`=10); no robot data. Preliminary. MIT.
