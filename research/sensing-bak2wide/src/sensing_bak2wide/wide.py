"""The sensing-bak2 experiment on a rig with a wider field of view.

The object stays the same size in the image (about 1.2 radii across at 640 x 480) while the camera moves in
and the focal length shrinks with it: f = F_PER_DIST * dist, so dist = 4, f = 800 is the sensing-bak2 rig.
A shorter focal length at the same pixel size puts the same points at a larger normalised radius, where
the r^4 term of the lens law is no longer negligible. Nothing else changes: solver, scoring, noise and
pose error are those of sensing-bak2, imported unchanged.
"""
import sys
from contextlib import contextmanager
from pathlib import Path
import numpy as np

_R = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_R / "sensing-bak2" / "src"))
sys.path.insert(0, str(_R / "sensing-bafocal" / "src"))
sys.path.insert(0, str(_R / "sensing-ba" / "src"))
sys.path.insert(0, str(_R / "sensing-recon" / "src"))
import sensing_bak2.bak2 as bak2  # noqa: E402
import sensing_recon.recon as recon  # noqa: E402
from sensing_recon import make_object, orbit_cameras, visible  # noqa: E402

F_PER_DIST = 200.0  # px per unit of camera distance; 800 px at the default distance of 4


@contextmanager
def wide_rig(dist):
    """Temporarily set the camera distance and the matching focal length in every module that holds them."""
    f = F_PER_DIST * dist
    old = (recon.DIST, recon.F_PX, bak2.F_PX)
    recon.DIST, recon.F_PX, bak2.F_PX = dist, f, f
    try:
        yield f
    finally:
        recon.DIST, recon.F_PX, bak2.F_PX = old


def rig_radius_stats(dist, n_feat=300, seeds=6, n_views=12):
    """Normalised radius sqrt(x^2+y^2)/z of every visible point: (max, 95th percentile, number of points)."""
    r = []
    with wide_rig(dist):
        cams = orbit_cameras(n_views, 360.0)
        for s in range(seeds):
            pts, nrm = make_object(n_feat, seed=s)
            for c in cams:
                p = pts[visible(c, pts, nrm)]
                pc = p @ c.R.T + c.t
                r.append(np.hypot(pc[:, 0], pc[:, 1]) / pc[:, 2])
    r = np.concatenate(r)
    return float(r.max()), float(np.percentile(r, 95)), int(len(r))


def run_trial_wide(dist=4.0, **kw):
    """sensing-bak2.run_trial on the rig of camera distance `dist`; adds the true focal and the radii."""
    with wide_rig(dist) as f:
        out = bak2.run_trial(**kw)
    out["f_true"] = f
    return out
