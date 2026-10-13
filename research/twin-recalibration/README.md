# Twin recalibration: how often, and how hard, to re-identify a twin of a drifting plant

Pure Python, no dependencies. Companion to `twin-upkeep`, which keeps a twin in sync by *filtering* the data the controller already produces. Here the twin is instead frozen and re-identified by dedicated experiments (take the plant off its controller, excite it, refit). That is how many simulator-based twins are actually maintained, and it has a price: downtime. For a scalar linear-quadratic plant whose input gain random-walks, the second-order-optimal schedule has a closed form: recalibration interval `T* = (4cσ²/(v ρ q_d²))^{1/3}`, experiment length `N* = √(ρσ²T*/(vc))`, and at the optimum the three costs (experiment downtime, estimation-noise regret, drift regret) are exactly equal, total excess `3A/√T* − ρq_d/2`. That gives excess cost `∝ q_d^{1/3}` and `T* ∝ q_d^{−2/3}` (integer optimiser: slopes `0.333`, `−0.664`), a cube-root price of experiment cost (10× cheaper experiments lower the excess only 2.2×), and a robustness bound (misjudging the drift by 4× costs ≤ 26%). The catch, found by simulation: the second-order optimum is *not safe*. Its short experiments give estimates that land past the stability cliff in 0.7–15% of cycles, and a long frozen interval lets the gain drift past it; a schedule with per-cycle failure probability ≤ 10⁻³ costs 1.2× (`q_d=10⁻⁵`), 3.6× (`10⁻⁴`) and 16× (`10⁻³`) more, and is 37–200× worse than the always-on Kalman twin. See `paper/whitepaper.md`.

```bash
cd research/twin-recalibration
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~6 s
PYTHONPATH=src python3 experiments/run.py                 # ~4 min; output in experiments/results.txt
```
Stylised scalar LQ, random-walk gain, open-loop Rademacher experiments, second-order regret; MIT.
