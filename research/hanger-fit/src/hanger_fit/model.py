"""Planar drape of a garment's shoulder line and sleeve over one arm of a hanger.

The garment is a chain of nodes in the frontal plane, from the neck point (pinned on the
hanger's top surface) out along the shoulder and down the sleeve. Each segment is a stiff
spring (stretch), each interior node a rotational spring (bending), every node carries its
weight, and the hanger arm is a capsule (a thick curved bar with a rounded end) that pushes
nodes out by a penalty. The static drape is the minimum of that energy, found by L-BFGS.

A hanger "presses" a garment well if the garment hangs in the shape it has when worn: the
shoulder line at the garment's shoulder slope out to the shoulder point, then rounding over
the shoulder into a vertical sleeve. The score is the RMS distance (cm) between each
material point of the draped chain and the same point of that worn shape.

SI units inside; hanger and garment sizes are given in cm.
"""
from dataclasses import dataclass, replace
import math

import numpy as np

G = 9.81
CM = 0.01
SEG = 0.25 * CM          # node spacing
DEPTH = 0.20             # front + back fabric depth carried by the 2D strip (m), assumed
K_CONTACT = 2.0e4        # penalty stiffness per node (N/m)

# Fabric constants are assumed, order-of-magnitude values, not measurements: bending rigidity B
# in gf*cm^2/cm (the unit of the Kawabata KES-FB2 tester), stretch stiffness per width EA (N/m).
FABRICS = {
    #           B gf.cm2/cm  EA N/m  body g/side  sleeve g/cm  sleeve lump g  sleeve cm
    "tee":     dict(B=0.03, EA=150.0, body=55.0, sleeve=1.0, lump=0.0, sleeve_len=20.0),
    "shirt":   dict(B=0.10, EA=800.0, body=75.0, sleeve=0.6, lump=20.0, sleeve_len=25.0),
    "sweater": dict(B=0.30, EA=40.0, body=200.0, sleeve=1.6, lump=60.0, sleeve_len=25.0),
}
# Half shoulder width (neck centre to shoulder point) in cm: assumed round numbers spanning
# children's to men's XXL tops. The neck point sits at a third of it.
SIZES = {"child": 15.0, "wS": 18.0, "S": 21.0, "M": 22.0, "L": 23.0, "XL": 24.0, "XXL": 25.0}
SHOULDER_SLOPE = 18.0    # degrees below horizontal, assumed
SHOULDER_ROUND = 4.0     # cm, radius of the worn shape over the shoulder point, assumed


@dataclass(frozen=True)
class Garment:
    half_shoulder: float          # cm
    neck: float                   # cm, neck point's distance from the centre
    B: float                      # gf*cm^2/cm
    EA: float                     # N/m of width
    body: float                   # g per side hung from the shoulder line
    sleeve: float                 # g per cm of modelled sleeve
    lump: float                   # g of sleeve below the modelled part, hung at the end node
    sleeve_len: float             # cm of sleeve modelled
    slope: float = SHOULDER_SLOPE
    round_r: float = SHOULDER_ROUND


def garment(size="M", fabric="tee"):
    s = SIZES[size]
    return Garment(half_shoulder=s, neck=s / 3.0, **FABRICS[fabric])


@dataclass(frozen=True)
class Hanger:
    w: float          # cm, half width to the outer end of the arm
    slope: float      # degrees, arm centreline below horizontal
    bow: float        # cm, rise of the arm's mid-point above the straight line (negative sags)
    r: float          # cm, arm half-thickness = radius of the rounded end

    def centreline(self, n=48):
        """Polyline (n, 2) in metres from the hook (0, 0) to the centre of the end cap."""
        L = max(self.w - self.r, 0.5) * CM
        t = math.radians(self.slope)
        p0, p2 = np.zeros(2), np.array([L * math.cos(t), -L * math.sin(t)])
        nrm = np.array([math.sin(t), math.cos(t)])
        p1 = 0.5 * (p0 + p2) + 2.0 * self.bow * CM * nrm   # Bezier control: mid-point rises by bow
        u = np.linspace(0.0, 1.0, n)[:, None]
        return (1 - u) ** 2 * p0 + 2 * u * (1 - u) * p1 + u ** 2 * p2


# Representative stock hangers; dimensions are assumed typical shapes, not measured products.
STOCK = {
    "wire":        Hanger(w=20.5, slope=22.0, bow=0.0, r=0.15),
    "plastic":     Hanger(w=20.0, slope=20.0, bow=0.3, r=0.5),
    "wood-shaped": Hanger(w=22.5, slope=16.0, bow=0.8, r=2.0),
}


