"""Filter radius versus robust threshold gap: which one sets the minimum feature size?

Thin wrapper over ``simdesign-heaviside`` and ``simdesign-robust`` (imported, not copied).
``run_case`` optimises one half-MBB beam and reports compliance at the three thresholds plus the
98% opening-rule minimum length scale of the blueprint.
"""
import os, sys
HERE = os.path.dirname(__file__)
for p in ("simdesign-heaviside", "simdesign-robust", "simdesign-topopt"):
    sys.path.insert(0, os.path.join(HERE, "..", "..", "..", p, "src"))
from simdesign_robust import robust_topopt  # noqa: E402
from simdesign_heaviside import topopt, project, grey_share, min_length_scale  # noqa: E402
from simdesign_topopt import fe_compliance, mbb_problem  # noqa: E402


def run_case(nx, ny, rmin, formulation, d_eta=0.2, **kw):
    """formulation 'heaviside' (single threshold 0.5) or 'robust' (0.5 +/- d_eta). Returns a dict.

    The heaviside design is re-analysed at the same eroded/dilated thresholds as the robust one,
    so both are judged alike.
    """
    if formulation == "heaviside":
        r = topopt(nx, ny, 0.5, rmin, mode="heaviside", **kw)
        f, fixed = mbb_problem(nx, ny)
        fields = [project(r["xt"].reshape(-1), r["beta"], e) for e in (0.5 + d_eta, 0.5, 0.5 - d_eta)]
        cs = [fe_compliance(p.reshape(ny, nx), nx, ny, f, fixed, 3.0)[0] for p in fields]
        bp = fields[1].reshape(ny, nx)
    elif formulation == "robust":
        r = robust_topopt(nx, ny, 0.5, rmin, d_eta=d_eta, **kw)
        cs = [r["c_eroded"], r["c_blueprint"], r["c_dilated"]]
        bp = r["blueprint"]
    else:
        raise ValueError(formulation)
    mask = bp > 0.5
    return {"c_e": cs[0], "c_b": cs[1], "c_d": cs[2], "grey": grey_share(bp),
            "ms": min_length_scale(mask), "mv": min_length_scale(~mask), "blueprint": bp}
