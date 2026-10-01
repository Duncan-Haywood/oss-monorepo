# Cloning from a digital twin: saturated demonstration logs bias the clone, and twin errors can help

*Stylised: scalar plant with actuator saturation, population-level least squares, pure Python. Every number is from `experiments/results.txt`; the stationary law is computed on a grid (cell width 0.1) and checked against grid refinement and Monte Carlo (`tests/`, section 1 of the results).*

## Question
Demonstrations for a learner are often logged in a simulator because the twin is cheap, resettable and safe. Recorded actuation is the *applied* action, which the actuator has already clipped. Does cloning from such logs recover the expert, and how does the twin's fidelity enter? This is a sim-to-real question about which twin errors matter for imitation, in the spirit of learning from demonstration in a digital twin.

## Model
Plant `x' = a x + b·sat(u) + w`, `w ~ N(0, s²)`, `sat` clipping at `±U`; cost `x² + 0.1·sat(u)²`. The expert commands `u = −k0 x` with `k0` the LQ gain of the unsaturated plant (`a=1.05, b=1, s²=1, U=1`: `k0 = 0.9626`). The twin `(â, b̂, ŝ², Û)` is used to run the expert and log `(x, sat(−k0 x))`. The clone is the least-squares slope `κ = −E[x·sat(−k0 x)]/E[x²]` over the twin's stationary states, deployed as `u = −κ x` (clipped) on the real plant. The imitation gap is the real cost of the clone minus the real cost of the expert.

## Results
1. **The computation is right.** Expert cost 1.4383, 1.4331, 1.4318 at grid width 0.2, 0.1, 0.05; Monte Carlo 1.4328, 1.4274, 1.4346 (2e6 steps each, mean 1.4316). The best clipped-linear gain on the real plant is 0.996 with cost 1.4327, so `k0` is near-optimal in the class and the gap measures cloning error, not a poor expert.
2. **A perfect twin still gives a biased clone.** At `U = 1` the expert saturates 37.6% of the time, the clone gain is 0.582 (vs 0.963) and the gap is 0.141 (9.8%). By limit `U`: 1.25: gain 0.731, 4.0%; 1.5: 0.828, 1.6%; 2.0: 0.923, 0.17%; 3.0: 0.961, 0.00%. For `U = 0.8` the expert itself is unstable on this plant. For Gaussian states, Stein's lemma gives `κ = k0·P(|k0 x| < U)` exactly; with the expert's stationary variance this predicts 0.600 against the exact 0.582 (the states are not Gaussian).
3. **Twin errors act through the state distribution and the label.** Twin noise 0.25/0.5/0.75/1/1.5/2× gives gap 0.0017/0.020/0.066/0.141/0.385/0.751: a quieter twin visits fewer saturated states, so the clone sees more small-signal labels. Twin `b̂/b` 0.7/0.85/1/1.2/1.5: 0.386/0.207/0.141/0.104/0.090. Twin `â` 0.8/0.95/1.05/1.1: 0.080/0.100/0.141/0.246. Twin limit `Û` 0.7/1/1.5/2/3: 0.839/0.141/0.013/0.0017/0.0001. A twin that is *wrong* (less noisy, a looser actuator limit, or a larger `b̂`) can give a better clone than an accurate one, because the error happens to remove the saturation from the labels.
4. **Coverage is what matters.** With logs from states reset to `N(0, v)`, the Stein gain matches quadrature to 4 digits (0.6571 vs 0.6568 at sd = U/k0). Gap by sd/(U/k0): 0.25: 0.0000; 0.5: 0.0020; 0.75: 0.023; 1: 0.080; 1.5: 0.294; 2: 0.607; 3: 1.43. Narrow coverage recovers the expert.
5. **DAgger with applied-action labels does not help.** Relabelling the states the clone visits on the real plant converges to gain 0.5575 (path 0.963, 0.582, 0.561, 0.558, ...) with gap 0.169, worse than the one-shot clone; the label `sat(−k0 x)` is outside the linear class, so more on-policy data fits the bias more faithfully. DAgger run inside a twin with half the real noise lands at gain 0.791 and real gap 0.022, but that gain comes from the twin error, not from the algorithm.

## Practical reading
Log the commanded action (or the pre-clip action), or fit a policy class that includes the clip. If applied actions are all that exist, narrow the twin's state coverage to `≲ 0.5·U/k0` rather than matching the real state distribution.

## Limitations
Scalar plant; one linear policy class; population-level fit (no finite-sample error or demonstrator noise); saturation is the only nonlinearity; one parameter set. The exact statements are for Gaussian states (Stein) and the grid; the expert's own states are non-Gaussian, hence the 3% difference. The sign of some twin-error effects (a quieter twin helps) depends on the clone being cost-evaluated on a plant where the saturated regime is what hurts; a class that represents the clip would remove the bias entirely. No real robot, no human demonstrations, no measured logs.

## Next steps
Clone with a policy class including the clip and compare gaps; finite-sample regret with demonstrator noise; multi-dimensional plants and a manipulation-like contact nonlinearity; combine with `twin-transfer`'s ridge-prior worth of a twin.

## References
- Pomerleau, D. A. (1989). ALVINN: An autonomous land vehicle in a neural network. *Advances in Neural Information Processing Systems* 1, 305–313.
- Ross, S., Gordon, G. & Bagnell, D. (2011). A reduction of imitation learning and structured prediction to no-regret online learning. *AISTATS*, PMLR 15, 627–635.
- Stein, C. M. (1981). Estimation of the mean of a multivariate normal distribution. *Annals of Statistics* 9(6), 1135–1151.
