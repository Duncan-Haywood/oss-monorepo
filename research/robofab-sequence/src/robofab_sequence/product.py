"""The product: a printed gearbox frame with two geared shafts.

Parts are unions of axis-aligned boxes (x0, y0, z0, x1, y1, z1) in millimetres. Gravity is -z.
Dimensions are chosen for this study; they are not taken from a real design.
"""

CLEAR_HOLE = 1.0    # wall-hole clearance per side (mm)
CLEAR_GEAR = 0.5    # gear-bore clearance per side (mm)
CLEAR_COLLAR = 0.5  # collar-bore clearance per side (mm)


def ring(cx, cz, y0, y1, outer, hole):
    """Square ring around the y axis centred at (cx, cz): four boxes."""
    o, h = outer / 2.0, hole / 2.0
    return [
        (cx - o, y0, cz - o, cx + o, y1, cz - h),
        (cx - o, y0, cz + h, cx + o, y1, cz + o),
        (cx - o, y0, cz - h, cx - h, y1, cz + h),
        (cx + h, y0, cz - h, cx + o, y1, cz + h),
    ]


def wall(y0, y1, centres, cz, hole):
    """Wall x in [0,60], z in [4,34], with square through-holes (along y) at the given x centres."""
    h = hole / 2.0
    boxes = [(0, y0, 4, 60, y1, cz - h), (0, y0, cz + h, 60, y1, 34)]
    xs = [0.0]
    for c in centres:
        boxes.append((xs[-1], y0, cz - h, c - h, y1, cz + h))
        xs.append(c + h)
    boxes.append((xs[-1], y0, cz - h, 60, y1, cz + h))
    return boxes


def build(shaft=6.0, tol_fit=None):
    """Return {name: boxes}. The base is fixtured (first part)."""
    cz = 19.0
    cxs = (15.0, 45.0)
    hole_w = shaft + 2 * CLEAR_HOLE
    parts = {}
    base = [(0, 0, 0, 60, 40, 4)]
    for cx in cxs:
        base.append((cx - 5, 10, 4, cx + 5, 18, 11))  # boss under each gear
    parts["base"] = base
    parts["wall_front"] = wall(0, 4, cxs, cz, hole_w)
    parts["wall_back"] = wall(36, 40, cxs, cz, hole_w)
    for i, cx in enumerate(cxs, 1):
        parts[f"gear{i}"] = ring(cx, cz, 10, 18, 16, shaft + 2 * CLEAR_GEAR)
        parts[f"shaft{i}"] = [(cx - shaft / 2, -6, cz - shaft / 2, cx + shaft / 2, 46, cz + shaft / 2)]
        parts[f"collar_f{i}"] = ring(cx, cz, -3, 0, 12, shaft + 2 * CLEAR_COLLAR)
        parts[f"collar_b{i}"] = ring(cx, cz, 40, 43, 12, shaft + 2 * CLEAR_COLLAR)
    parts["lid"] = [(0, 0, 34, 60, 40, 38)]
    return parts


PART_ORDER = ["base", "wall_front", "wall_back", "gear1", "gear2", "shaft1", "shaft2",
              "collar_f1", "collar_f2", "collar_b1", "collar_b2", "lid"]
