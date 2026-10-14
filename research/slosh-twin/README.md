# Slosh twin: a rigid-body twin of a cart carrying liquid predicts no slosh for any move, so how wrong is that, what does a slosh-safe move cost, and what does a stale frequency calibration do to it?

Pure Python, no dependencies. Real system: cart (80 kg) with a damped spring-mass slosh mode (20 kg liquid, 0.5 Hz at full fill); twin: one rigid mass. Results (all from `experiments/results.txt`): (1) the rigid twin gets the centre of mass exactly (RK4 error ~1e-14 m) but predicts zero slosh; for a rest-to-rest bang-bang move the real residual slosh amplitude is `4 μ a₀ sin²(ωT/4)/ω²` (`μ=(M+m)/M`), matched by exact propagation and RK4 to 5 digits; (2) the twin's minimum-time move (D = 3 m, a ≤ 0.5 m/s², T = 4.90 s) leaves 10.7 cm residual slosh (9.3 cm at ζ = 0.02), 10× a 1 cm tolerance; (3) the fastest move meeting 1 cm is 7.60 s, 55% slower, because zero-residual move times are whole multiples of 2 slosh periods and the fixed acceleration cap rules out the first; (4) calibrating ω at a full tank and then running at lower fill (frequency −5% at half fill, −9.5% at 10%) is harmless at half fill (9.5 mm at T = 8 s) but at 25% fill every null-tuned move of order 2–6 fails and the twin-planned safe move takes 28 s vs 8.7 s with a recalibrated frequency, worse than the tuning-free bound `T ≥ 4√(μD/tol)/ω` = 24.7 s; (5) at fixed acceleration the first unsafe null order is exactly `⌊asin(√ρ)/(π|ε|)⌋+1`, `ε` the frequency error. Stylised: one linear slosh mode, bang-bang force, no input shaping optimisation, no nonlinear (swirl, impact) slosh; see `paper/whitepaper.md`.

```bash
cd research/slosh-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, well under 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 1 s; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and sim-to-real direction of ARPG (<https://arpg.colorado.edu/>), the HIRO Group's lab-automation and manipulation workcells (<https://hiro-group.ronc.one/>; transporting liquids) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Residual-vibration and input-shaping ideas are classical (Smith 1957; Singer & Seering 1990); slosh as a pendulum or spring-mass analogue follows Ibrahim (2005). Companion to `flex-twin`, `lag-twin` and `inertia-twin` in this repository.

Stylised: simulated "real" system, no measured tank. MIT.
