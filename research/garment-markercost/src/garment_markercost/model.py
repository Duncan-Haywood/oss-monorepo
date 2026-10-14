"""Seam allowance, mixed sizes and marker efficiency, built on `garment-nesting` (raster polygon
nesting) and `garment-teardown` (cost chain). Pieces are my own stylised shapes (copied from
`garment-nesting`'s experiment script); nothing here is a real pattern."""
import math
from dataclasses import replace
import numpy as np
from garment_nesting.raster import Piece, polygon_area, anneal_raster, nest_raster
from garment_teardown.model import cost_breakdown, Garment, Scenario


def _signed_area(poly):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1])) / 2


def offset_polygon(poly, d, miter_limit=2.0):
    """Grow a simple polygon outward by d (cm) with mitred corners, each corner capped at
    miter_limit * d. Adequate for the gently curved stylised pieces; not a general polygon
    buffer (very concave or tiny features would need one)."""
    pts = list(poly)
    if _signed_area(pts) < 0:
        pts = pts[::-1]  # make counter-clockwise
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        def nrm(a, b):  # outward normal of a CCW edge a->b
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy) or 1.0
            return (dy / L, -dx / L)
        n1, n2 = nrm(p0, p1), nrm(p1, p2)
        bx, by = n1[0] + n2[0], n1[1] + n2[1]
        bl = math.hypot(bx, by)
        if bl < 1e-9:
            out.append((p1[0] + n1[0] * d, p1[1] + n1[1] * d)); continue
        bx, by = bx / bl, by / bl
        cos_half = max(bx * n1[0] + by * n1[1], 1e-6)
        k = min(d / cos_half, miter_limit * d)
        out.append((p1[0] + bx * k, p1[1] + by * k))
    return tuple(out)


def with_allowance(pieces, d):
    if d <= 0:
        return list(pieces)
    return [Piece(p.name, offset_polygon(p.poly, d)) for p in pieces]


def scaled(pieces, s):
    return [Piece(p.name, tuple((x * s, y * s) for x, y in p.poly)) for p in pieces]


def pattern_area_m2(pieces):
    return sum(polygon_area(p.poly) for p in pieces) / 1e4


def marker(pieces_cut, W, evals=120, seeds=(0, 1, 2), cell=2.0):
    """Best marker length (cm) over annealing seeds for the pieces to be CUT."""
    best = min(anneal_raster(pieces_cut, W, evals=evals, seed=s, cell=cell)[1] for s in seeds)
    return best


def efficiency(pattern_pieces, length_cm, W):
    """Finished-pattern area over marker area (allowance counts as cloth used, not as covered)."""
    return pattern_area_m2(pattern_pieces) / (W * length_cm / 1e4)


def fabric_cost_per_garment(g: Garment, eff, price_per_m2=None):
    """Shell fabric cost of g if its marker efficiency were `eff` (teardown's formula)."""
    g2 = replace(g, marker_efficiency=eff, **({} if price_per_m2 is None else {"shell_price_per_m2": price_per_m2}))
    return g2.fabric_used_m2() * g2.shell_price_per_m2


# --- stylised garments (from garment-nesting/experiments/run.py) ---
def _arc(p0, p1, bulge, n=8):
    (x0, y0), (x1, y1) = p0, p1
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    L = (dx * dx + dy * dy) ** 0.5
    cx, cy = mx - dy / L * bulge, my + dx / L * bulge
    return [((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
             (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1) for t in np.linspace(0, 1, n)[1:-1]] + [p1]


def _poly(*segs):
    pts = []
    for s in segs:
        pts += s if isinstance(s, list) else [s]
    return tuple((float(x), float(y)) for x, y in pts)


def shirt():
    back = Piece("back", _poly((0, 0), (54, 0), (54, 44), _arc((54, 44), (47, 70), -6), (36, 74),
                               _arc((36, 74), (18, 74), -5), (7, 70), _arc((7, 70), (0, 44), -6)))
    front = Piece("front", _poly((0, 0), (30, 0), (30, 44), _arc((30, 44), (23, 70), -6), (12, 74),
                                 _arc((12, 74), (0, 62), 4)))
    sleeve = Piece("sleeve", _poly((0, 0), (22, 0), (38, 46), _arc((38, 46), (19, 58), 5),
                                   _arc((19, 58), (-4, 46), 5), (0, 0)))
    collar = Piece("collar", _poly((0, 0), (46, 0), (44, 6), (2, 6)))
    cuff = Piece("cuff", _poly((0, 0), (24, 0), (24, 8), (0, 8)))
    pocket = Piece("pocket", _poly((0, 0), (12, 0), (12, 11), (6, 14), (0, 11)))
    return [back, front, front, sleeve, sleeve, collar, cuff, cuff, pocket]


def skirt():
    gore = Piece("gore", _poly((13, 0), (31, 0), (44, 60), (0, 60)))
    band = Piece("waistband", _poly((0, 0), (84, 0), (84, 8), (0, 8)))
    return [gore] * 4 + [band]
