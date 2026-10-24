"""Features and a per-source weight that try to say WHICH of the two warped sources is wrong.

capture-learngate's features say that the two warps disagree, not which one is at fault. Three additions:

  z_order   signed depth difference of the two warps at the target pixel (nearer-camera source minus farther-camera
            source). The z-buffer already shows the nearer surface, so a large difference marks an occlusion and its
            sign says which source is the one seeing through to the background.
  xerr0/1   cross-check error of each source: warp the OTHER source into this source's camera with the other source's
            own depth and compare with this source's real image. Where the other source's depth is wrong or the surface
            is not visible from it, this source's pixel is contradicted. The error map is then carried into the target
            view along with that source's pixels, like the matching cost.
  xdiff     xerr0 - xerr1, signed.

Output with a source weight s and a nearest-camera weight w, both per pixel:
    base' = s*c0 + (1-s)*c1 where both warps are valid (else the plain synthesis);  out = w*near + (1-w)*base'
s* (the best s given the truth) is a bound, not a method.
"""
import numpy as np
from .scene import W, H
from .synth import warp, close_cracks
from .hybrid import plain
from .learn import features as base_features, FEATURES as BASE_FEATURES

EXTRA = ["z_order", "xerr0", "xerr1", "xdiff"]
FEATURES = BASE_FEATURES + EXTRA


def _cross_error(src, other):
    """Per-pixel error (in `src`'s own pixel grid) of `other` warped into src's camera, 0 where it does not reach."""
    col, z, ang, _ = src
    c, ok, _zz = warp(other[0], other[1], other[2], ang, return_z=True)
    c, ok = close_cracks(c, ok)
    e = np.abs(c - col).sum(-1)
    return np.where(ok & np.isfinite(z), np.minimum(e, 1.5), 0.0), ok


def cross_errors(sources, dst_angle):
    """For the two sources in nearest-first order: their cross-check error maps carried into the target view."""
    srcs = sorted(sources, key=lambda s: abs(s[2] - dst_angle))
    out = []
    for i, s in enumerate(srcs):
        e, ok = _cross_error(s, srcs[1 - i])
        # carry along with s's own pixels; a pixel the other source does not reach has no verdict (flag via validity)
        m, _ = warp(np.repeat(e[..., None], 3, -1), s[1], s[2], dst_angle)
        m, _ = close_cracks(m, warp(s[0], s[1], s[2], dst_angle)[1])
        out.append(m[..., 0])
    return out


def features(ws, have, gap_deg, xe):
    X0 = base_features(ws, have, gap_deg)
    (c1, o1, z1, _), (c2, o2, z2, _) = ws[0], ws[1]
    both = o1 & o2
    zo = np.where(both, np.clip(np.where(np.isfinite(z1), z1, 20) - np.where(np.isfinite(z2), z2, 20), -5, 5), 0.0)
    e0, e1 = np.where(o1, xe[0], 0.0), np.where(o2, xe[1], 0.0)
    return np.concatenate([X0, np.stack([zo, e0, e1, e0 - e1], -1)], -1)


def ideal_source_weight(c0, c1, truth):
    """Least-squares share of source 0 (nearest camera) against source 1 in the mix, per pixel, and its squared norm."""
    dv = c0 - c1
    den = (dv ** 2).sum(-1)
    num = ((truth - c1) * dv).sum(-1)
    with np.errstate(invalid="ignore", divide="ignore"):
        s = np.where(den > 1e-9, num / den, 0.5)
    return np.clip(s, 0.0, 1.0), den


def mix(ws, have, s):
    """Source-weighted base: s*c0 + (1-s)*c1 where both warps are valid, the plain synthesis elsewhere."""
    base, _ = plain(ws)
    (c0, o0, _, _), (c1, o1, _, _) = ws[0], ws[1]
    both = (o0 & o1)[..., None]
    sm = s[..., None]
    return np.where(both, sm * c0 + (1 - sm) * c1, base)
