"""Same physical filter radius on different meshes: does the minimum feature follow the radius as a share of the beam?

Reuses ``simdesign_robustradius.run_case`` (which reuses ``simdesign-robust`` and
``simdesign-heaviside``) unchanged; only the mesh and the radius in elements change.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-robustradius", "src"))
from simdesign_robustradius import run_case  # noqa: E402

RADIUS_FRACTIONS = (1 / 60, 1 / 30, 1 / 20)  # filter radius as a share of the beam length


def radius_px(nx, fraction):
    """Filter radius in elements for a given share of the beam length."""
    return nx * fraction


def run_mesh(nx, ny, fraction, d_eta, **kw):
    """One case at filter radius = fraction * nx elements; adds the length scale as a share of nx."""
    r = run_case(nx, ny, radius_px(nx, fraction), d_eta, **kw)
    r["ms_share"] = r["ms"] / nx
    r["mv_share"] = r["mv"] / nx
    return r
