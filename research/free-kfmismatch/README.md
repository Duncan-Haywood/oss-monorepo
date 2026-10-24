# How much does a wrong process-noise guess cost a Kalman filter? An exact answer for the scalar case (free choice)

Pure Python, no dependencies. **Free-choice project** (`PROJECTS.md`, "Picking work", step 1; draw 0.03). Why it seemed worth doing: a Kalman filter is the simplest estimator inside a digital twin, and its process-noise setting `Q` is the knob practitioners tune by hand because they do not know the twin's true error. Folklore says "err high, not low". I wanted the exact size of that asymmetry rather than a rule of thumb. Produced with AI assistance (Claude). **Stylised: a scalar random-walk state with Gaussian noise; nothing here says anything about a real sensor or vehicle. This is a textbook-level calculation, not a new result.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-kfmismatch/

## Question

Truth is `x_t = x_{t-1} + w_t`, `y_t = x_t + v_t`, with `w ~ N(0, q)`, `v ~ N(0, r)`. The filter runs at its steady-state gain computed from an *assumed* `qa = λ·q` (and the correct `r`). What is its true mean-squared error relative to the optimal filter, and what error variance does it *claim*?

## Method

The error obeys `e_t = (1−K)(e_{t−1}+w_t) − K v_t`, a linear recursion, so the true steady-state MSE of any fixed gain `K` is exact: `P = ((1−K)²q + K²r) / (1 − (1−K)²)`. `K` for assumed `(qa, ra)` comes from the scalar Riccati equation. `src/free_kfmismatch/kf.py` has the formulas and a Monte-Carlo check. Only the ratio `q/r` and `λ` matter. Tests (5, under a second): known gain at `q=r=1` (golden ratio), optimum equals the filter's claimed variance, every `λ≠1` is worse, the limits `K=1` (MSE = `r`) and `K→0` (blow-up), and simulation within 2% of the formula.

## Results (all from `experiments/results.txt`; q = r = 1 unless noted)

- **The formula matches simulation** within 1% at nine values of `λ` (300,000 steps each, seed 7).
- **Underestimating costs far more than overestimating.** Excess MSE over the optimum at `λ = 1/10` is ×2.10, at `λ = 10` ×1.38; at `λ = 1/100` ×7.39 against ×1.59 at `λ = 100`.
- **Overestimating is bounded, underestimating is not.** As `λ → ∞` the gain goes to 1 and MSE tends to `r`, so the ratio saturates at `r / P_opt` (1.618 at `q = r`). As `λ → 0` the gain goes to 0 and the filter stops listening; the ratio grows without bound.
- **The asymmetry depends on signal-to-noise.** Over-guessing by ×10 costs ×1.75 at `q/r = 0.001` (about the same as under-guessing, ×1.75) but only ×1.01 at `q/r = 100` (under-guessing ×1.57 there). When the process is noisy relative to the sensor, an inflated `Q` is nearly free; when it is quiet, the two directions are about equally costly.
- **Consistency.** The filter's *claimed* posterior variance divided by its true MSE is 0.21 at `λ = 1/10` (overconfident by 5×) and 1.08 at `λ = 10` (slightly conservative). So the dangerous direction is also the one that hides itself: a filter that is too trusting reports small error bars while being wrong.

## Limitations

Scalar, steady state only (no transient or start-up), Gaussian noise, correct measurement variance, and only `Q` mis-specified. Multivariate filters can be mis-specified in directions, and then the asymmetry need not be this clean. This does not test any real twin.

## Next steps

A 2-state constant-velocity filter where `Q` is wrong along one axis; mis-specified `R` together with `Q`; adaptive estimation of `Q` from innovations (Mehra, 1970) and how many samples it needs to reach the cheap side of the asymmetry.

## Builds on

Kalman, R. E. (1960), "A new approach to linear filtering and prediction problems", *J. Basic Engineering* 82(1), 35&ndash;45. Anderson, B. D. O. and Moore, J. B. (1979), *Optimal Filtering*, Prentice-Hall (sensitivity of the steady-state filter to model error). Mehra, R. K. (1970), "On the identification of variances and adaptive Kalman filtering", *IEEE Trans. Automatic Control* 15(2), 175&ndash;184. I have not re-read these for this note; they are cited for the setting, not for any number above. No lab's work is built on here, and no affiliation is implied.

## Outside dependencies

None: Python 3.9+ standard library only.

## Owner steps

None.

```bash
cd research/free-kfmismatch
PYTHONPATH=src python3 -m unittest discover -s tests -v
python3 experiments/run.py > experiments/results.txt
```
