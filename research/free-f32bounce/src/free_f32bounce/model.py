"""Event-driven Sinai billiard in a chosen dtype: a point particle in the unit square with a circular obstacle.

The particle flies straight until it reaches a wall (4 flat surfaces) or the circle (radius R, centre (0.5, 0.5)),
then reflects specularly. The circle disperses nearby paths, so the motion is chaotic. Each flight solves for the
nearest surface, so a rounding error can change *which* surface is hit next (the event order), not only where.
Every operation is carried out in the run's dtype; the direction vector is not renormalised, as a simple engine
would not, so its length can drift (reported by `speed`). The surface just hit is excluded from the next search,
which is valid because every surface is convex seen from inside the table.

Surface ids: 0 x=0, 1 x=1, 2 y=0, 3 y=1, 4 circle.
"""
import numpy as np

R = 0.25
C = 0.5
__all__ = ["R", "C", "mean_free_path_exact", "initial_states", "perturbed", "run"]


def mean_free_path_exact(r=R):
    """Cauchy's formula for a table with a hole: pi * area / perimeter (in units where speed times time = distance)."""
    return np.pi * (1.0 - np.pi * r * r) / (4.0 + 2.0 * np.pi * r)


def _flight(p, d, last, dtype, r):
    """Next surface hit. Returns (t, surface id); t is the flight parameter along d."""
    big = dtype(np.inf)
    with np.errstate(divide="ignore", invalid="ignore"):
        tx = np.where(d[:, 0] > 0, (dtype(1) - p[:, 0]) / d[:, 0], np.where(d[:, 0] < 0, -p[:, 0] / d[:, 0], big))
        ty = np.where(d[:, 1] > 0, (dtype(1) - p[:, 1]) / d[:, 1], np.where(d[:, 1] < 0, -p[:, 1] / d[:, 1], big))
    tx = np.where(last == (np.where(d[:, 0] > 0, 1, 0)), big, tx)
    ty = np.where(last == (np.where(d[:, 1] > 0, 3, 2)), big, ty)
    f = p - dtype(C)
    dd = (d * d).sum(axis=1)
    b = (f * d).sum(axis=1)
    cc = (f * f).sum(axis=1) - dtype(r * r)
    disc = b * b - dd * cc
    ok = (disc > 0) & (b < 0) & (last != 4)
    with np.errstate(invalid="ignore", divide="ignore"):
        tc = np.where(ok, (-b - np.sqrt(np.where(ok, disc, dtype(0)))) / dd, big)
    ts = np.stack([tx, ty, tc], axis=1)
    kx = np.where(d[:, 0] > 0, 1, 0)
    ky = np.where(d[:, 1] > 0, 3, 2)
    ids = np.stack([kx, ky, np.full(len(p), 4)], axis=1)
    a = ts.argmin(axis=1)
    return ts[np.arange(len(p)), a], ids[np.arange(len(p)), a]


def initial_states(count, seed, burn=50, r=R):
    """float64 (p, d) after `burn` collisions from random starts outside the circle. Returns arrays (count,2),(count,2)."""
    rng = np.random.default_rng(seed)
    p = np.empty((count, 2))
    k = 0
    while k < count:
        q = rng.uniform(0.02, 0.98, 2)
        if np.hypot(q[0] - C, q[1] - C) > r + 0.02:
            p[k] = q
            k += 1
    th = rng.uniform(0, 2 * np.pi, count)
    d = np.stack([np.cos(th), np.sin(th)], axis=1)
    out = run(p, d, burn, np.float64, r=r)
    return out["p"], out["d"]


def perturbed(p, delta, seed):
    """Move every start position by exactly `delta` in a random direction (kept in float64)."""
    th = np.random.default_rng(seed).uniform(0, 2 * np.pi, len(p))
    return p + delta * np.stack([np.cos(th), np.sin(th)], axis=1)


def run(p0, d0, collisions, dtype, r=R, last0=None):
    """Advance an ensemble by `collisions` collisions in `dtype`.

    Returns a dict: 'p', 'd' final state (float64), 'last' last surface, and per-collision logs of shape
    (collisions, count): 'surf' surface ids (int8), 'pos' hit positions (float64, shape (collisions, count, 2)),
    'path' distance flown (float64, flight parameter times current direction length).
    """
    p = p0.astype(dtype)
    d = d0.astype(dtype)
    n = len(p)
    last = np.full(n, -1) if last0 is None else last0.copy()
    surf = np.empty((collisions, n), dtype=np.int8)
    pos = np.empty((collisions, n, 2))
    path = np.empty((collisions, n))
    for k in range(collisions):
        t, sid = _flight(p, d, last, dtype, r)
        path[k] = (t * np.sqrt((d * d).sum(axis=1))).astype(np.float64)
        p = p + d * t[:, None]
        wx = (sid <= 1)
        wy = (sid == 2) | (sid == 3)
        nrm = (p - dtype(C)) / dtype(r)
        dn = (d * nrm).sum(axis=1)
        dc = d - dtype(2) * dn[:, None] * nrm
        d = np.where(wx[:, None], d * np.array([-1, 1], dtype=dtype), np.where(wy[:, None], d * np.array([1, -1], dtype=dtype), dc))
        last = sid
        surf[k] = sid
        pos[k] = p.astype(np.float64)
    return {"p": p.astype(np.float64), "d": d.astype(np.float64), "last": last, "surf": surf, "pos": pos, "path": path}


def departure_index(a, b, thr):
    """First collision index at which positions differ by more than thr (NaN if never). a, b: (collisions,count,2)."""
    over = np.linalg.norm(a - b, axis=2) > thr
    return np.where(over.any(axis=0), over.argmax(axis=0) + 1.0, np.nan)


def surface_departure(sa, sb):
    """First collision index at which the sequences of surfaces differ (the event order changes); NaN if never."""
    over = sa != sb
    return np.where(over.any(axis=0), over.argmax(axis=0) + 1.0, np.nan)
