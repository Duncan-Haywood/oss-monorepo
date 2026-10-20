# The twin that is right for the wrong reason: measurement noise, dither and an unmodelled actuator deadband

*Stylised: scalar integrator `x⁺ = x + f(u)`, `u = −K(x+n)`, deadband `d = 0.1`, K=0.5, Gaussian noise. Pure Python; every number is from `experiments/results.txt` (seeded, ~6 s). The "real" system is itself simulated; no lab or field data. Noise-free stall and compensation laws are in the companion `research/deadband-twin`.*

## Question
A controller tuned in a linear-actuator twin is validated against a real actuator with a deadband. With measurement noise present, does the twin's error estimate stay pessimistic or optimistic, and what do dither and inverse compensation do?

## Model
Twin `f(u)=u`: `x⁺ = (1−K)x − Kn`, stationary rms `s√(K/(2−K))`. Real `f(u)=sign(u)·max(|u|−d,0)`; without noise it stalls at `d/K` (companion project). Stationary rms of the real loop is measured by 2·10⁵ steps after a 2000-step burn-in. Dither adds `U(−a,a)` to `u`; compensation adds `d̂·sign(u)`.

## Results
1. **Noise flips the sign of the twin's error.** Real/twin rms: 27.6× at s=0.01 (0.1591 vs 0.0058), 10.2× at 0.02, 4.5× at 0.03, 1.6× at 0.04, 0.37× at 0.05 (0.0107 vs 0.0289), 0.45× at 0.1, 0.65× at 0.2. Real rms is 0.2000 at s=0, has a minimum near 0.05 and rises after; the crossover lies between s=0.04 and 0.05 (grid coarse). Interpretation, not proven here: noise pushes the command across the deadband so the actuator keeps acting.
2. **Dither.** At s=0 rms is 0.2000 / 0.1600 / 0.1000 / 0.0400 / 0.0001 for a = 0 / 0.02 / 0.05 / 0.08 / 0.1, rising to 0.0334 at 0.15 and 0.1338 at 0.3. At s=0.02 the best listed is a=0.08 (0.0048, below the twin's 0.0115; a=0.1 gives 0.0090). At s=0.05 dither only hurts: a=0 gives 0.0103, a=0.1 gives 0.0226. Dither tuned in the noise-free twin is wrong once noise is present.
3. **Compensation under noise** (s=0.02). rms 0.1209 with d̂=0; 0.0053 at 0.08; 0.0116 at 0.1 (twin 0.0115); 0.0233 at 0.12; 0.0399 at 0.15. Under noise, mild under-compensation beat exact compensation on this grid, unlike the noise-free case where the exact width is best.

## Limitations
Single seed, no confidence intervals: last digits are not reliable and the location of the crossover and of the best dither amplitude are grid-limited. One gain (K=0.5), one deadband width, symmetric deadband, white Gaussian noise; real noise is coloured and heavy-tailed and real actuators have backlash and stiction. The dither and compensation optima depend on `s`, which the builder must know. Not a claim about any specific robot.

## Next steps
An exact stationary law via a Markov-chain computation on a grid; confidence intervals and several seeds; backlash instead of deadband; estimating `s` and `d` jointly from logs.

## References
- Zames, G. & Shneydor, N. A. (1976). Dither in nonlinear systems. *IEEE Transactions on Automatic Control* 21(5), 660–667.
- Tao, G. & Kokotović, P. V. (1996). *Adaptive Control of Systems with Actuator and Sensor Nonlinearities*. Wiley.
