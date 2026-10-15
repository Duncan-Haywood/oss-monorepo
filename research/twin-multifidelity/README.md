# Twin multifidelity: estimating a controller's real cost with a biased digital twin

Pure Python, no dependencies. Companion to `twin-transfer`, `randomized-twin`, `twin-elicitation` and `twin-upkeep`: those price a twin for *training*; this one prices it for *evaluation*. A twin-only cost estimate is biased by the twin's error, a real-only estimate is noisy; used as a control variate the twin keeps the estimate unbiased and is worth its *correlation* with real rollouts, not its accuracy. Results: the correlation has a closed form under common disturbances and decays as `(1+c⁴)/(1−c⁴)² (kδ)²` in the twin's gain error (`0.985 / 0.941 / 0.782 / 0.472` for gains 1.15 / 1.3 / 1.6 / 2.0 while the twin-only bias grows `0.004 → 1.34`); replaying only a fraction `λ` of the real disturbance multiplies it by exactly `λ²`; the optimal twin/real rollout ratio is `√(c_rρ²/(c_t(1−ρ²)))`, the twin pays only below the price `(1−√(1−ρ²))²/ρ²`, and a simulated estimator reaches variance ratio `0.228` vs `0.225` predicted. See `paper/whitepaper.md`.

```bash
cd research/twin-multifidelity
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 11 tests, ~10 s
PYTHONPATH=src python3 experiments/run.py                 # ~2 min; output in experiments/results.txt
```
Builds on multifidelity Monte Carlo (Peherstorfer–Willcox–Gunzburger) and sim-to-real predictivity work (Kadian et al.); relates to digital-twin and sim-to-real evaluation for manipulation and field robotics (HIRO, RECUV, ARPG themes) without any affiliation. Stylised scalar LQ, Gaussian disturbances, idealised disturbance replay; MIT.
