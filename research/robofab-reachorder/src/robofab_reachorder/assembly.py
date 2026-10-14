# Copied from research/robofab-selfparts (same author, MIT) so this project is self-contained.
"""Stylised model: can a parallel-jaw arm assemble a printed copy of its own gripper?

Parts are unions of axis-aligned boxes (x0, y0, z0, x1, y1, z1) in millimetres; gravity is -z.
The gripper below is a toy design chosen for this study, not a real product. Motors, screws and
cables ("vitamins") are outside the model.
"""
EPS = 1e-9

DIRS = {"+x": (1, 0, 0), "-x": (-1, 0, 0), "+y": (0, 1, 0), "-y": (0, -1, 0), "+z": (0, 0, 1), "-z": (0, 0, -1)}
# Approach directions a part may be inserted along (the direction it travels from its final pose
# to infinity is the reverse of the insertion move; here a direction names the removal move).
ARMS = {
    "free": list(DIRS),                       # any removal direction (reference)
    "side": ["+z", "+x", "-x", "+y", "-y"],   # part lifted up or slid sideways; never pushed up from below
    "top": ["+z"],                            # strictly top-down insertion
}


def gripper():
    """Return ({name: boxes}, build order of names). The base is fixtured."""
    return {
        "base": [(0, 0, 0, 40, 30, 4)],
        "rail_l": [(0, 0, 4, 4, 30, 20)],
        "rail_r": [(36, 0, 4, 40, 30, 20)],
        "finger_a": [(6, 2, 4, 16, 10, 20)],
        "finger_b": [(24, 20, 4, 34, 28, 20)],
        "link": [(16, 12, 4, 24, 18, 10)],
        "cover": [(0, 0, 20, 40, 30, 24)],
    }


def ov(a0, a1, b0, b1):
    return min(a1, b1) - max(a0, b0) > EPS


def blocks(b, q, d):
    """Does box q block box b moving from its final pose to infinity along direction d?"""
    ax = [i for i in range(3) if d[i]][0]
    for k in range(3):
        if k != ax and not ov(b[k], b[k + 3], q[k], q[k + 3]):
            return False
    return q[ax + 3] > b[ax] + EPS if d[ax] > 0 else q[ax] < b[ax + 3] - EPS


def bbox(boxes):
    return tuple(min(b[k] for b in boxes) if k < 3 else max(b[k] for b in boxes) for k in range(6))


def pads(boxes, axis, pad_t, pad_frac):
    """Two jaw pads on the opposite bbox faces normal to `axis` (0=x, 1=y): thickness pad_t,
    covering the central `pad_frac` of the face in the other two axes."""
    bb = bbox(boxes)
    out = []
    for side in (0, 1):
        lo, hi = [], []
        for k in range(3):
            if k == axis:
                f = bb[k] - pad_t if side == 0 else bb[k + 3]
                lo.append(f); hi.append(f + pad_t)
            else:
                m = (bb[k] + bb[k + 3]) / 2; h = (bb[k + 3] - bb[k]) * pad_frac / 2
                lo.append(m - h); hi.append(m + h)
        out.append(tuple(lo + hi))
    return out


