"""Do the printed parts let each joint move through its range? A mesh-interference sweep.

The simulator excludes contacts between a body and its parent (MuJoCo's default), so a joint
range that the printed parts cannot reach goes unnoticed in the twin. This sweep moves each
arm joint through its range and measures the volume shared by the two sides of the joint:
the parent body and its parent (printed parts plus servo envelopes, horn included) against
the child body and everything below it (other joints at zero). Parts are rebuilt from the
CadQuery functions and intersected as exact solids (OpenCascade booleans).

    PYTHONPATH=src python -m homebot.cad.interference         # table of free ranges per joint
"""
from __future__ import annotations

import math
from functools import lru_cache
import numpy as np

from ..layout import build_tree
from ..params import ARM_JOINTS, ARM_RANGES, DEFAULT, Robot
from ..tree import Body

TOL = 20.0  # mm^3 of shared volume ignored (faces designed to touch, bolted interfaces)


@lru_cache(maxsize=None)
def _part(name: str, robot: Robot = DEFAULT):
    from .build import catalogue

    return catalogue()[name][0](robot)


@lru_cache(maxsize=4)
def _servo(robot: Robot = DEFAULT):
    from .geom import cyl, servo_envelope

    # the horn up to its mounting face; the centre screw head sits in the child's clearance hole
    sb = robot.servo_body
    return servo_envelope(sb, clearance=0.0, horn=False, cable=False).union(cyl(10.0, 0, sb.horn_top * 1000))


def _servo_origin(robot: Robot, m) -> np.ndarray:
    sb = robot.servo_body
    return np.asarray(m.pos) - m.rot @ np.array([sb.length / 2 - sb.axis_from_end, 0.0, -sb.height / 2])


def body_solids(robot: Robot, body: Body, T: np.ndarray, out: list) -> None:
    """Append (label, solid in mm) for the printed parts and servo envelopes of ``body`` at
    pose ``T`` (4x4, metres)."""
    from .build import catalogue
    from .geom import transform

    cat = catalogue()
    for pl in body.parts:
        if pl.part not in cat:
            continue
        R = T[:3, :3] @ pl.rot
        if pl.mirror and cat[pl.part][1].mirrored:
            R = R @ np.diag([1.0, -1.0, 1.0])
        t = (T[:3, :3] @ np.asarray(pl.pos) + T[:3, 3]) * 1000.0
        out.append((f"{body.name}:{pl.part}", transform(_part(pl.part, robot), R, t)))
    for m in body.masses:
        if "servo_" not in m.name or m.rot is None:
            continue
        R = T[:3, :3] @ m.rot
        t = (T[:3, :3] @ _servo_origin(robot, m) + T[:3, 3]) * 1000.0
        out.append((f"{body.name}:{m.name}", transform(_servo(robot), R, t)))


def _rot(axis, q) -> np.ndarray:
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(q) * K + (1 - math.cos(q)) * K @ K


def _subtree(robot, body: Body, T, out):
    body_solids(robot, body, T, out)
    for ch in body.children:
        Tc = T.copy()
        Tc[:3, 3] = T[:3, :3] @ np.asarray(ch.pos) + T[:3, 3]
        _subtree(robot, ch, Tc, out)


def _is_gear(label: str) -> bool:
    part = label.split(":")[-1]
    return "gear" in part or "pinion" in part


def _meshing(a: str, b: str) -> bool:
    """Gear pairs (and the gripper pinion with a jaw's rack) are checked in 2D with both
    members turning (tests/test_cad.py), not in this sweep where the pinion stays put."""
    if _is_gear(a) and _is_gear(b):
        return True
    pa, pb = a.split(":")[-1], b.split(":")[-1]
    return {pa, pb} == {"grip_pinion", "jaw"}


def _bb_overlap(a, b) -> bool:
    A, B = a.val().BoundingBox(), b.val().BoundingBox()
    return not (A.xmax < B.xmin or B.xmax < A.xmin or A.ymax < B.ymin or B.ymax < A.ymin
                or A.zmax < B.zmin or B.zmax < A.zmin)


