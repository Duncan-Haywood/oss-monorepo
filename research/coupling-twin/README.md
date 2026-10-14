# Coupling twin: a per-axis twin certifies gains that axis coupling destabilises, and its fitted gain depends on how the logs were excited

Pure Python, no dependencies. Two discrete-time loops `x⁺ = x − kGx`, `G = [[1,c12],[c21,1]]`; the twin models each axis alone. Exact closed forms, checked by iteration: stable-gain limit `2/(1+√p)` (`p = c12c21 ≥ 0`) or `2/(1+|p|)` (`p < 0`) instead of 2, so a twin-certified 10% margin (`k = 1.8`) fails at `c = 1/9`; no positive gain is stable once `√p ≥ 1`; the twin-deadbeat gain `k = 1` has real rate `√|p|` (6, 16, 62, 270 steps to 1e-6 at `c` = 0.1, 0.4, 0.8, 0.95 vs 1 step in the twin). A diagonal gain fitted from logs is `1 + cρ` (`ρ` = input correlation; Monte Carlo matches to 4 digits), giving real radius `c(1+ρ)/(1+cρ)` (0.300 at `ρ=0`, 0.461 at `ρ=1`); the full fit is unbiased but its variance grows as `1/(1−ρ²)` (verified within 5%). See `paper/whitepaper.md`.

```bash
cd research/coupling-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, about a second
PYTHONPATH=src python3 experiments/run.py                 # about a second; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), HIRO Group (<https://hiro-group.ronc.one/>, manipulation) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The analysis is classical multivariable control and least-squares identification (Skogestad & Postlethwaite 2005; Ljung 1999). Companion to `control-twin`, `closedloop-twin` and `backlash-twin` in this repository.

Stylised: two axes, linear constant coupling, noiseless plant, Gaussian logs, a simulated "real" system, no field data. MIT.
