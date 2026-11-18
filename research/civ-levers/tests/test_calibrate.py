import json, os, sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "calibrate"))
import fit  # noqa: E402


def _x(k=7):
    return np.arange(k) / (k - 1)


def test_unbounded_map_is_pull_to_mean():
    x = _x(); p = np.ones(7) / 7
    g = fit.gfun(x, p, 1.0)
    assert np.allclose(g, x.mean() - x)           # exact DeGroot pull toward the mean


def test_finite_eps_ignores_far_views():
    x = _x(); p = np.ones(7) / 7
    g = fit.gfun(x, p, 0.2)                       # only neighbours within 0.2 of the scale
    assert g[0] > 0 and abs(g[3]) < 1e-12          # the middle sees a symmetric neighbourhood


def test_fit_recovers_known_eps_without_noise():
    x = _x(9); p = np.ones(9) / 9; w = np.full(9, 500.0)
    ybar = x + 0.5 * fit.gfun(x, p, 0.4)
    sse, kap = fit.fit_one(x, p, ybar, w)
    j = int(np.argmin(sse))
    assert abs(fit.EPS[j] - 0.4) < 1e-9 and abs(kap[j] - 0.5) < 1e-9


def test_committed_tables_have_no_microdata():
    d = json.load(open(os.path.join(os.path.dirname(__file__), "..", "experiments", "calibrate", "crosstabs.json")))
    for v in d.values():
        t = np.array(v["table"]); assert t.sum() == v["n"] and t.shape[0] == t.shape[1] == len(v["levels"])
