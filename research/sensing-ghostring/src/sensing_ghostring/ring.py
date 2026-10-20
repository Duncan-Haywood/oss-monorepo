"""Edge-ring handling for burst merging of a moving subject (synthetic, Poisson-Gaussian noise).

Builds on the aligned and reject-only merges copied from `research/sensing-ghostalign` (align.py). New:
a temporal-median background, a subject mask estimated from frame 0 against that background, and merges
that use the aligned result inside the subject, a background-aware result outside it, and a configurable
treatment of the ring between them.
"""
import numpy as np
from .align import _box, merge_aligned_pair, merge_refguided

__all__ = ["median_background", "subject_mask", "dilate", "erode", "combine", "merge_ring"]


def median_background(e):
    """Per-pixel temporal median of the electron frames (a background estimate that works only when the
    subject covers a pixel in fewer than half of the frames)."""
    return np.median(e, axis=0)


def dilate(m, r=1):
    for _ in range(r):
        g = m.copy()
        g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        m = g
    return m


def erode(m, r=1):
    return ~dilate(~m, r)


def subject_mask(e, read, thresh=21.7):
    """Pixels where frame 0 disagrees with the temporal median (3x3 chi-square test): the subject as it
    stands in frame 0. Medians of n frames are noisier than one frame, so the test uses the frame-0
    variance for both."""
    bg = median_background(e)
    loc = np.maximum(_box((e[0] + bg) / 2, 1) / 9.0, 0)
    t = _box((e[0] - bg) ** 2 / (2.0 * (loc + read ** 2)), 1)
    return t > thresh


def combine(e, s, read, al, rg, mode="band", band=1):
    """Combine precomputed aligned+rejected (`al`) and reject-only (`rg`) radiance estimates around the
    subject mask M from `subject_mask`. Inside erode(M, band): `al`. Outside dilate(M, band): `rg`. In the
    ring between them:
      "band": frame 0 alone; "median": the temporal median of the frames; "aligned": `al`; "reject": `rg`."""
    m = subject_mask(e, read)
    core = erode(m, band)
    outside = ~dilate(m, band)
    ringval = {"band": e[0] / s, "median": median_background(e) / s, "aligned": al, "reject": rg}[mode]
    return np.where(core, al, np.where(outside, rg, ringval))


def merge_ring(e, s, read, mode="band", v_max=None, band=1, **kw):
    """`combine` after computing the two merges it needs. Returns radiance."""
    al = merge_aligned_pair(e, s, read, v_max=v_max, **kw)[1]
    return combine(e, s, read, al, merge_refguided(e, s, read), mode=mode, band=band)
