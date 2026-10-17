"""A stylised lined coat as polygons (my own shapes, not a real pattern; size M-ish, grain along y).
Net pieces are grown by a seam allowance with a mitred offset before nesting."""
from . import _paths  # noqa: F401
from garment_nesting.raster import Piece, polygon_area


def _arc(p0, p1, bulge, n=8):
    (x0, y0), (x1, y1) = p0, p1
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    L = (dx * dx + dy * dy) ** 0.5
    cx, cy = mx - dy / L * bulge, my + dx / L * bulge
    out = []
    for k in range(1, n):
        t = k / n
        out.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
                    (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1))
    return out


def _poly(*segs):
    pts = []
    for s in segs:
        pts += s if isinstance(s, list) else [s]
    return tuple((float(x), float(y)) for x, y in pts)


def offset_polygon(poly, d):
    """Mitred outward offset of a simple polygon by d (cm). Miter length is capped at 2d."""
    pts = []
    for q in poly:  # drop repeated vertices (zero-length edges)
        if not pts or (abs(q[0] - pts[-1][0]) > 1e-9 or abs(q[1] - pts[-1][1]) > 1e-9):
            pts.append(q)
    if len(pts) > 1 and abs(pts[0][0] - pts[-1][0]) < 1e-9 and abs(pts[0][1] - pts[-1][1]) < 1e-9:
        pts.pop()
    n = len(pts)
    a = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sgn = 1.0 if a > 0 else -1.0  # CCW positive
    lines = []
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        L = (dx * dx + dy * dy) ** 0.5
        nx, ny = sgn * dy / L, -sgn * dx / L  # outward normal
        lines.append(((x0 + nx * d, y0 + ny * d), (dx / L, dy / L), (nx, ny)))
    out = []
    for i in range(n):
        (p, u, nu), (q, v, nv) = lines[i - 1], lines[i]
        cross = u[0] * v[1] - u[1] * v[0]
        if abs(cross) < 1e-9:
            out.append((q[0], q[1]))
            continue
        t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / cross
        x, y = p[0] + t * u[0], p[1] + t * u[1]
        vx, vy = x - pts[i][0], y - pts[i][1]
        m = (vx * vx + vy * vy) ** 0.5
        if m > 2 * d * 1.0001:  # cap very sharp miters
            s = 2 * d / m
            x, y = pts[i][0] + vx * s, pts[i][1] + vy * s
        out.append((x, y))
    return tuple(out)


def _net_shell():
    back = Piece("back", _poly((0, 0), (58, 0), (58, 78), _arc((58, 78), (52, 100), -5), (40, 104),
                               _arc((40, 104), (18, 104), -4), (6, 100), _arc((6, 100), (0, 78), -5)))
    front = Piece("front", _poly((0, 0), (34, 0), (34, 80), _arc((34, 80), (28, 100), -5), (14, 104),
                                 _arc((14, 104), (0, 90), 4)))
    sleeve = Piece("sleeve", _poly((0, 0), (26, 0), (40, 58), _arc((40, 58), (20, 70), 5),
                                   _arc((20, 70), (-4, 58), 5), (0, 0)))
    collar = Piece("collar", _poly((0, 0), (60, 0), (57, 12), (3, 12)))
    flap = Piece("storm-flap", _poly((0, 0), (40, 0), (40, 16), (20, 20), (0, 16)))
    belt = Piece("belt", _poly((0, 0), (6, 0), (6, 160), (0, 160)))
    pocket = Piece("pocket", _poly((0, 0), (18, 0), (18, 20), (9, 24), (0, 20)))
    return [back, front, front, sleeve, sleeve, collar, flap, belt, pocket, pocket]


def _net_lining():
    back = Piece("lining-back", _poly((0, 0), (56, 0), (56, 74), _arc((56, 74), (50, 96), -5), (40, 100),
                                      _arc((40, 100), (18, 100), -4), (8, 96), _arc((8, 96), (0, 74), -5)))
    front = Piece("lining-front", _poly((0, 0), (30, 0), (30, 76), _arc((30, 76), (24, 96), -5), (14, 100),
                                        _arc((14, 100), (0, 86), 4)))
    sleeve = Piece("lining-sleeve", _poly((0, 0), (24, 0), (38, 54), _arc((38, 54), (19, 66), 5),
                                          _arc((19, 66), (-4, 54), 5), (0, 0)))
    return [back, front, front, sleeve, sleeve]


def _grow(pieces, allowance):
    cache = {}
    out = []
    for p in pieces:
        key = id(p)
        if key not in cache:
            cache[key] = Piece(p.name, offset_polygon(p.poly, allowance)) if allowance > 0 else p
        out.append(cache[key])
    return out


def shell_pieces(allowance=0.0):
    return _grow(_net_shell(), allowance)


def lining_pieces(allowance=0.0):
    return _grow(_net_lining(), allowance)


def net_area_m2(pieces_net):
    return sum(polygon_area(p.poly) for p in pieces_net) / 1e4