def _closest(X, P):
    """Closest points on polyline P to nodes X: (points (N,2), distances (N,))."""
    A, D = P[:-1], P[1:] - P[:-1]
    dd = (D * D).sum(1)
    t = np.clip(((X[:, None, :] - A[None]) * D[None]).sum(2) / dd[None], 0.0, 1.0)
    Q = A[None] + t[..., None] * D[None]
    d2 = ((X[:, None, :] - Q) ** 2).sum(2)
    j = d2.argmin(1)
    i = np.arange(len(X))
    return Q[i, j], np.sqrt(d2[i, j])


def _layout(g):
    """Rest arc length per node, masses (kg) and the index where the sleeve starts."""
    Ls = (g.half_shoulder - g.neck) / math.cos(math.radians(g.slope)) * CM
    L = Ls + g.sleeve_len * CM
    n = int(round(L / SEG)) + 1
    s = np.linspace(0.0, L, n)
    l0 = s[1] - s[0]
    m = np.zeros(n)
    on_sh = s <= Ls + 1e-12
    m[on_sh] += g.body / 1000.0 / on_sh.sum()
    m[~on_sh] += g.sleeve * (l0 / CM) / 1000.0
    m[-1] += g.lump / 1000.0
    return s, l0, m, Ls


def target(g, s):
    """Worn shape: material point at arc length s (m), with the neck point at the origin."""
    a = math.radians(g.slope)
    Ls = (g.half_shoulder - g.neck) / math.cos(a) * CM
    R = g.round_r * CM
    turn = math.pi / 2 - a
    tdir = np.array([math.cos(a), -math.sin(a)])
    P = Ls * tdir
    out = np.empty((len(s), 2))
    # the rounding is centred on the shoulder point: half before it, half after
    s1, s2 = Ls - R * turn / 2, Ls + R * turn / 2
    C = P - R * turn / 2 * tdir + R * np.array([-math.sin(a), -math.cos(a)])
    for k, sk in enumerate(s):
        if sk <= s1:
            out[k] = sk * tdir
        elif sk <= s2:
            phi = (sk - s1) / R          # angle turned so far
            out[k] = C + R * np.array([math.sin(a + phi), math.cos(a + phi)])
        else:
            end = C + R * np.array([math.sin(a + turn), math.cos(a + turn)])
            out[k] = end + (sk - s2) * np.array([0.0, -1.0])
    return out


def energy_grad(Y, X0, l0, m, ks, kb, P, rc):
    """Energy and gradient for free nodes Y ((n-1)*2 flat); X0 is the pinned neck node."""
    X = np.vstack([X0, Y.reshape(-1, 2)])
    gX = np.zeros_like(X)
    E = G * (m * X[:, 1]).sum()
    gX[:, 1] += G * m
    e = X[1:] - X[:-1]
    L = np.sqrt((e * e).sum(1))
    f = ks * (L - l0)
    E += 0.5 * (f * (L - l0)).sum()
    fe = (f / L)[:, None] * e
    gX[1:] += fe
    gX[:-1] -= fe
    a, b = e[:-1], e[1:]
    phi = np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(1))
    E += 0.5 * kb * (phi * phi).sum()
    da = -np.stack([-a[:, 1], a[:, 0]], 1) / (a * a).sum(1)[:, None]
    db = np.stack([-b[:, 1], b[:, 0]], 1) / (b * b).sum(1)[:, None]
    c = (kb * phi)[:, None]
    # a = X[i]-X[i-1], b = X[i+1]-X[i] for interior node i = 1..n-2
    gX[:-2] -= c * da
    gX[1:-1] += c * da - c * db
    gX[2:] += c * db
    Q, d = _closest(X, P)
    pen = np.maximum(rc - d, 0.0)
    E += 0.5 * K_CONTACT * (pen * pen).sum()
    on = pen > 0
    if on.any():
        u = (X[on] - Q[on]) / np.maximum(d[on], 1e-12)[:, None]
        gX[on] -= (K_CONTACT * pen[on])[:, None] * u
    return E, gX[1:].ravel()


