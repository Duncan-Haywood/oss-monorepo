"""Polygon nesting on a raster. Cells are `cell` cm square; a piece covers every cell that any of
4x4 sub-samples falls inside (conservative, so lengths are slightly overestimated). Pieces keep
their grain: only a 180-degree turn is allowed. Placement is bottom-left (lowest row, then lowest
column) found for all positions at once by FFT cross-correlation of the occupancy grid."""
import math
from dataclasses import dataclass
import numpy as np
from scipy.signal import fftconvolve


@dataclass(frozen=True)
class Piece:
    name: str
    poly: tuple  # ((x, y), ...) in cm, simple polygon

    def rotated(self):
        return Piece(self.name, tuple((-x, -y) for x, y in self.poly))


def polygon_area(poly):
    a = 0.0
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        a += x0 * y1 - x1 * y0
    return abs(a) / 2


def _inside(poly, px, py):
    """Even-odd rule, vectorised over sample points."""
    inside = np.zeros(px.shape, bool)
    n = len(poly)
    for k in range(n):
        x0, y0 = poly[k]; x1, y1 = poly[(k + 1) % n]
        if y0 == y1:
            continue
        cond = ((y0 > py) != (y1 > py))
        xint = x0 + (py - y0) * (x1 - x0) / (y1 - y0)
        inside ^= cond & (px < xint)
    return inside


def rasterise(piece, cell=2.0, sub=4):
    xs = [p[0] for p in piece.poly]; ys = [p[1] for p in piece.poly]
    x0, y0 = min(xs), min(ys)
    w = int(math.ceil((max(xs) - x0) / cell)); h = int(math.ceil((max(ys) - y0) / cell))
    g = (np.arange(sub) + 0.5) / sub
    gx = (np.arange(w)[:, None] + g[None, :]).ravel() * cell + x0
    gy = (np.arange(h)[:, None] + g[None, :]).ravel() * cell + y0
    PX, PY = np.meshgrid(gx, gy)
    ins = _inside(piece.poly, PX, PY).reshape(h, sub, w, sub)
    return ins.any(axis=(1, 3))  # (rows = y, cols = x)


def nest_raster(pieces, W, order, flips, cell=2.0, max_len=600.0):
    """Returns (placement {index: (row, col)}, marker length in cm, occupancy grid)."""
    cols = int(W // cell)
    rows = int(max_len // cell)
    occ = np.zeros((rows, cols), np.float32)
    masks = {}
    placed = {}
    top = 0
    for i in order:
        key = (i, bool(flips[i]))
        if key not in masks:
            p = pieces[i].rotated() if flips[i] else pieces[i]
            masks[key] = rasterise(p, cell).astype(np.float32)
        m = masks[key]
        h, w = m.shape
        if w > cols:
            raise ValueError("piece wider than fabric")
        ov = fftconvolve(occ, m[::-1, ::-1], mode="valid")  # overlap count at every position
        free = ov < 0.5
        if not free.any():
            raise ValueError("max_len too small")
        r = int(np.argmax(free.any(axis=1)))
        c = int(np.argmax(free[r]))
        occ[r:r + h, c:c + w] += m
        placed[i] = (r, c)
        top = max(top, r + h)
    return placed, top * cell, occ[:top]


def anneal_raster(pieces, W, evals=200, seed=0, cell=2.0, allow_flip=True):
    """Simulated annealing over (order, 180-degree flips), same move set as the rectangle version."""
    rng = np.random.default_rng(seed)
    n = len(pieces)
    order = sorted(range(n), key=lambda i: -polygon_area(pieces[i].poly))
    flips = [False] * n
    _, cur, _ = nest_raster(pieces, W, order, flips, cell)
    best, best_state = cur, (list(order), list(flips))
    t0 = 0.04 * cur
    for k in range(1, evals):
        t = t0 * (1 - k / evals) + 1e-9
        co, cf = list(order), list(flips)
        a, b = rng.integers(0, n, 2)
        u = rng.random()
        if allow_flip and u < 0.3:
            cf[a] = not cf[a]
        elif u < 0.65:
            co[a], co[b] = co[b], co[a]
        else:
            co.insert(b, co.pop(a))
        _, val, _ = nest_raster(pieces, W, co, cf, cell)
        if val <= cur or rng.random() < math.exp((cur - val) / t):
            order, flips, cur = co, cf, val
            if cur < best - 1e-9:
                best, best_state = cur, (list(order), list(flips))
    return best_state, best
