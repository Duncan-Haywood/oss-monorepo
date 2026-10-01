# Twin audit: how long a digital twin can be wrong before an anytime-valid audit catches it

Pure Python, no dependencies. Companion to `twin-transfer`, `twin-upkeep` and `twin-elicitation`. After deploying a controller trained on a twin, a Gaussian-mixture e-process on the closed-loop residual lets the operator watch the real plant continuously and declare the twin wrong at level α. Results: the e-process false-alarms 2.4% of the time against 58% for a z-test peeked at every step; detection delay follows `≈2[ln(1/α)+½ln(1+τ²nU)]/(Δ²U)` (simulation 0–18% earlier), where `U = k²Var(x)+v` is the controller's own excitation; expected regret accumulated before detection is nearly independent of the gap (8–10 for gaps whose per-step regret spans 38×); an expensive-control operator takes 11× longer to catch the same gap; and added dither pays only when the twin is grossly wrong (true gain >2.25× or <0.35× the twin's), with the rule failing at the near-cliff edge. See `paper/whitepaper.md`. Builds on the sim-to-real / twin-validation questions of the digital-twin theme and on anytime-valid inference (Ville; Howard et al.; Ramdas et al.); no affiliation with any lab implied.

```bash
cd research/twin-audit
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~10 s; output in experiments/results.txt
```
Stylised scalar LQ, Gaussian noise, known σ² and `a`; MIT.
