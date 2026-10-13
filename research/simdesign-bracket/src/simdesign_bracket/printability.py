"""Printability checks on the 2D profile of the extruded bracket (FDM, assumed 0.4 mm nozzle)."""
import numpy as np
from .model import Params, build_polygon

MIN_WALL_MM = 1.2        # three 0.4 mm extrusion widths (common slicer rule of thumb, assumed)
MAX_OVERHANG_DEG = 45.0  # steeper than this from vertical needs support (rule of thumb, assumed)


def overhang_length(poly: np.ndarray, up: int = 1) -> float:
    """Length of profile edges whose outward normal points down more than the limit.

    The profile is counter-clockwise; ``up`` is the profile axis printed as vertical (default y).
    """
    total = 0.0
    lim = np.cos(np.radians(MAX_OVERHANG_DEG))
    for a, b in zip(poly, np.roll(poly, -1, axis=0)):
        d = b - a
        ln = float(np.hypot(*d))
        if ln < 1e-12:
            continue
        n = np.array([d[1], -d[0]]) / ln  # outward for CCW
        if -n[up] > lim:
            total += ln
    return total


def check_printability(p: Params) -> dict:
    poly = build_polygon(p)
    min_wall = min(p.w, p.b)
    return {
        "min_wall_mm": float(min_wall),
        "min_wall_ok": bool(min_wall >= MIN_WALL_MM),
        "overhang_mm_profile_flat": 0.0,  # extrusion axis vertical: every layer is the profile
        "overhang_mm_profile_upright": overhang_length(poly),
    }
