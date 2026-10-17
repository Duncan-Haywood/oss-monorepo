"""Toy-gripper part list and grasp options, copied from `research/robofab-grasp` (MIT) so this project is self-contained."""
from .model import bbox


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


def contact_area(boxes, axis, side):
    bb = bbox(boxes)
    plane = bb[axis] if side == 0 else bb[axis + 3]
    o = [k for k in range(3) if k != axis]
    return sum((b[o[0] + 3] - b[o[0]]) * (b[o[1] + 3] - b[o[1]]) for b in boxes
               if abs((b[axis] if side == 0 else b[axis + 3]) - plane) < 1e-9)


def grasp_options(boxes, jaw_open=30.0):
    bb = bbox(boxes)
    out = []
    for axis in (0, 1):
        width = bb[axis + 3] - bb[axis]
        if width <= jaw_open and min(contact_area(boxes, axis, 0), contact_area(boxes, axis, 1)) > 0:
            out.append({"axis": axis, "width": width})
    return out
