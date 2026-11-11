"""Scores: per-class IoU, floating-obstacle recall by size, false alarms on water.

MODS (Bovcon et al. 2022, IEEE T-ITS) scores detection, not pixels: a
dynamic obstacle counts as found when the segmentation covers enough of its box, and
a false positive is an obstacle blob inside the water. MaSTr1325 has no boxes, so we
take the analogue from the masks: a *floating obstacle* is a connected component of
obstacle label whose ring (3 px wide, unknown pixels skipped: MaSTr1325 annotators leave
an unknown margin of about a pixel round each object) is mostly water and that does not
touch the frame (so shore, land and cut-off objects drop out); it is *found* when at least `cover` of its pixels are
predicted obstacle. A *false alarm* is a predicted-obstacle component of at least
`min_fp` pixels lying wholly on ground-truth water.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .data import IGNORE, OBSTACLE, SKY, WATER

AREA_BINS = (0, 64, 256, 1024, 10 ** 9)  # pixels at the working resolution


def confusion(pred: np.ndarray, gt: np.ndarray, k: int = 3) -> np.ndarray:
    ok = gt != IGNORE
    return np.bincount(k * gt[ok].astype(np.int64) + pred[ok], minlength=k * k).reshape(k, k)


def iou(conf: np.ndarray) -> np.ndarray:
    tp = np.diag(conf).astype(float)
    return tp / np.maximum(conf.sum(0) + conf.sum(1) - tp, 1)


def floating_obstacles(gt: np.ndarray, water_ring: float = 0.5, ring_px: int = 3):
    """Yield (pixel index arrays, area) of obstacle components whose ring is >= water_ring water."""
    lab, n = ndimage.label(gt == OBSTACLE)
    h, w = gt.shape
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        y0, y1 = max(sl[0].start - ring_px, 0), min(sl[0].stop + ring_px, h)
        x0, x1 = max(sl[1].start - ring_px, 0), min(sl[1].stop + ring_px, w)
        comp = lab[y0:y1, x0:x1] == i
        ring = ndimage.binary_dilation(comp, iterations=ring_px) & ~comp
        if sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == h or sl[1].stop == w:
            continue  # touches the frame: shore or a cut-off object
        ringv = gt[y0:y1, x0:x1][ring]
        ringv = ringv[ringv != IGNORE]
        if len(ringv) == 0 or np.mean(ringv == WATER) < water_ring:
            continue
        yy, xx = np.nonzero(comp)
        yield (yy + y0, xx + x0), int(comp.sum())


def obstacle_recall(pred: np.ndarray, gt: np.ndarray, cover: float = 0.5):
    """List of (area, found) for each floating obstacle in one frame."""
    return [(a, f) for a, f, _, _ in obstacle_records(pred, gt, cover)]


def obstacle_records(pred: np.ndarray, gt: np.ndarray, cover: float = 0.5):
    """(area, found, covered fraction, lowest row) per floating obstacle; the lowest row is the waterline."""
    out = []
    for idx, area in floating_obstacles(gt):
        frac = float(np.mean(pred[idx] == OBSTACLE))
        out.append((area, bool(frac >= cover), round(frac, 3), int(idx[0].max())))
    return out


def false_alarms(pred: np.ndarray, gt: np.ndarray, min_fp: int = 4) -> int:
    lab, n = ndimage.label(pred == OBSTACLE)
    if n == 0:
        return 0
    on_water = ndimage.sum(gt == WATER, lab, index=np.arange(1, n + 1))
    size = ndimage.sum(np.ones_like(gt), lab, index=np.arange(1, n + 1))
    return int(np.sum((size >= min_fp) & (on_water == size)))


def binned_recall(pairs, bins=AREA_BINS):
    """[(lo, hi, n, recall)] over area bins."""
    a = np.array([p[0] for p in pairs]) if pairs else np.zeros(0)
    f = np.array([p[1] for p in pairs]) if pairs else np.zeros(0, bool)
    out = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        sel = (a >= lo) & (a < hi)
        out.append((lo, hi, int(sel.sum()), float(f[sel].mean()) if sel.any() else float("nan")))
    return out


__all__ = ["confusion", "iou", "floating_obstacles", "obstacle_recall", "false_alarms",
           "binned_recall", "AREA_BINS", "SKY"]
