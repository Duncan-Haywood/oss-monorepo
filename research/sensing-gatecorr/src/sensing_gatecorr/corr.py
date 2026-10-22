"""Mismatches that repeat across views: a bad feature is wrong, by the same offset, in `span` consecutive views.

`sensing-gatemix` drew every wrong observation independently. A real bad feature (a repeated texture, a
specular spot) is usually wrong in several neighbouring views, and the same way, so the epipolar tests of
those views agree with each other. This module patches `sensing-epigate`'s mismatch function with a
correlated one at a fixed overall rate and runs the unchanged `sensing_epigate.run_trial`.
"""
import sys
from contextlib import contextmanager
from pathlib import Path
import numpy as np

_R = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_R / "sensing-epigate" / "src"))
sys.path.insert(0, str(_R / "sensing-baoutlier" / "src"))
from sensing_epigate import gate  # noqa: E402


def correlated_mismatch(span, clean, vis, frac, rng, near_px=40.0):
    """Corrupt about `frac` of the visible observations in runs. Each feature is bad with probability
    min(1, frac * V / span); a bad feature gets one pixel offset (10 to `near_px` px, random direction)
    added in `span` consecutive views (cyclic, from a random start) where it is visible.
    Returns (uvs, mask)."""
    V, n = vis.shape
    p = min(1.0, frac * V / span)
    bad = rng.random(n) < p
    ang = rng.uniform(0, 2 * np.pi, n)
    off = rng.uniform(10.0, near_px, n)[:, None] * np.c_[np.cos(ang), np.sin(ang)]
    start = rng.integers(0, V, n)
    mask = np.zeros(vis.shape, bool)
    for i in np.flatnonzero(bad):
        mask[(start[i] + np.arange(span)) % V, i] = True
    mask &= vis
    out = clean.copy()
    vs, is_ = np.nonzero(mask)
    out[vs, is_] = clean[vs, is_] + off[is_]
    return out, mask


@contextmanager
def _patched(span):
    orig = gate.mismatch

    def fake(kind, clean, vis, frac, rng, cams=None, pts=None, near_px=40.0):
        return correlated_mismatch(span, clean, vis, frac, rng, near_px)

    gate.mismatch = fake
    try:
        yield
    finally:
        gate.mismatch = orig


def run_corr(span, frac, **kw):
    """`sensing_epigate.run_trial` with mismatches repeated over `span` consecutive views."""
    with _patched(span):
        r = gate.run_trial(kind="corr", frac=frac, **kw)
    return r
