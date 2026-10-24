"""Ways to repair a synthesised in-between view built from measured (holey, correlated-error) stereo depth.

Every strategy takes the two warped sources and returns an image; scoring is left to the caller.
  plain     capture-stereodepth's result: nearest-in-angle source first, holes stay sky
  fill      holes get the farther of the nearest valid pixels to their left and right in the same row (background fill)
  fallback  holes get the pixel at the same coordinates in the nearest raw camera image (no warp)
  gate      as fallback, plus pixels where the two warps disagree by more than `tau` (a confidence test that
            needs no ground truth) are replaced by the raw nearest camera as well
  oracle    per pixel, whichever of plain and raw nearest is closer to the truth; an upper bound, not a method
"""
import numpy as np
from .scene import W, H, SKY
from .synth import warp, close_cracks


def warped(sources, dst_angle):
    """Per source (sorted nearest-in-angle first): crack-closed colour, valid mask, target-frame depth."""
    out = []
    for col, z, ang in sorted(sources, key=lambda s: abs(s[2] - dst_angle)):
        c, ok, zm = warp(col, z, ang, dst_angle, return_z=True)
        c, ok2 = close_cracks(c, ok)
        out.append((c, ok2, zm))
    return out


def plain(ws):
    out = np.tile(SKY, (H, W, 1))
    have = np.zeros((H, W), bool)
    for c, ok, _ in ws:
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
    (c1, o1, _), (c2, o2, _) = ws[0], ws[1]
    d = np.abs(c1 - c2).sum(-1)
    return np.where(o1 & o2, d, 0.0)


def _dilate(m, r):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = out | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return out


def make(strategy, sources, dst_angle, tau=0.3, grow=1, truth=None):
    ws = warped(sources, dst_angle)
    base, have = plain(ws)
    nearest = min(sources, key=lambda s: abs(s[2] - dst_angle))[0]
    zbest = np.where(ws[0][1], ws[0][2], ws[1][2])
    if strategy == "plain":
        return base
    if strategy == "fill":
        return row_fill(base, have, zbest)
    if strategy == "fallback":
        out = base.copy()
        out[~have] = nearest[~have]
        return out
    if strategy == "gate":
        bad = _dilate(disagreement(ws) > tau, grow) | ~have
        return np.where(bad[..., None], nearest, base)
    if strategy == "oracle":
        better = np.abs(nearest - truth).sum(-1) < np.abs(base - truth).sum(-1)
        return np.where(better[..., None], nearest, base)
    raise ValueError(strategy)
