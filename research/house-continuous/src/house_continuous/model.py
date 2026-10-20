"""Equal-span continuous joists, 2 or 3 spans, with pattern loading and the house-spans NDS checks.

The structural solver is a small Euler-Bernoulli finite-element beam (pin supports, consistent nodal
loads), written here in pure Python. Moments and shears are recovered by statics from the support
reactions, not from the element forces, so the closed-form tests below check it independently.
Allowable stresses, size factors, loads and load cases come from `house_spans.model`.

Pattern loading: dead load acts on every span; live load acts on any subset of spans. Bending, shear
and bearing take the worst subset; live deflection takes the worst subset of live alone; total
deflection takes dead plus the worst live subset. Dry service, lateral support provided, no creep.
"""
import itertools
import math

from house_spans.model import CF_B, CR, SPECIES, Member, _loads

NEL = 16  # elements per span


def _solve(a, b):
    """Gaussian elimination with partial pivoting; a is n x n (list of lists), b a list."""
    n = len(b)
    a = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(a[r][c]))
        a[c], a[p] = a[p], a[c]
        for r in range(c + 1, n):
            f = a[r][c] / a[c][c]
            if f:
                for k in range(c, n + 1):
                    a[r][k] -= f * a[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (a[r][n] - sum(a[r][k] * x[k] for k in range(r + 1, n))) / a[r][r]
    return x


class Beam:
    """Beam on pin supports at the ends of each span. EI in lb in^2, spans in inches, w per span in lb/in."""

    def __init__(self, spans, EI, w):
        self.spans, self.EI, self.w = list(spans), EI, list(w)
        n_nodes = NEL * len(spans) + 1
        self.x = []
        for s, L in enumerate(spans):
            x0 = sum(spans[:s])
            self.x += [x0 + L * i / NEL for i in range(NEL)]
        self.x.append(sum(spans))
        nd = 2 * n_nodes
        K = [[0.0] * nd for _ in range(nd)]
        F = [0.0] * nd
        for e in range(NEL * len(spans)):
            l = self.x[e + 1] - self.x[e]
            q = self.w[e // NEL]
            k = EI / l ** 3
            ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l],
                  [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]]
            fe = [q * l / 2, q * l * l / 12, q * l / 2, -q * l * l / 12]
            dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]
            for i in range(4):
                F[dofs[i]] += fe[i]
                for j in range(4):
                    K[dofs[i]][dofs[j]] += k * ke[i][j]
        self.support_nodes = [NEL * s for s in range(len(spans) + 1)]
        fixed = {2 * nn for nn in self.support_nodes}
        free = [i for i in range(nd) if i not in fixed]
        u = [0.0] * nd
        sol = _solve([[K[i][j] for j in free] for i in free], [F[i] for i in free])
        for i, v in zip(free, sol):
            u[i] = v
        self.v = [u[2 * i] for i in range(n_nodes)]
        # reaction at a support = (K u - F) at its vertical dof, sign: upward positive
        self.R = [sum(K[2 * nn][j] * u[j] for j in range(nd)) - F[2 * nn] for nn in self.support_nodes]
        self.R = [-r for r in self.R]

    def _loads_left(self, x):
        """Total load and its moment about x from everything left of x (downward positive)."""
        tot = mom = 0.0
        x0 = 0.0
        for L, q in zip(self.spans, self.w):
            hi = min(x, x0 + L)
            if hi > x0:
                a = hi - x0
                tot += q * a
                mom += q * a * (x - (x0 + hi) / 2)
            x0 += L
        return tot, mom

    def shear(self, x, side=0):
        """Shear just left (side=-1) or right (side=+1) of x; at a non-support point either is the same."""
        s = -self._loads_left(x)[0]
        for r, nn in zip(self.R, self.support_nodes):
            if self.x[nn] < x or (self.x[nn] == x and side > 0):
                s += r
        return s

    def moment(self, x):
        tot, mom = self._loads_left(x)
        m = -mom
        for r, nn in zip(self.R, self.support_nodes):
            if self.x[nn] < x:
                m += r * (x - self.x[nn])
        return m