def lbfgs(fg, x, iters=300, m=12, tol=1e-6):
    E, g = fg(x)
    S, Yh = [], []
    for it in range(iters):
        q = g.copy()
        al = []
        for s, y in reversed(list(zip(S, Yh))):
            rho = 1.0 / (y @ s)
            a = rho * (s @ q)
            al.append((rho, a))
            q -= a * y
        if S:
            q *= (S[-1] @ Yh[-1]) / (Yh[-1] @ Yh[-1])
        for (s, y), (rho, a) in zip(zip(S, Yh), reversed(al)):
            q += s * (a - rho * (y @ q))
        p = -q
        if p @ g >= 0:
            p, S, Yh = -g, [], []
        step = 1.0 if S else 1e-3 / max(np.abs(g).max(), 1e-12)
        while True:
            xn = x + step * p
            En, gn = fg(xn)
            if En <= E + 1e-4 * step * (p @ g) or step < 1e-14:
                break
            step *= 0.5
        s, y = xn - x, gn - g
        if s @ y > 1e-20:
            S.append(s); Yh.append(y)
            if len(S) > m:
                S.pop(0); Yh.pop(0)
        x, E, g = xn, En, gn
        if np.abs(g).max() < tol:
            break
    return x, it + 1


def neck_point(h, g):
    """Point on the hanger's top surface above x = neck (m)."""
    P = h.centreline()
    x = g.neck * CM
    xs = P[:, 0]
    if x >= xs[-1]:
        x = xs[-1]
    y = np.interp(x, xs, P[:, 1]) + h.r * CM * 1.5
    p = np.array([x, y])
    for _ in range(20):            # slide onto distance r from the centreline
        Q, d = _closest(p[None], P)
        p = Q[0] + (p - Q[0]) / d[0] * h.r * CM
    return p


def initial(h, X0, s):
    """Starting guess: lying along the arm's top surface, round the end cap, then straight down."""
    P = h.centreline(96)
    rc = h.r * CM
    d = P[1:] - P[:-1]
    nrm = np.stack([-d[:, 1], d[:, 0]], 1) / np.sqrt((d * d).sum(1))[:, None]
    nrm = np.vstack([nrm, nrm[-1:]])
    top = P + rc * nrm
    top = top[top[:, 0] > X0[0]]
    a0 = math.atan2(nrm[-1, 1], nrm[-1, 0])
    cap = P[-1] + rc * np.stack([np.cos(np.linspace(a0, 0, 24)), np.sin(np.linspace(a0, 0, 24))], 1)
    tail = cap[-1] + np.outer(np.linspace(0, 1, 50)[1:], [0.0, -(s[-1] + 0.1)])
    path = np.vstack([X0, top, cap, tail])
    seg = np.sqrt(((path[1:] - path[:-1]) ** 2).sum(1))
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    X = np.column_stack([np.interp(s, arc, path[:, 0]), np.interp(s, arc, path[:, 1])])
    X[1:] += 1e-5 * nrm[-1]
    return X


def drape(h, g, iters=300):
    """Static drape of garment g on hanger h: node positions (n, 2) in metres and arc lengths."""
    s, l0, m, _ = _layout(g)
    P = h.centreline()
    rc = h.r * CM
    X0 = neck_point(h, g)
    X = initial(h, X0, s)
    B = g.B * 9.80665e-3 * 1e-4 / 1e-2     # gf*cm^2/cm -> N*m^2/m
    kb = B * DEPTH / l0
    ks = g.EA * DEPTH / l0
    fg = lambda y: energy_grad(y, X0, l0, m, ks, kb, P, rc)
    y, it = lbfgs(fg, X[1:].ravel(), iters=iters)
    return np.vstack([X0, y.reshape(-1, 2)]), s


def score(h, g, X=None, s=None):
    """Shape error (cm RMS), sharpest bend (degrees per cm) and peak strain of the drape."""
    if X is None:
        X, s = drape(h, g)
    T = target(g, s) + X[0]
    keep = s <= s[-1] - 5 * CM if g.sleeve_len > 10 else np.ones(len(s), bool)
    err = math.sqrt(((X[keep] - T[keep]) ** 2).sum(1).mean()) / CM
    e = X[1:] - X[:-1]
    L = np.sqrt((e * e).sum(1))
    l0 = s[1] - s[0]
    a, b = e[:-1], e[1:]
    phi = np.abs(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(1)))
    # sharpest bend: the most the cloth turns within any 1 cm of its length, in degrees
    w = max(1, int(round(CM / l0)))
    crease = math.degrees(np.convolve(phi, np.ones(w), "valid").max())
    return dict(err=err, crease=crease, strain=float((L / l0 - 1).max()))


CREASE_OK = 30.0     # deg per cm the cloth may turn before it counts as a crease (worn shape: ~14)
CREASE_COST = 0.05   # cm of shape error charged per deg/cm above CREASE_OK


def objective(sc, mode="penalised"):
    """Design-loop score (lower is better): shape error, plus a crease charge unless mode == "shape"."""
    if mode == "shape":
        return sc["err"]
    return sc["err"] + CREASE_COST * max(0.0, sc["crease"] - CREASE_OK)
