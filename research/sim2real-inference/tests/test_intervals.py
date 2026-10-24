import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3b_intervals"))
import sim2real_inference.estimators as est
from intervals import stats


def test_vectorised_stats_match_library():
    rng = np.random.default_rng(3)
    for meth in ("cv", "ppi_pp"):
        r, t, ex = rng.normal(size=20), rng.normal(size=20) * 0.5, rng.normal(size=90)
        r = r + 0.8 * t
        e, se = stats(meth, r[None], t[None], ex[None])
        lo, hi = est.interval(meth, list(r), list(t), list(ex))
        q = est.t_quantile(0.975, 18 if meth == "cv" else 19)
        assert abs(e[0] - est.estimate(meth, list(r), list(t), list(ex))) < 1e-12
        assert abs((hi - lo) / 2 - q * se[0]) < 1e-9
