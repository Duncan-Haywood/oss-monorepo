# Occupancy twin: what a too-clean sensor twin does to a mapper's commit decisions

*Stylised: one grid cell, independent binary beam returns (hit w.p. `p1` if occupied, `p0` if free), flat prior, log-odds commit at `±A`. Twin sensor `q1=0.8, q0=0.05` (`a=ln(q1/q0)=2.773` added on a hit, `b=ln((1−q0)/(1−q1))=1.558` subtracted on a miss), design error `ε=1e-3`, `A=6.907`. Pure Python; see `tests/` (7 tests) and `experiments/results.txt`. Numbers are what `experiments/run.py` printed; nothing is tuned.*

## Question
Mapping stacks are tuned, and their thresholds set, in simulation, where a sensor model says how often a beam hits a free or occupied cell. The real sensor's rates differ (multipath, grazing angles, dust). How much worse than designed is the committed map, and what fixes it cheaply? ARPG-style perception pipelines are trained and validated on simulated sensors, so this is the smallest instance of sensor-twin fidelity turning into a mapping error rate.

## Setup and result
Under the real sensor the log-odds `S_n` is a random walk with steps `+a` (prob `p`) and `−b` (prob `1−p`), `p=p0` for a free cell (wrong commit = reaching `+A`). The mirror image handles occupied cells (`reflect`). Let `θ*` be the positive root of `p e^{θa}+(1−p)e^{−θb}=1`; `e^{θ*S_n}` is a martingale, and since the overshoot lies in `[0,a]` above and `[0,b]` below, optional stopping gives a rigorous sandwich on `P(wrong)` (`error_bounds`); the upper end is `≈e^{−θ*A}`. For a correct twin `θ*=1` and the bound is `ε`; the exact error is computed by dynamic programming over hit counts (`exact_error`, unresolved mass <1e-12).

1. **Exact inflation.** Free cell, real false-hit `p0 = 0.05, 0.10, 0.15, 0.20, 0.30`: `θ* = 1.000, 0.701, 0.509, 0.361, 0.124`; exact error `2.2e-4, 2.8e-3, 1.45e-2, 4.9e-2, 0.26`, i.e. `0.2×, 2.8×, 14.5×, 48×, 260×` the 1e-3 design (simulation, 20 000 runs: `2.5e-4, 3.3e-3, 1.32e-2, 4.5e-2, 0.263`); every exact value lies inside the sandwich. The matched twin beats its design because of overshoot slack. A twin that is merely 3× too clean in false hits costs one to two orders of magnitude in error; the effect is exponential in `A`, so a stricter design target makes it worse (`ε^{θ*−1}` in the exponent form).
2. **Occupied side.** Real hit rate `p1 = 0.8, 0.7, 0.6, 0.5` against the twin's 0.8: missed-detection error `4.2e-4, 4.3e-3, 2.6e-2, 0.113` (`0.4×, 4.3×, 26×, 113×`).
3. **Tempering fixes the level at a latency price.** Committing at `A_T = ln(1/ε)/θ*` (equivalently scaling the log-odds by `θ*`) gives errors `4.1e-4, 5.4e-4, 6.6e-4, 8.7e-4` for `p0 = 0.10…0.30`, all below target, but expected commit time grows `1.4×, 1.9×, 2.9×, 16×` (6.9→9.6, 8.2→15.8, 10.0→28.7, 13.6→218 observations). The price is real information lost to the twin's error, not an artefact: at `p0=0.30` the drift is nearly zero.
4. **Calibration budget.** `θ*` must be measured on the real sensor. Plug-in estimate from `n` known-free real observations at `p0=0.15`; the delta-method sd `|∂f/∂p|/|∂f/∂θ|·√(p(1−p)/n)` matches resampling for `n ≥ 50` (0.166 vs 0.181 at 50; 0.083 vs 0.084 at 200; 0.037 vs 0.038 at 1000) but fails at `n=20` (0.263 vs 1.33: estimates near a zero-hit sample explode the exponent). Tempering with the plug-in exponent gives mean error / target `8.5, 2.2, 0.87, 0.60` at `n = 20, 50, 200, 1000` and exceeds target in `39%, 38%, 26%, 7%` of replicate maps (300 replicates each; `A` capped at 60). Underestimating `θ*` is safe, overestimating is not, and the mean error is above target below a few hundred samples per condition.

## Limitations
One cell, binary independent beams; real cells have correlated returns and incidence-angle dependence, and the log-odds clamp of production mappers changes the walk. The real rates are assumed constant over the map; in practice each cell class needs its own `θ*`. The calibration cells are assumed known free. Everything is exact or numerical in the model and is no evidence about real sensors or any simulator.

## Relevance
Sensor fidelity should be scored by the exponent `θ*` it induces for the downstream decision, not by a generic likelihood gap: a small mismatch in a rare-event rate (false hits) moves error by orders of magnitude at strict thresholds. A twin-tuned threshold should be re-scaled by a real-data estimate of `θ*` before deployment, and the several-hundred-sample cost of that estimate is the price of trusting the twin.

## References
- Elfes, A. (1989). Using occupancy grids for mobile robot perception and navigation. *Computer* 22(6).
- Thrun, S., Burgard, W., Fox, D. (2005). *Probabilistic Robotics*. MIT Press.
- Wald, A. (1945). Sequential tests of statistical hypotheses. *Ann. Math. Statist.* 16.
- Lundberg, F. (1903). *Approximerad framställning af sannolikhetsfunktionen*. Uppsala.
- Companion projects in this repo: `radar-clutter-twin`, `twin-transfer`, `twin-audit`.
