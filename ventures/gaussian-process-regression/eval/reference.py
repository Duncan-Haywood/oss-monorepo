"""Reference values from scikit-learn's GaussianProcessRegressor, for engine.test.mjs.

For each kernel this script builds the same covariance function in
scikit-learn (C1*F11*F12 + C2*F21 + WhiteKernel, so its theta order is the
engine's layout order) and stores, on the bundled Mauna Loa file:

1. at fixed hyperparameters: the log marginal likelihood of the scaled y and
   its gradient with respect to log theta, and the predictive mean and
   standard deviation (with noise) at a few new x values, in y units;
2. a fit from the same starting values and bounds with no restarts
   (scikit-learn's L-BFGS-B), whose optimum the engine must reach or beat.

Run from the repository root:
    python3 ventures/gaussian-process-regression/eval/reference.py
It rewrites ventures/gaussian-process-regression/eval/reference.json.
The inputs (theta, starts, bounds) come from eval/inputs.json, which
eval/inputs.mjs writes from the engine's own defaults
(node ventures/gaussian-process-regression/eval/inputs.mjs).
"""

import json
import pathlib

import numpy as np
import sklearn
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import (
    RBF,
    ConstantKernel,
    ExpSineSquared,
    Matern,
    RationalQuadratic,
    WhiteKernel,
)

HERE = pathlib.Path(__file__).resolve().parent
INPUTS = json.loads((HERE / "inputs.json").read_text())

FACTOR_ARITY = {"rbf": 1, "matern32": 1, "matern52": 1, "rq": 2, "periodic": 2}


def build(terms, theta, bounds):
    """Kernel with the given natural theta (layout order) and bounds [(lo, hi)]."""
    i = 0
    total = None
    for factors in terms:
        lo, hi = bounds[i]
        term = ConstantKernel(theta[i], (lo, hi))
        i += 1
        for f in factors:
            b = bounds[i : i + FACTOR_ARITY[f]]
            if f == "rbf":
                k = RBF(theta[i], b[0])
            elif f == "matern32":
                k = Matern(theta[i], b[0], nu=1.5)
            elif f == "matern52":
                k = Matern(theta[i], b[0], nu=2.5)
            elif f == "rq":
                # engine layout: alpha, then length (scikit-learn's alphabetical theta order)
                k = RationalQuadratic(length_scale=theta[i + 1], alpha=theta[i], length_scale_bounds=b[1], alpha_bounds=b[0])
            elif f == "periodic":
                k = ExpSineSquared(theta[i], theta[i + 1], b[0], b[1])
            i += FACTOR_ARITY[f]
            term = term * k
        total = term if total is None else total + term
    noise_b = bounds[i]
    return total + WhiteKernel(theta[i], noise_b)


def main():
    x = np.array(INPUTS["x"]).reshape(-1, 1)
    y = np.array(INPUTS["y"])
    x_new = np.array(INPUTS["xNew"]).reshape(-1, 1)
    out = {"sklearn": sklearn.__version__, "numpy": np.__version__, "kernels": {}}
    for name, spec in INPUTS["kernels"].items():
        bounds = [tuple(b) for b in spec["bounds"]]
        fixed = build(spec["terms"], spec["theta"], bounds)
        gp = GaussianProcessRegressor(fixed, optimizer=None, normalize_y=True).fit(x, y)
        lml, grad = gp.log_marginal_likelihood(np.log(spec["theta"]), eval_gradient=True)
        mean, sd = gp.predict(x_new, return_std=True)
        start = build(spec["terms"], spec["start"], bounds)
        fit = GaussianProcessRegressor(start, normalize_y=True, n_restarts_optimizer=0).fit(x, y)
        out["kernels"][name] = {
            "theta_order": [str(h.name) for h in fixed.hyperparameters],
            "lml": float(lml),
            "grad": [float(g) for g in grad],
            "mean": [float(m) for m in mean],
            "sd": [float(s) for s in sd],
            "fit_lml": float(fit.log_marginal_likelihood_value_),
            "fit_theta": [float(t) for t in np.exp(fit.kernel_.theta)],
        }
        print(name, round(float(lml), 6), round(out["kernels"][name]["fit_lml"], 4))
    (HERE / "reference.json").write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