def _beam(spans, wD, wL, live_on, EI):
    return Beam(spans, EI, [wD + (wL if on else 0.0) for on in live_on])


def check(m, span_ft, case, n_spans=2, interior_bearing_in=3.5):
    """Demand/capacity ratios for an equal-span continuous member, as in house_spans.model.check.

    span_ft is the clear span of each span; the design span of each is that plus the bearing length.
    Interior supports (a beam or bearing wall under a lapped joist) bear over interior_bearing_in, 3.5 in
    by default (the width of a 2x4 plate or a 3.5 in beam); the end supports use m.bearing_in.
    """
    sp = SPECIES[m.species]
    L = span_ft * 12.0 + m.bearing_in
    wD, wL = _loads(m, case)
    b, d = m.b, m.d
    S, A, I = b * d * d / 6.0, b * d, b * d ** 3 / 12.0
    cos = 1.0 / math.sqrt(1.0 + (m.pitch / 12.0) ** 2)
    Cr = CR if (m.repetitive and m.plies == 1 and m.spacing_in <= 24.0) else 1.0
    Fb = sp["Fb"] * case.CD * CF_B[m.size] * Cr
    Fv = sp["Fv"] * case.CD
    EI = sp["E"] * I
    spans = [L] * n_spans
    Mmax = Vmax = Rend = Rint = 0.0
    for live_on in itertools.product((False, True), repeat=n_spans):
        bm = _beam(spans, wD, wL, live_on, EI)
        pts = [bm.x[i] for i in range(len(bm.x))]
        Mmax = max(Mmax, max(abs(bm.moment(x)) for x in pts))
        for nn in bm.support_nodes:
            xs = bm.x[nn]
            for off, side in ((d, 1), (-d, -1)):
                x = xs + off
                if 0 <= x <= bm.x[-1]:
                    Vmax = max(Vmax, abs(bm.shear(x, side)) * cos)
            i = bm.support_nodes.index(nn)
            if i in (0, n_spans):
                Rend = max(Rend, bm.R[i])
            else:
                Rint = max(Rint, bm.R[i])
    # deflection: live alone on the worst subset, and dead plus the worst live subset
    dl = dt = 0.0
    for live_on in itertools.product((False, True), repeat=n_spans):
        if any(live_on):
            dl = max(dl, max(abs(v) for v in _beam(spans, 0.0, wL, live_on, EI).v))
        dt = max(dt, max(abs(v) for v in _beam(spans, wD, wL, live_on, EI).v))
    k = 1.0 / cos ** 2
    return {
        "bending": (Mmax / S) / Fb,
        "shear": (1.5 * Vmax / A) / Fv,
        "deflection live": k * dl / (L / case.live_limit),
        "deflection total": k * dt / (L / case.total_limit),
        "bearing": max(Rend / (b * m.bearing_in), Rint / (b * interior_bearing_in)) / sp["Fc_perp"],
    }


def worst(r):
    k = max(r, key=r.get)
    return k, r[k]


def max_span(m, case, n_spans=2, hi_ft=40.0, interior_bearing_in=3.5):
    """Longest equal clear span (to 0.01 ft) per span at which every check passes, and what governs.

    Every ratio grows with span, so bisection is exact to the resolution.
    """
    if worst(check(m, 1.0, case, n_spans, interior_bearing_in))[1] > 1.0:
        return 0.0, worst(check(m, 1.0, case, n_spans, interior_bearing_in))[0]
    lo, hi = 1.0, hi_ft
    for _ in range(14):
        mid = (lo + hi) / 2
        if worst(check(m, mid, case, n_spans, interior_bearing_in))[1] <= 1.0:
            lo = mid
        else:
            hi = mid
    return math.floor(lo * 100) / 100, worst(check(m, lo + 0.01, case, n_spans, interior_bearing_in))[0]
