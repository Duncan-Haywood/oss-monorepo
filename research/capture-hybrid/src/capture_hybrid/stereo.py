"""Block-matching stereo on a rectified pair, with a left-right check.

Window SAD over colour, sub-pixel by a parabola through the three costs around the best integer disparity.
Deliberately the classic baseline: no learned prior, no semi-global smoothing.
"""
import numpy as np
from .scene import W, H, F


def _box(a, r):
    """Mean over a (2r+1)^2 window along the last two axes (edge-padded), by cumulative sums."""
    k = 2 * r + 1
    p = np.pad(a, [(0, 0)] * (a.ndim - 2) + [(r, r), (r, r)], mode="edge")
    c = np.cumsum(np.cumsum(p, -2), -1)
    c = np.pad(c, [(0, 0)] * (a.ndim - 2) + [(1, 0), (1, 0)])
    return (c[..., k:, k:] - c[..., :-k, k:] - c[..., k:, :-k] + c[..., :-k, :-k]) / (k * k)


def cost_volume(left, right, dmax, r):
    """cost[d, y, x]: window-mean absolute colour difference of left (x, y) against right (x - d, y)."""
    cost = np.full((dmax + 1, H, W), 3.0)
    for d in range(dmax + 1):
        diff = np.abs(left[:, d:] - right[:, :W - d]).sum(-1)
        full = np.full((H, W), 3.0)
        full[:, d:] = diff
        cost[d] = full
    return _box(cost, r)


def match(left, right, baseline, dmax=48, r=3, lr_tol=1.0, min_disp=1.0):
    """Disparity and depth for the left image.

    Returns (depth, disparity, ok). depth is metres along the optical axis; pixels that fail the left-right
    check, or whose disparity is under `min_disp` (too far to measure, taken as background) get depth inf.
    """
    cl = cost_volume(left, right, dmax, r)
    d0 = cl.argmin(0)
    y, x = np.mgrid[0:H, 0:W]
    dm, dp = np.clip(d0 - 1, 0, dmax), np.clip(d0 + 1, 0, dmax)
    c0, cm, cp = cl[d0, y, x], cl[dm, y, x], cl[dp, y, x]
    den = cm - 2 * c0 + cp
    with np.errstate(divide="ignore", invalid="ignore"):
        off = np.where(den > 1e-9, 0.5 * (cm - cp) / den, 0.0)
    disp = d0 + np.clip(off, -0.5, 0.5)
    # right-reference check: best disparity of right pixel (x - d) must come back to d
    xr = np.clip(x - d0, 0, W - 1)
    cr = np.full((dmax + 1, H, W), 3.0)
    for d in range(dmax + 1):
        cr[d, :, :W - d] = cl[d, :, d:]
    dr = cr.argmin(0)[y, xr]
    ok = (np.abs(dr - d0) <= lr_tol) & (disp >= min_disp) & (d0 > 0) & (d0 < dmax)
    with np.errstate(divide="ignore"):
        z = np.where(ok, F * baseline / disp, np.inf)
    return z, disp, ok


def depth_errors(z_est, z_true):
    """Relative depth error |z_est - z_true| / z_true on pixels where both are finite. Returns (array, coverage).

    coverage is the share of true-surface pixels that got a finite estimate.
    """
    surf = np.isfinite(z_true)
    both = surf & np.isfinite(z_est)
    return np.abs(z_est[both] - z_true[both]) / z_true[both], float(both.sum() / max(surf.sum(), 1))
