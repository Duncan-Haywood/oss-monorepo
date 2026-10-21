"""Hard and soft confidence gates for a synthesised in-between view built from measured stereo depth.

Strategies (all start from the two warped sources; holes always come from the raw nearest camera):
  fill      capture-hybrid's background hole fill, for reference
  hard      capture-hybrid's gate: where the two warps disagree by more than `tau`, use the raw nearest camera
  soft      a blend weight that rises linearly from 0 at disagreement `t0` to 1 at `t1`, then widened and smoothed
  cost      hard gate on the stereo matching cost of the warped pixels (the second confidence signal)
  softcost  soft disagreement weight, raised to 1 wherever the matching cost is above `ct`
  oracle    per pixel, whichever of plain and raw nearest is closer to the truth; an upper bound, not a method
"""
import numpy as np
from .scene import W, H, SKY
from .synth import warp, close_cracks


def warped(sources, dst_angle):
    """Per source (nearest-in-angle first): crack-closed colour, valid mask, target-frame depth, target-frame matching cost."""
    out = []
    for col, z, ang, cost in sorted(sources, key=lambda s: abs(s[2] - dst_angle)):
        c, ok, zm = warp(col, z, ang, dst_angle, return_z=True)
        c, ok2 = close_cracks(c, ok)
        k, _ = warp(np.repeat(cost[..., None], 3, -1), z, ang, dst_angle)
        k, _ = close_cracks(k, ok)
        out.append((c, ok2, zm, k[..., 0]))
    return out


def plain(ws):
    out = np.tile(SKY, (H, W, 1))
    have = np.zeros((H, W), bool)
    for c, ok, _, _ in ws:
        take = ok & ~have
        out[take] = c[take]
        have |= ok
    return out, have


def row_fill(img, have, zmap):
    """Fill holes by background propagation along rows: the farther of the nearest valid left/right neighbours."""
    out = img.copy()
    x = np.arange(W)
    for y in range(H):
        idx = np.flatnonzero(have[y])
        if idx.size == 0:
            continue
        hole = ~have[y]
        pos = np.searchsorted(idx, x[hole])
        li = idx[np.clip(pos - 1, 0, idx.size - 1)]
        ri = idx[np.clip(pos, 0, idx.size - 1)]
        zl, zr = zmap[y, li], zmap[y, ri]
        pick = np.where(zl >= zr, li, ri)
        out[y, hole] = img[y, pick]
    return out


def disagreement(ws):
    """Per-pixel colour distance between the two warps where both are valid; 0 elsewhere."""
    (c1, o1, _, _), (c2, o2, _, _) = ws[0], ws[1]
    d = np.abs(c1 - c2).sum(-1)
    return np.where(o1 & o2, d, 0.0)


def match_cost(ws):
    """Worst matching cost of the warped sources at each pixel, over the sources valid there; 0 where none is."""
    k = np.stack([np.where(w[1], w[3], 0.0) for w in ws])
    return k.max(0)


def _dilate(m, r):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = out | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return out


def _grow_max(a, r):
    for _ in range(r):
        p = np.pad(a, 1, mode="edge")
        a = np.maximum.reduce([a, p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
    return a


def _smooth(a, r):
    for _ in range(r):
        p = np.pad(a, 1, mode="edge")
        a = sum(p[i:i + H, j:j + W] for i in range(3) for j in range(3)) / 9.0
    return a


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0.0, 1.0)


def weight(strategy, ws, have, t0, t1, ct, grow, smooth):
    """Share of the raw nearest camera in the output, per pixel."""
    d = disagreement(ws)
    if strategy == "hard":
        w = _dilate(d > t0, grow).astype(float)
    elif strategy == "soft":
        w = _smooth(_grow_max(ramp(d, t0, t1), grow), smooth)
    elif strategy == "cost":
        w = _dilate(match_cost(ws) > ct, grow).astype(float)
    elif strategy == "softcost":
        w = np.maximum(_smooth(_grow_max(ramp(d, t0, t1), grow), smooth), _dilate(match_cost(ws) > ct, grow))
    else:
        raise ValueError(strategy)
    return np.where(have, w, 1.0)


def make(strategy, sources, dst_angle, t0=0.15, t1=0.5, ct=0.4, grow=1, smooth=1, truth=None):
    """sources: (colour, depth, angle, matching cost) per camera. Returns the synthesised target view."""
    ws = warped(sources, dst_angle)
    base, have = plain(ws)
    nearest = min(sources, key=lambda s: abs(s[2] - dst_angle))[0]
    zbest = np.where(ws[0][1], ws[0][2], ws[1][2])
    if strategy == "fill":
        return row_fill(base, have, zbest)
    if strategy == "oracle":
        better = np.abs(nearest - truth).sum(-1) < np.abs(base - truth).sum(-1)
        return np.where(better[..., None], nearest, np.where(have[..., None], base, nearest))
    w = weight(strategy, ws, have, t0, t1, ct, grow, smooth)[..., None]
    return w * nearest + (1 - w) * base
