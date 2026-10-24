"""Layered (sub-pixel coverage) model of a moving disc over a still background, for burst merging.

Each frame's noise-free pixel is  y_i(p) = a_i(p) * S + (1 - a_i(p)) * B(p),  where a_i is the fraction of
pixel p the disc covers in frame i, S the disc radiance and B the background. Given the disc geometry,
B(p) has a closed-form least-squares solution over the frames, and the frame-0 estimate is
a_0 * S + (1 - a_0) * B. The geometry (centre, radius) is either given (an oracle bound) or fitted by
coordinate descent on the layered-model residual, starting from the subject mask of ring.py.
Coverage is computed on an 8x8 sub-pixel grid; the scene generator uses 4x4, so the model is not an
exact copy of the generator.
"""
import numpy as np

__all__ = ["coverage", "solve_background", "layered_estimate", "fit_disc", "merge_edge"]


def coverage(shape, cy, cx, r, up=8):
    """Fraction of each pixel covered by a disc, sampled on an `up` x `up` grid at p + k/up (the
    convention of align.render_frame)."""
    h, w = shape
    ys = (np.arange(h * up) / up)[:, None]
    xs = (np.arange(w * up) / up)[None, :]
    d = ((ys - cy) ** 2 + (xs - cx) ** 2 < r * r).astype(float)
    return d.reshape(h, up, w, up).mean(axis=(1, 3))


def _covs(shape, n, cy, cx, r, v):
    return np.stack([coverage(shape, cy, cx + v * i, r) for i in range(n)])


def solve_background(y, a, level):
    """Least-squares B(p) for y_i = a_i * level + (1 - a_i) * B over frames. Returns (B, support) where
    support = sum_i (1 - a_i)^2 is the number of effectively uncovered frames (0 where B is unobserved)."""
    b = 1.0 - a
    sup = (b * b).sum(axis=0)
    num = (b * (y - a * level)).sum(axis=0)
    return num / np.maximum(sup, 1e-9), sup


def layered_estimate(y, a, level, fallback, min_support=1.0):
    """Frame-0 estimate a_0 * level + (1 - a_0) * B, with `fallback` where B has less than `min_support`
    uncovered frames behind it. Returns (estimate, residual sum of squares per pixel)."""
    bg, sup = solve_background(y, a, level)
    model = a * level + (1 - a) * bg[None]
    est = a[0] * level + (1 - a[0]) * bg
    est = np.where(sup >= min_support, est, fallback)
    return est, ((y - model) ** 2).sum(axis=0)


def _cost(y, shape, geom, v, level, window):
    cy, cx, r = geom
    a = _covs(shape, y.shape[0], cy, cx, r, v)
    full = a[0] > 0.999
    if full.sum() >= 3:                 # the disc radiance follows from the geometry: mean of frame 0 inside it
        level = float(y[0][full].mean())
    _, rss = layered_estimate(y, a, level, y[0])
    return float(rss[window].sum())


def fit_disc(y, mask, v, level, steps=(2.0, 1.0, 0.5, 0.25, 0.125), passes=2):
    """Fit (cy, cx, r) of the frame-0 disc by coordinate descent on the layered-model residual over a
    window around the subject's path. `y` is radiance (electrons / s); `mask` is the frame-0 subject mask
    estimate, which gives the start (centroid, radius from area) and is used for nothing else. `v` and
    `level` are given (the speed is an oracle, as in the sibling projects)."""
    h, w = y.shape[1:]
    ys, xs = np.nonzero(mask)
    if len(ys) < 4:
        return None
    geom = [ys.mean() + 0.0, xs.mean() + 0.0, max(1.0, np.sqrt(mask.sum() / np.pi))]
    n = y.shape[0]
    path = np.zeros((h, w), bool)
    x_lo = max(0, int(geom[1] - geom[2] - 3)); x_hi = min(w, int(geom[1] + v * n + geom[2] + 3))
    y_lo = max(0, int(geom[0] - geom[2] - 3)); y_hi = min(h, int(geom[0] + geom[2] + 3))
    path[y_lo:y_hi, x_lo:x_hi] = True
    best = _cost(y, (h, w), geom, v, level, path)
    for dx in (-4, -2, 2, 4):        # the mask centroid is biased for slow subjects: try shifted starts along x
        g = [geom[0], geom[1] + dx, geom[2]]
        c = _cost(y, (h, w), g, v, level, path)
        if c < best:
            best, geom = c, g
    for step in steps:
        for _ in range(passes):
            for k in range(3):
                for d in (-2, -1, 1, 2):
                    g = list(geom)
                    g[k] += d * step
                    if g[2] < 1.0:
                        continue
                    c = _cost(y, (h, w), g, v, level, path)
                    if c < best:
                        best, geom = c, g
    return tuple(geom)


def merge_edge(e, s, read, al, v, geom=None, level=None, grow=3):
    """Replace the aligned+reject estimate `al` (radiance) by the layered estimate in the neighbourhood
    of the frame-0 disc (disc footprint dilated by `grow` px). `geom` = (cy, cx, r) of the frame-0 disc,
    or None to fit it. `level` = disc radiance, or None to take it as the mean of `al` over the pixels
    the fitted disc covers entirely. Returns (radiance estimate, geometry used)."""
    from .ring import subject_mask, dilate
    y = e / s
    n, h, w = y.shape
    if geom is None:
        m = subject_mask(e, read)
        lv = level if level is not None else float(np.median(y[0][m])) if m.any() else 0.9
        geom = fit_disc(y, m, v, lv)
        if geom is None:
            return al, None
    a = _covs((h, w), n, *geom, v)
    if level is None:
        full = a[0] > 0.999
        level = float(al[full].mean()) if full.sum() >= 3 else float(np.median(y[0][a[0] > 0.5]))
    est, _ = layered_estimate(y, a, level, al)
    near = dilate(a[0] > 0, grow)
    return np.where(near, est, al), geom
