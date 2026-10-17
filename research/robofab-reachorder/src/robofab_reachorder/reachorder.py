"""Assembly order x reach. Each free part has a pick point (tray), a place point (centre of its final
box) and a lift point whose height clears everything already assembled (plus the part itself) by
`clear` mm. So the lift heights, and hence the arm needed, depend on the order. Two-link IK is the
`robofab-reach` model (copied here); validity of an order is the `robofab-selfparts` search."""
import math
from .assembly import Model, gripper

TRAY_GAP, TRAY_COLS, TRAY_PITCH = 120.0, 3, 50.0


def reachable(r, z, shoulder_h, l1, l2):
    """Two-link IK in the (r, z) plane, either bend, no joint limits."""
    dz = z - shoulder_h
    c = (r * r + dz * dz - l1 * l1 - l2 * l2) / (2 * l1 * l2)
    return -1 - 1e-12 <= c <= 1 + 1e-12


def valid_orders(m):
    """All orders (tuples of part indices, base excluded) the selfparts model accepts."""
    out = []

    def rec(state, seq):
        if len(seq) == m.n - 1:
            out.append(tuple(seq))
            return
        for p in range(1, m.n):
            if not state >> p & 1:
                t = state | 1 << p
                if m.moves(p, state) and m.stable(t):
                    rec(t, seq + [p])
    rec(1, [])
    return out


def order_targets(m, order, clear, tray_gap=TRAY_GAP):
    """Set of (x, y, z) wrist targets for one order."""
    tops = [max(b[5] for b in bx) for bx in m.boxes]
    pts, top = set(), tops[0]
    for k, p in enumerate(order):
        bb = [min(b[i] for b in m.boxes[p]) if i < 3 else max(b[i] for b in m.boxes[p]) for i in range(6)]
        cx, cy, cz = [(bb[i] + bb[i + 3]) / 2 for i in range(3)]
        top = max(top, tops[p])
        row, col = divmod(p - 1, TRAY_COLS)
        pts.add((cx, cy, cz))
        pts.add((cx, cy, top + clear))
        pts.add((40 + tray_gap + row * TRAY_PITCH, col * TRAY_PITCH, bb[5] - (bb[5] - bb[2]) / 2))
    return frozenset(pts)


def feasible(base, l, shoulder_h, pts, ratio=1.0):
    return all(reachable(math.hypot(x - base[0], y - base[1]), z, shoulder_h, l, ratio * l) for x, y, z in pts)


def min_link(pts, shoulder_h, step=10.0, base_step=20.0, span=400.0, lo=40.0, hi=600.0):
    n = int(span / base_step)
    bases = [(i * base_step, j * base_step) for i in range(-n, n + 1) for j in range(-n, n + 1)]
    l = lo
    while l <= hi:
        if any(feasible(b, l, shoulder_h, pts) for b in bases):
            return l
        l += step
    return None
