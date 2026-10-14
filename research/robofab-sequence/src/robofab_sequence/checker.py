"""Stylised geometric checker: straight-line insertion without collision, plus quasi-static support.

Not a physics engine. Insertion: the part moves from its final pose to infinity along one of six
axis directions; it is blocked if it would sweep through positive volume of a placed part.
Stability: every non-fixed part of a partial assembly must rest on placed parts below it, with its
centre of mass above the bounding rectangle of its support patches (a conservative-looking but
approximate rule: the bounding rectangle can exceed the true convex hull of the patches).
"""
from .product import PART_ORDER, build

DIRS = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
EPS = 1e-9


def _ov(a0, a1, b0, b1, tol=0.0):
    return min(a1 + tol, b1) - max(a0 - tol, b0) > EPS


def blocks(b, q, d, tol):
    """Does box q block box b moving from its final pose to infinity along axis direction d?

    Across the motion, boxes block if they overlap or leave a gap smaller than `tol`; exactly
    touching faces slide past each other (so a part can slide over the surface it rests on).
    """
    ax = [i for i in range(3) if d[i]][0]
    for k in range(3):
        if k == ax:
            continue
        gap = max(b[k], q[k]) - min(b[k + 3], q[k + 3])  # negative when the intervals overlap
        if not (gap < -EPS or EPS < gap < tol - EPS):
            return False
    if d[ax] > 0:
        return q[ax + 3] > b[ax] + EPS
    return q[ax] < b[ax + 3] - EPS


class Checker:
    def __init__(self, parts=None, tol=0.0, settle_gap=1.0, stability=True):
        self.parts = parts or build()
        self.names = list(PART_ORDER)
        self.n = len(self.names)
        self.tol, self.settle_gap, self.stability = tol, settle_gap, stability
        boxes = [self.parts[k] for k in self.names]
        self.boxes = boxes
        n = self.n
        # blocked[p][q] = bitmask of directions in which q blocks p
        self.blocked = [[0] * n for _ in range(n)]
        for p in range(n):
            for q in range(n):
                if p == q:
                    continue
                m = 0
                for di, d in enumerate(DIRS):
                    if any(blocks(b, c, d, tol) for b in boxes[p] for c in boxes[q]):
                        m |= 1 << di
                self.blocked[p][q] = m
        self.com = [self._com(b) for b in boxes]
        self.patch = [[self._patch(boxes[p], boxes[q]) if p != q else None for q in range(n)] for p in range(n)]
        self._stable = {}

    @staticmethod
    def _com(bxs):
        v = [(b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) for b in bxs]
        t = sum(v)
        return tuple(sum(vi * (b[k] + b[k + 3]) / 2 for vi, b in zip(v, bxs)) / t for k in range(3))

    def _patch(self, pb, qb):
        """Bounding xy rectangle of contacts where a box of q lies just below a box of p."""
        r = None
        for b in pb:
            for c in qb:
                gap = b[2] - c[5]
                if -EPS <= gap <= self.settle_gap + EPS and _ov(b[0], b[3], c[0], c[3]) and _ov(b[1], b[4], c[1], c[4]):
                    x0, x1 = max(b[0], c[0]), min(b[3], c[3])
                    y0, y1 = max(b[1], c[1]), min(b[4], c[4])
                    r = (x0, y0, x1, y1) if r is None else (min(r[0], x0), min(r[1], y0), max(r[2], x1), max(r[3], y1))
        return r

    def free_dirs(self, p, state):
        """Bitmask of directions along which p can leave the assembly `state` (a bitmask of placed parts)."""
        m = 0
        for q in range(self.n):
            if state >> q & 1 and q != p:
                m |= self.blocked[p][q]
        return 63 & ~m

    def stable(self, state):
        if not self.stability:
            return True
        if state in self._stable:
            return self._stable[state]
        ok = True
        for p in range(1, self.n):  # part 0 (base) is fixtured
            if not state >> p & 1:
                continue
            rects = [self.patch[p][q] for q in range(self.n) if q != p and state >> q & 1 and self.patch[p][q]]
            if not rects:
                ok = False
                break
            x0 = min(r[0] for r in rects); y0 = min(r[1] for r in rects)
            x1 = max(r[2] for r in rects); y1 = max(r[3] for r in rects)
            cx, cy, _ = self.com[p]
            if not (x0 - EPS <= cx <= x1 + EPS and y0 - EPS <= cy <= y1 + EPS):
                ok = False
                break
        self._stable[state] = ok
        return ok

    def final_overlaps(self):
        """Pairs of parts that overlap in positive volume in the finished product (should be none)."""
        out = []
        for p in range(self.n):
            for q in range(p + 1, self.n):
                if any(_ov(b[0], b[3], c[0], c[3]) and _ov(b[1], b[4], c[1], c[4]) and _ov(b[2], b[5], c[2], c[5])
                       for b in self.boxes[p] for c in self.boxes[q]):
                    out.append((self.names[p], self.names[q]))
        return out
