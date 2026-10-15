"""Stress measures taken from the element-centroid von Mises field of ``solve(..., return_field=True)``.

peak        : largest element-centroid stress outside the clamp zone (what simdesign-dfm used).
patch(rho)  : largest area-weighted mean of the field over a disc of radius rho (mm) centred on
              an element centroid. Elements whose centroid lies within rho count, weighted by area.
"""
import numpy as np
from scipy.spatial import cKDTree


def patch_max(field: dict, rho: float) -> float:
    cen, vm, ar, free = field["cen"], field["vm"], field["area"], field["free"]
    idx = np.flatnonzero(free)
    tree = cKDTree(cen)
    best = 0.0
    # only discs centred near the top few peaks can win; test the 200 highest centroids
    for i in idx[np.argsort(vm[idx])[-200:]]:
        nb = tree.query_ball_point(cen[i], rho)
        best = max(best, float(np.dot(vm[nb], ar[nb]) / ar[nb].sum()))
    return best


def nominal_bending_mpa(F: float, L: float, w: float, b: float) -> float:
    """Elementary-beam bending stress 6 M / (b w^2) in the vertical arm just above the corner,
    with the load at the free end of the horizontal arm (moment arm L - w/2)."""
    return 6.0 * F * (L - w / 2.0) / (b * w ** 2)