def overlap(robot: Robot, parent: Body, grand: Body | None, child: Body, q: float, others=None,
            detail: bool = False):
    """Shared volume (mm^3) between the parent side and the child subtree with the child's
    joint at ``q`` (metres for slides); with ``detail`` also the offending pairs."""
    a: list = []
    body_solids(robot, parent, np.eye(4), a)
    if grand is not None:  # grandparent expressed in the parent frame
        Tg = np.eye(4)
        Tg[:3, 3] = -np.asarray(parent.pos)
        body_solids(robot, grand, Tg, a)
    j = child.joints[0]
    for o in others or []:
        Tb = np.eye(4)
        Tb[:3, 3] = np.asarray(o.pos)
        if o.joints and o.joints[0].follow == j.name:  # geared to the swept joint: moves with it
            Tb[:3, 3] += q * np.asarray(o.joints[0].axis)
        body_solids(robot, o, Tb, a)
    T = np.eye(4)
    T[:3, 3] = child.pos
    if j.kind == "hinge":
        T[:3, :3] = _rot(j.axis, q)
    else:
        T[:3, 3] = np.asarray(child.pos) + q * np.asarray(j.axis)
    b: list = []
    _subtree(robot, child, T, b)
    total, pairs = 0.0, []
    for na, sa in a:
        for nb, sbd in b:
            if _meshing(na, nb):
                continue
            if not _bb_overlap(sa, sbd):
                continue
            try:
                v = sum(s.Volume() for s in sa.intersect(sbd).vals())
            except Exception:  # noqa: BLE001 - a failed boolean is reported, not hidden
                v = float("nan")
            if v > 1.0 or v != v:
                pairs.append((na, nb, v))
                total += v if v == v else 0.0
    return (total, pairs) if detail else total


def _find(tree: Body, name: str):
    for b in tree.walk():
        for ch in b.children:
            if ch.joints and ch.joints[0].name == name:
                return b, ch
    raise KeyError(name)


def _parent_of(tree: Body, body: Body):
    for b in tree.walk():
        if body in b.children:
            return b
    return None


def sweep(robot: Robot = DEFAULT, joints=None, n: int = 25, side: str = "r") -> dict:
    """For each joint: overlap volume at ``n`` angles across its range and the largest
    interference-free interval that contains the zero pose (or the home angle)."""
    tree = build_tree(robot, "arm")
    joints = joints or [j for j in ARM_JOINTS]
    out = {}
    for jn in joints:
        name = f"{side}_{jn}"
        parent, child = _find(tree, name)
        grand = _parent_of(tree, parent)
        lo, hi = ARM_RANGES[jn]
        qs = np.linspace(lo, hi, n)
        # siblings that ride on the same parent (the second gripper jaw) count as parent side
        others = [c for c in parent.children if c is not child]
        vols = [overlap(robot, parent, grand if grand is not tree else None, child, float(q), others) for q in qs]
        free = [v <= TOL for v in vols]
        k0 = int(np.argmin(np.abs(qs - min(max(0.0, lo), hi))))
        a = b = k0
        if free[k0]:
            while a > 0 and free[a - 1]:
                a -= 1
            while b < n - 1 and free[b + 1]:
                b += 1
            free_range = (float(qs[a]), float(qs[b]))
        else:
            free_range = None
        out[jn] = {"range": (lo, hi), "q": qs.tolist(), "overlap_mm3": vols, "free_range": free_range,
                   "all_free": all(free)}
    return out


def margin(robot: Robot = DEFAULT, joint: str = "elbow", side: str = "r", step: float = 0.05, limit: float = 0.6):
    """How far past each end of its range a joint can move before the parts touch (rad or m);
    ``limit`` caps the search."""
    tree = build_tree(robot, "arm")
    parent, child = _find(tree, f"{side}_{joint}")
    grand = _parent_of(tree, parent)
    others = [c for c in parent.children if c is not child]
    lo, hi = ARM_RANGES[joint]
    out = {}
    for name, q0, sgn in (("below", lo, -1.0), ("above", hi, 1.0)):
        k = 0
        while k * step < limit:
            q = q0 + sgn * (k + 1) * step
            if overlap(robot, parent, grand if grand is not tree else None, child, q, others) > TOL:
                break
            k += 1
        out[name] = k * step  # last clear increment checked
    return out


def main():
    res = sweep()
    for j, r in res.items():
        fr = r["free_range"]
        worst = max(r["overlap_mm3"])
        print(f"{j:15s} range {r['range'][0]:+.2f}..{r['range'][1]:+.2f}  "
              f"{'clear' if r['all_free'] else 'INTERFERES'}  free {fr[0]:+.2f}..{fr[1]:+.2f}" if fr else
              f"{j:15s} range {r['range'][0]:+.2f}..{r['range'][1]:+.2f}  INTERFERES AT ZERO",
              f" (worst {worst:.0f} mm^3)")
    return res


if __name__ == "__main__":
    main()
