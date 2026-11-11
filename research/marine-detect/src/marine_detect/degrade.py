"""Image degradations: fog (Koschmieder) and sun glint on the water.

Fog follows the atmospheric scattering model (Koschmieder 1924; Middleton 1952;
Narasimhan and Nayar 2002): I = J t + A (1 - t), with transmission t = exp(-beta d).
With the 2% contrast threshold, meteorological visibility is V = 3.912 / beta, so an
object at range d seen through transmission t sits at d / V = -ln(t) / 3.912.
Here t is uniform over the frame (every pixel at the same optical depth): a lower
bound on what range-dependent fog does to near water, an upper bound for far shore.

Glint is stylised: Gaussian specular blobs centred on water pixels, added and clipped
at 1 (sensor saturation). No sourced glint statistics exist for MaSTr1325; the strength
is swept, not chosen.
"""
from __future__ import annotations

import math

import numpy as np

from .data import WATER

KOSCHMIEDER = 3.912  # -ln(0.02)


def fog(img: np.ndarray, t: float, airlight: float = 0.8) -> np.ndarray:
    """img (3, H, W) or (N, 3, H, W) in [0, 1]; uniform transmission t in (0, 1]."""
    return img * t + airlight * (1.0 - t)


def range_over_visibility(t: float) -> float:
    """d / V for an object seen through transmission t (Koschmieder, 2% threshold)."""
    return -math.log(t) / KOSCHMIEDER


def glint(img: np.ndarray, mask: np.ndarray, strength: float, n_blobs: int = 3,
          radius_frac: float = 0.06, seed: int = 0) -> np.ndarray:
    """Add n_blobs saturating Gaussian highlights centred on random water pixels of one frame.

    img (3, H, W), mask (H, W) ground truth (only used to place blobs on water).
    """
    if strength <= 0:
        return img.copy()
    rng = np.random.default_rng(seed)
    _, h, w = img.shape
    ys, xs = np.nonzero(mask == WATER)
    out = img.copy()
    if len(ys) == 0:
        return out
    yy, xx = np.mgrid[0:h, 0:w]
    sigma = radius_frac * w
    field = np.zeros((h, w), dtype=np.float32)
    for k in rng.choice(len(ys), size=min(n_blobs, len(ys)), replace=False):
        field += np.exp(-((yy - ys[k]) ** 2 + (xx - xs[k]) ** 2) / (2 * sigma ** 2))
    out = out + strength * np.clip(field, 0, 1)[None]
    return np.clip(out, 0.0, 1.0).astype(np.float32)