class Model:
    def __init__(self, arm="free", jaw_open=30.0, pad_t=4.0, pad_frac=0.5, parts=None, gravity=True):
        self.parts = parts or gripper()
        self.names = list(self.parts)
        self.n = len(self.names)
        self.allowed = [DIRS[k] for k in ARMS[arm]]
        self.jaw_open, self.pad_t, self.pad_frac, self.gravity = jaw_open, pad_t, pad_frac, gravity
        self.boxes = [self.parts[k] for k in self.names]
        self._com = [self._centre(b) for b in self.boxes]

    @staticmethod
    def _centre(bxs):
        v = [(b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) for b in bxs]
        t = sum(v)
        return tuple(sum(vi * (b[k] + b[k + 3]) / 2 for vi, b in zip(v, bxs)) / t for k in range(3))

    def placed_boxes(self, state, skip):
        return [b for q in range(self.n) if state >> q & 1 and q != skip for b in self.boxes[q]]

    def moves(self, p, state):
        """Removal directions d (names) for part p, with the grasp used, from assembly `state`.
        A move is feasible if the part is not blocked along d and some jaw pair grips it: the
        part fits the jaw opening, and the pads neither overlap nor are swept into placed parts."""
        others = self.placed_boxes(state, p)
        bb = bbox(self.boxes[p])
        out = []
        for name in ARMS_ALL:
            d = DIRS[name]
            if not any(d == a for a in self.allowed):
                continue
            if any(blocks(b, c, d) for b in self.boxes[p] for c in others):
                continue
            for axis in (0, 1):
                if bb[axis + 3] - bb[axis] > self.jaw_open + EPS:
                    continue
                pd = pads(self.boxes[p], axis, self.pad_t, self.pad_frac)
                if any(all(ov(a[j], a[j + 3], c[j], c[j + 3]) for j in range(3)) for a in pd for c in others):
                    continue
                if any(blocks(a, c, d) for a in pd for c in others):
                    continue
                out.append((name, "xy"[axis]))
                break
        return out

    def stable(self, state):
        if not self.gravity:
            return True
        for p in range(1, self.n):
            if not state >> p & 1:
                continue
            r = None
            for q in range(self.n):
                if q == p or not state >> q & 1:
                    continue
                for b in self.boxes[p]:
                    for c in self.boxes[q]:
                        gap = b[2] - c[5]
                        if -EPS <= gap <= 1.0 + EPS and ov(b[0], b[3], c[0], c[3]) and ov(b[1], b[4], c[1], c[4]):
                            x0, x1 = max(b[0], c[0]), min(b[3], c[3]); y0, y1 = max(b[1], c[1]), min(b[4], c[4])
                            r = (x0, y0, x1, y1) if r is None else (min(r[0], x0), min(r[1], y0), max(r[2], x1), max(r[3], y1))
            if r is None:
                return False
            cx, cy, _ = self._com[p]
            if not (r[0] - EPS <= cx <= r[2] + EPS and r[1] - EPS <= cy <= r[3] + EPS):
                return False
        return True

    def overlaps(self):
        res = []
        for p in range(self.n):
            for q in range(p + 1, self.n):
                if any(all(ov(b[k], b[k + 3], c[k], c[k + 3]) for k in range(3))
                       for b in self.boxes[p] for c in self.boxes[q]):
                    res.append((self.names[p], self.names[q]))
        return res


ARMS_ALL = list(DIRS)


def search(m):
    """Exhaustive DP over subsets. Return dict: orders (count of valid full orders), reach (number of
    parts in the largest reachable subassembly), stuck (parts never placeable in any reachable state),
    one (an example order or None)."""
    full = (1 << m.n) - 1
    count = {1: 1}
    parent = {1: None}
    frontier = [1]
    for _ in range(m.n - 1):
        nxt = {}
        for s in frontier:
            for p in range(1, m.n):
                if s >> p & 1:
                    continue
                t = s | 1 << p
                if m.moves(p, s) and m.stable(t):
                    nxt[t] = nxt.get(t, 0) + count[s]
                    parent.setdefault(t, (s, p))
        for t, c in nxt.items():
            count[t] = c
        frontier = list(nxt)
        if not frontier:
            break
    best = max(count, key=lambda s: (bin(s).count("1"), count[s]))
    placeable = 0
    for s in count:
        placeable |= s
    order = None
    if full in count:
        order, s = [], full
        while parent[s]:
            s, p = parent[s][0], parent[s][1]
            order.append(m.names[p])
        order = ["base"] + order[::-1]
    return {"orders": count.get(full, 0), "reach": bin(best).count("1") - 1,
            "stuck": [m.names[p] for p in range(1, m.n) if not placeable >> p & 1], "one": order}
