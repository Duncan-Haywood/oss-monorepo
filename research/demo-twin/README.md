# Demo twin: cloning an expert from demonstrations logged in a digital twin, under actuator saturation

Pure Python, no dependencies. Scalar plant `x' = a x + b·sat(u) + w` (`a=1.05`, `b=1`, `|u| ≤ U`), expert command `u = −k0 x` with `k0` the unsaturated LQ gain (0.963). A clone is fit by least squares to logged `(state, applied action)` pairs, where the states come from the expert running in a twin. Results, all from `experiments/results.txt`:

- **Logging the applied (clipped) action biases the clone, even with a perfect twin.** At `U = 1` the clone's gain is 0.582 against `k0 = 0.963` and its real cost is 9.8% above the expert's (gap 0.141 on 1.433). For Gaussian states the clone gain is exactly `k0·P(|k0 x| < U)` (Stein's lemma; verified to 4 digits against quadrature, and within 3% of the exact grid value for the expert's non-Gaussian states). Logging the pre-clip command removes the bias by construction.
- **Twin errors move the gap through the states they produce, and some help.** A twin with 0.25× the true noise cuts the gap to 0.002; 2× the noise raises it to 0.75. A twin whose actuator limit is 3 instead of 1 gives gap 0.0001; one with limit 0.7 gives 0.84. Underestimating `b` by 30% gives 0.39; overestimating by 50% gives 0.09. More fidelity is not monotonically better here.
- **Coverage is the lever.** Resetting the twin to logged states with sd ≤ 0.5·U/k0 gives gap ≤ 0.002; sd = U/k0 gives 0.08.
- **DAgger with applied-action labels does not fix it.** On the real plant it converges to gain 0.5575 with gap 0.169, worse than the one-shot clone (0.141), because the target `sat(−k0 x)` is not in the linear class.

Grid discretisation is checked (expert cost 1.4383, 1.4331, 1.4318 at cell width 0.2, 0.1, 0.05; Monte Carlo 1.4316 over three 2e6-step runs). See `paper/whitepaper.md`.

```bash
cd research/demo-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~30 s; output in experiments/results.txt
```

**Builds on.** The learning-from-demonstration direction of the CAIRO lab (<https://cairo-lab.com/>) and the manipulation sim-to-real direction of the HIRO group (<https://hiro-group.ronc.one/>); no specific paper of either is reproduced and nothing here is affiliated with or endorsed by them. Behavioural cloning and its distribution shift: Pomerleau (1989, *NeurIPS* 1, ALVINN), Ross, Gordon & Bagnell (2011, *AISTATS*, DAgger). Stein's lemma: Stein (1981, *Ann. Statist.* 9(6)). Companion to `twin-transfer` (same scalar plant family).

Stylised: scalar plant, one linear policy class, population-level least squares (no finite-sample noise), Gaussian process noise, saturation only, one plant `(a, b)` and one set of costs, no human-demonstrator noise, no real robot or logs. The gaps are for this plant; the direction of the effects follows from the mechanism but their size does not transfer. MIT.
