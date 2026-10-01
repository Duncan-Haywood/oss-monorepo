# Stop twin: when to stop a digital-twin run that counts rare failures

Pure Python, no dependencies. A safety twin is often run "until the interval is narrow enough". With rare failures that rule stops on zero failures: `p̂=0` has Wald half-width 0, so with a target of `p/5` 90.1% of runs stop at the first check for `p`=10⁻³ (exact `(1−p)¹⁰⁰`=90.5%; 99.1% at 10⁻⁴), the interval covers `p` in 9.6% of runs, and the reported rate is 10× too low. Running until `m` failures instead (inverse sampling) makes `(m−1)/(N−1)` exactly unbiased (`E[m/N]` is `≈m/(m−1)` too high), gives relative sd `≈1/√(m−2)` regardless of `p` (`m`=102 for 10%; measured 0.101), and an exact interval covers 95.0–95.5%. A fixed run planned for `p₀`=10⁻³ delivers 20% relative half-width at 10⁻³ but 63% at 10⁻⁴ and 200% at 10⁻⁵. Requiring ≥1 failure before stopping alone restores Wald coverage here (0.938) because the target already forces ~96 failures; that does not make sequential Wald safe in general. See `paper/whitepaper.md`.

```bash
cd research/stop-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and safe-autonomy direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical: inverse (negative-binomial) sampling and its unbiased estimator (Haldane 1945), fixed-width sequential intervals (Chow & Robbins 1965), and binomial interval estimation (Brown, Cai & DasGupta 2001). Companion to `safety-twin`, `scenario-twin` (twin bias and rare-event weighting) and `autocorr-twin` in this repository.

Stylised: iid Bernoulli failures from a faithful twin, one check schedule, no cap on run length, no lab data. MIT.
