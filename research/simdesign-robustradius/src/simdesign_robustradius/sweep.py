"""One (filter radius, threshold gap) case of the robust-radius sweep.

Reuses ``simdesign-robust`` (worst-of-three projection) and ``simdesign-heaviside`` (measures)
unchanged. d_eta = 0 is the plain Heaviside design. Every design is re-analysed at the same
eroded / blueprint / dilated thresholds (0.5 +/- 0.2) so cases compare on equal terms.
"""
import os, sys
HERE = os.path.dirname(__file__)
for p in ("simdesign-robust", "simdesign-heaviside"):
    sys.path.insert(0, os.path.join(HERE, "..", "..", "..", p, "src"))
import numpy as np
from simdesign_robust import robust_topopt
from simdesign_heaviside import project, grey_share, min_length_scale
from simdesign_topopt import fe_compliance, mbb_problem

D_EVAL = 0.2
CASES = [(r, d) for r in (2.0, 4.0, 6.0) for d in (0.0, 0.1, 0.2)]


def run_case(nx, ny, rmin, d_eta, **kw):
    r = robust_topopt(nx, ny, 0.5, rmin, d_eta=d_eta, **kw)
    f, fixed = mbb_problem(nx, ny)
    fields = [project(r["xt"].reshape(-1), r["beta"], e) for e in (0.5 + D_EVAL, 0.5, 0.5 - D_EVAL)]
    cs = [fe_compliance(p.reshape(ny, nx), nx, ny, f, fixed, 3.0)[0] for p in fields]
    bp = fields[1].reshape(ny, nx)
    mask = bp > 0.5
    return {"rmin": rmin, "d_eta": d_eta, "c_e": cs[0], "c_b": cs[1], "c_d": cs[2],
            "grey": grey_share(bp), "ms": min_length_scale(mask), "mv": min_length_scale(~mask),
            "bp": bp}
