# A point-mass twin of a rolling body ignores rotational inertia: acceleration is overstated by exactly 1+k, the slip threshold is invisible, and one calibration cannot fix a mixed fleet

## Question
Simulators of wheeled and rolling systems often start from a point mass. For a body that rolls, what exactly is wrong with a twin-trained prediction, which quantities does a single fitted constant repair, and which does it not?

## Model
Body of mass `m`, radius `r`, moment of inertia `I = k m r²` (sphere `k = 2/5`, disc `1/2`, hoop `1`) on an incline of angle `α` with Coulomb friction `μ`. Real: rolling without slipping if `μ ≥ μ* = k tanα/(1+k)`, with acceleration `g sinα/(1+k)`; otherwise kinetic slip with acceleration `g(sinα − μ cosα)` and spin-up `μ g cosα/(k r)`. The simulator (`simulate`) does not use these formulas: it time-steps `(v, ω)` with `dt = 10⁻⁴ s` and an explicit stick/slip rule (stick if the friction needed to hold zero slip is within `μ N`). Twin: frictionless point mass, `a = g sinα`, optionally with one fitted gain `c` (`fit_gain`, least squares over angles 10–25° at `μ = 0.9`). Coast: the body is launched rolling at speed `v₀` up the ramp; energy conservation gives stop distance `(1+k) v₀²/(2 g sinα)`, the twin `v₀²/(2 g sinα)`.

## Results
(all numbers from `experiments/results.txt`)
1. **Acceleration.** With `μ = 0.9`, `α = 30°`, simulated accelerations are 3.504, 3.270, 2.453 m/s² (sphere, disc, hoop) against closed forms 3.5036, 3.2700, 2.4525 (differences ≤ 3·10⁻⁴, time-step error); the twin's 4.905 is too large by exactly 1.4, 1.5, 2.0. A 2 m descent takes 0.903 s in the twin against 1.069, 1.106, 1.277 s.
2. **Slip threshold.** For the disc at 30°, `μ* = 0.1925`; the simulation switches from slip to rolling between `μ = 0.19` and `0.20`, and the acceleration matches the piecewise closed form to 3·10⁻⁴. The twin's acceleration does not depend on `μ`, so the twin/real ratio moves continuously from 1.00 (`μ = 0`) to 1.50 (`μ ≥ μ*`). The threshold grows with slope (disc: 0.029 at 5°, 0.333 at 45°); at `μ = 0.15` the hoop slips at 20° while the sphere still rolls.
3. **Coast distance.** A launch speed chosen in the twin to stop at 1 m (2.253 m/s at 15°) carries a rolling body to 1.400, 1.500, 2.000 m (simulated 1.3999, 1.4999, 1.9999): overshoot of 40%, 50%, 100%, larger for more inertia and a safety-relevant sign.
4. **Calibration.** Fitting the gain on one shape (`c = 0.714, 0.667, 0.500` for sphere, disc, hoop) removes its own fall-time error at 20° but leaves −3.4% to −16.3% (sphere-fit), +3.5% to −13.4% (disc-fit) and +19.5%, +15.5% (hoop-fit) on the others. A pooled fit (`c = 0.627`) gives +6.7%, +3.1%, −10.7%. All three shapes tie in the twin (0.903 s) while the real order is sphere < disc < hoop.

## Limitations
Planar incline, rigid point-contact bodies, constant Coulomb friction, no rolling resistance, no air drag, no deformation, `g` exact, sphere/disc/hoop only (no composite or off-centre mass). The "real" system is a simulator using textbook mechanics, not measurements of a physical body. Results 1–3 are exact consequences of the equations and mainly check the code and the statement of the effect; result 4 depends on the chosen angle range and shape set and is empirical for this setup. Nothing here is a new physical result.

## Next steps
Rolling resistance and deformable contact; a rolling wheel on a vehicle with motor inertia (reflected inertia as an effective `k`); identification of `k` from a single descent (time and angle give `1+k` directly); compare with a MuJoCo or PyBullet rigid-body twin; connect to `friction-twin` and `slip-twin` (friction and slip models) and `drag-twin` (drag vs coast).

## References
- Goldstein, H., Poole, C. & Safko, J. (2002). *Classical Mechanics*, 3rd ed. Addison-Wesley. (rolling constraint, moments of inertia)
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
