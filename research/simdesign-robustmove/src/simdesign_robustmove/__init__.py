"""Does the optimality-criteria move limit decide whether a robust topology optimisation survives its beta steps?

Reuses ``simdesign_robust.robust_topopt`` (which has a ``move`` argument) and the evaluation of
``simdesign_robustradius.run_case`` unchanged; only the move limit varies.
"""
import os, sys
HERE = os.path.dirname(__file__)
for p in ("simdesign-robust", "simdesign-heaviside", "simdesign-robustradius", "simdesign-topopt"):
    sys.path.insert(0, os.path.join(HERE, "..", "..", "..", p, "src"))
import numpy as np
from simdesign_robust import robust_topopt  # noqa: E402
from simdesign_heaviside import project, grey_share  # noqa: E402
from simdesign_topopt import fe_compliance, mbb_problem  # noqa: E402

D_EVAL = 0.2
MOVES = (0.2, 0.1, 0.05)


def spikes(history, iters_per_beta=30, factor=3.0):
    """Number of iterations whose worst-case compliance exceeds ``factor`` times the previous
    iteration's, and the largest such ratio. A step that breaks a member shows up as one."""
    h = np.asarray(history, dtype=float)
    ratio = h[1:] / h[:-1]
    return int((ratio > factor).sum()), float(ratio.max())


def run_move(nx, ny, rmin, move, d_eta=0.2, **kw):
    """One robust run at the given move limit, re-analysed at 0.5 +/- 0.2 like the earlier projects."""
    r = robust_topopt(nx, ny, 0.5, rmin, d_eta=d_eta, move=move, **kw)
    f, fixed = mbb_problem(nx, ny)
    fields = [project(r["xt"].reshape(-1), r["beta"], e) for e in (0.5 + D_EVAL, 0.5, 0.5 - D_EVAL)]
    cs = [fe_compliance(p.reshape(ny, nx), nx, ny, f, fixed, 3.0)[0] for p in fields]
    n_spike, max_ratio = spikes(r["history"])
    return {"move": move, "c_e": cs[0], "c_b": cs[1], "c_d": cs[2], "grey": grey_share(fields[1]),
            "n_spike": n_spike, "max_ratio": max_ratio, "history": r["history"], "bp": fields[1].reshape(ny, nx)}


def failed(c_b, best_c_b, factor=1.5):
    """A run failed if its blueprint compliance is more than ``factor`` times the best at the same case."""
    return c_b > factor * best_c_b
