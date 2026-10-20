"""Parallel-jaw friction grasp of the printed parts of a toy gripper (stylised).

Parts are unions of disjoint axis-aligned boxes (x0, y0, z0, x1, y1, z1) in millimetres, as in
`robofab-selfparts` (the part list is copied from there). A part is held by two flat jaw pads that
press on opposite faces of its bounding box, normal to x or y, and lifted against gravity (-z).
Pad contact is only counted where the pad overlaps solid material, so a part whose bounding-box
face is partly empty has less contact area. Density, friction and jaw limits are assumed values.
"""
G = 9.81
DENSITY = 1240.0  # kg/m^3, PLA-like (assumed, not measured)


def gripper():
    return {
        "base": [(0, 0, 0, 40, 30, 4)],
        "rail_l": [(0, 0, 4, 4, 30, 20)],
        "rail_r": [(36, 0, 4, 40, 30, 20)],
        "finger_a": [(6, 2, 4, 16, 10, 20)],
        "finger_b": [(24, 20, 4, 34, 28, 20)],
        "link": [(16, 12, 4, 24, 18, 10)],
        "cover": [(0, 0, 20, 40, 30, 24)],
    }


def bbox(boxes):
    return tuple(min(b[k] for b in boxes) if k < 3 else max(b[k] for b in boxes) for k in range(6))


def mass_kg(boxes, density=DENSITY):
    return density * sum((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) for b in boxes) * 1e-9


def com(boxes):
    v = [(b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) for b in boxes]
    t = sum(v)
    return tuple(sum(vi * (b[k] + b[k + 3]) / 2 for vi, b in zip(v, boxes)) / t for k in range(3))


def contact_area(boxes, axis, side):
    """Area (mm^2) of solid material on the bounding-box face normal to `axis` (side 0 = low, 1 = high)."""
    bb = bbox(boxes)
    plane = bb[axis] if side == 0 else bb[axis + 3]
    o = [k for k in range(3) if k != axis]
    area = 0.0
    for b in boxes:
        if abs((b[axis] if side == 0 else b[axis + 3]) - plane) < 1e-9:
            area += (b[o[0] + 3] - b[o[0]]) * (b[o[1] + 3] - b[o[1]])
    return area


def grasp_options(boxes, jaw_open=30.0):
    """Grasp axes (0 = x, 1 = y) that fit the jaw opening and touch material on both faces."""
    bb = bbox(boxes)
    out = []
    for axis in (0, 1):
        width = bb[axis + 3] - bb[axis]
        a0, a1 = contact_area(boxes, axis, 0), contact_area(boxes, axis, 1)
        if width <= jaw_open and min(a0, a1) > 0:
            out.append({"axis": axis, "width": width, "area": min(a0, a1)})
    return out


def force_bound(boxes, mu):
    """Minimum total pad force per jaw (N) to hold the part against gravity by friction alone:
    two contacts, each carrying mu*N, so N >= m*g / (2*mu). Ignores torque about the grasp axis."""
    return mass_kg(boxes) * G / (2 * mu)
