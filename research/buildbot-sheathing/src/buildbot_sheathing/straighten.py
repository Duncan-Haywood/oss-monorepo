"""Milestone 9: push a bowed joint stud onto its line instead of doubling it.

Milestone 2 found that a bowed joint stud, not sensing, caps single-2x joints: the sheet edge is
straight and the stud's face is not. Milestone 7 found the extra stud of a doubled joint costs
more than the rework it saves. A carpenter's third option is to push the stud over to the line
and nail it there; once the first sheet's joint nails hold it, the stud stays put for the second
sheet. This module gives the force that takes and the shape it leaves.

The stud bends flatwise (about its weak axis, I = 3.5 x 1.5^3 / 12 in^4) over the clear span
between the plates, which hold its ends either pinned (end-nailed; the realistic case) or fixed
(the stiff bound). Its stress-free shape is milestone 2's parabolic bow, w0(u) = 4 b u (1 - u),
with u the height fraction. A push is a displacement imposed at a point; the beam is linear, so
the force is c E I b / L^3 for a coefficient c that depends only on the points pushed.

Policies:
  mid    one push at u = 1/2, to the line through the stud's ends. Closed form: c = 48 (pinned)
         or 192 (fixed), and the shape left is b u (1 - 2u)^2 or 4 b u (1 - 2u)^2 (``residual``).
  nails  bottom up, the stud is pushed onto the line at each joint-nail height and the nail is
         driven; each driven nail then holds its point (the sheet is far stiffer in its plane than
         the stud is flatwise). The force at each step comes from the finite-element beam
         (``push_sequence``).

Units: SI unless a name says otherwise.
"""
import numpy as np

from .asbuilt import STUD_LEN
from .budget import IN

PSI = 6894.757
I_FLAT = 3.5 * IN * (1.5 * IN) ** 3 / 12          # m^4, dressed 2x4 about its weak axis
# Reference modulus of elasticity, Stud grade (psi). DF-L and Hem-Fir (WCLIB/WWPA) and S-P-F
# (NLGA) from the NDS Supplement Table 4A values as tabulated by Engineers Edge; Southern Pine
# 2x4 "No.3 and Stud" from SPIB/Southern Forest Products Association Table 1 (README, milestone 9).
E_STUD_PSI = {"DF-L": 1.4e6, "Hem-Fir": 1.2e6, "SPF": 1.2e6, "SP": 1.3e6}
COV_E = 0.25                                        # NDS Appendix F, visually graded lumber


def e_draw(rng, n, species=None):
    """Lognormal E (Pa) with each species' reference E as its mean and COV 0.25; species None
    draws the species uniformly from the four."""
    if species is None:
        mean = np.array(list(E_STUD_PSI.values()))[rng.integers(0, len(E_STUD_PSI), n)]
    else:
        mean = np.full(n, E_STUD_PSI[species])
    s2 = np.log(1 + COV_E ** 2)
    return mean * PSI * np.exp(rng.normal(-s2 / 2, np.sqrt(s2), n))


def shape(u, ends="pinned"):
    """Deflected shape of a mid-span point load, normalised to 1 at u = 1/2."""
    v = np.minimum(np.asarray(u, float), 1 - np.asarray(u, float))
    if ends == "pinned":
        return 3 * v - 4 * v ** 3
    if ends == "fixed":
        return 4 * v ** 2 * (3 - 4 * v)
    raise ValueError(ends)


def residual(u, ends="pinned"):
    """Shape left, per unit bow, after a mid push brings u = 1/2 onto the line (closed form)."""
    u = np.asarray(u, float)
    return 4 * u * (1 - u) - shape(u, ends)


def mid_coeff(ends="pinned"):
    return 48.0 if ends == "pinned" else 192.0


def force(c, E, b, L=STUD_LEN, I=I_FLAT):
    """Push force (N) for coefficient c, modulus E (Pa) and wall bow b (m)."""
    return c * E * I * np.abs(b) / L ** 3


# ---------------------------------------------------------------- finite-element beam
def _nodes(points, n_el=192):
    """Uniform grid plus the pushed points; grid nodes within 1e-6 of a point are dropped, so no
    element is degenerate."""
    p = np.asarray(points, float)
    g = np.linspace(0, 1, n_el + 1)
    if p.size:
        g = g[np.min(np.abs(g[:, None] - p[None, :]), axis=1) > 1e-6]
    return np.unique(np.concatenate([g, p, [0.0, 1.0]]))


def stiffness(x, EI=1.0, L=1.0):
    """Global stiffness of Hermite beam elements on nodes x (fractions of L); dofs (v, theta)."""
    n = len(x)
    K = np.zeros((2 * n, 2 * n))
    for i in range(n - 1):
        h = (x[i + 1] - x[i]) * L
        k = EI / h ** 3 * np.array([[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h],
                                    [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]])
        d = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3]
        K[np.ix_(d, d)] += k
    return K


def solve(K, fixed, values):
    """Displacements with dofs `fixed` prescribed to `values`; returns (u, reactions on fixed)."""
    n = K.shape[0]
    fixed = np.asarray(fixed, int)
    free = np.setdiff1d(np.arange(n), fixed)
    u = np.zeros(n)
    u[fixed] = values
    u[free] = np.linalg.solve(K[np.ix_(free, free)], -K[np.ix_(free, fixed)] @ u[fixed])
    return u, K[np.ix_(fixed, np.arange(n))] @ u


def push_sequence(points, ends="pinned", n_el=192, b=1.0, tol=0.0, mid_first=False):
    """Push a stud of bow b (w0 = 4 b u (1 - u)) toward the line at each of `points` in turn, to
    within `tol` of it (no push where it is already within tol), each point then held; with
    mid_first, a push to the line at u = 1/2 comes first. EI = L = 1, so a returned force times
    E I / L^3 is newtons when b and tol are metres. Returns (force at each step, final shape about
    the line on the node grid, nodes); with b = 1 and tol = 0 the forces are the coefficients c."""
    pts = ([0.5] if mid_first else []) + list(points)
    x = _nodes(pts, n_el)
    K = stiffness(x)
    w0 = b * 4 * x * (1 - x)
    ends_dofs = [0, 2 * (len(x) - 1)]
    if ends == "fixed":
        ends_dofs += [1, 2 * (len(x) - 1) + 1]
    elif ends != "pinned":
        raise ValueError(ends)
    held, target, c = [], [], []
    u = np.zeros(2 * len(x))
    for k, p in enumerate(pts):
        j = int(np.argmin(np.abs(x - p)))
        if 2 * j in held:                            # already pushed and held (the mid nail)
            continue
        now = w0[j] + u[2 * j]                       # where the stud is, about the line
        t = 0.0 if (mid_first and k == 0) else float(np.clip(now, -tol, tol))
        held.append(2 * j)
        target.append(t - w0[j])
        fixed = ends_dofs + held
        vals = np.concatenate([np.zeros(len(ends_dofs)), target])
        u, react = solve(K, fixed, vals)
        c.append(abs(react[-1]))
    return np.array(c), w0 + u[0::2], x


def mid_push_fe(ends="pinned", n_el=192):
    """FE check of the closed form: (c, final shape per unit bow, nodes) for a single mid push."""
    c, final, x = push_sequence([0.5], ends, n_el)
    return float(c[0]), final, x


def nails_table(points, ends="pinned", tol=0.5e-3, b_max=20e-3, n=81, n_el=96):
    """Mid-first, nail-by-nail sequence on a grid of bows b >= 0: the largest push force per
    E I / L^3 (m) and the offset left at each nail (m, shape (n, len(points))). The beam is
    symmetric in b, so for b < 0 negate the offsets; interpolate with ``np.interp``."""
    bs = np.linspace(0.0, b_max, n)
    fmax, left = [], []
    for b in bs:
        c, final, x = push_sequence(points, ends, n_el, b=b, tol=tol, mid_first=True)
        fmax.append(c.max() if len(c) else 0.0)
        left.append(final[[int(np.argmin(np.abs(x - p))) for p in points]])
    return bs, np.array(fmax), np.array(left)


def simultaneous(points, ends="pinned", n_el=192):
    """Push a unit-bow stud onto the line at all `points` at once (a straightedge held at
    several points). Returns (force at each point, per E I b / L^3; final shape; nodes)."""
    x = _nodes(points, n_el)
    K = stiffness(x)
    w0 = 4 * x * (1 - x)
    ends_dofs = [0, 2 * (len(x) - 1)]
    if ends == "fixed":
        ends_dofs += [1, 2 * (len(x) - 1) + 1]
    idx = [int(np.argmin(np.abs(x - p))) for p in points]
    fixed = ends_dofs + [2 * j for j in idx]
    vals = np.concatenate([np.zeros(len(ends_dofs)), -w0[idx]])
    u, react = solve(K, fixed, vals)
    return np.abs(react[len(ends_dofs):]), w0 + u[0::2], x


class Straightener:
    """Lookup of what a policy leaves at the joint-nail heights and the force it takes.

    policy "mid": one push at u = 1/2 (closed form); "nails": mid first, then each joint nail
    bottom up, pushed to within `tol` (FE table); "three": a simultaneous push at u = 1/6, 1/2 and
    5/6 (FE, post hoc). ``left(b)`` gives the offsets (m) at `points` for wall bows b (any shape
    array, signed); ``force(b, E)`` the largest push force (N)."""

    def __init__(self, policy, points, ends="pinned", tol=0.5e-3):
        self.policy, self.points, self.ends, self.tol = policy, np.asarray(points, float), ends, tol
        if policy == "nails":
            self.bs, self.fmax, self.tab = nails_table(self.points, ends, tol)
        elif policy == "three":
            f, final, x = simultaneous([1 / 6, 0.5, 5 / 6], ends)
            self.c = float(f.max())
            self.unit = np.interp(self.points, x, final)
        elif policy == "mid":
            self.c = mid_coeff(ends)
            self.unit = residual(self.points, ends)
        else:
            raise ValueError(policy)

    def left(self, b):
        b = np.asarray(b, float)
        if self.policy == "nails":
            a = np.clip(np.abs(b), 0, self.bs[-1])
            cols = [np.interp(a, self.bs, self.tab[:, k]) for k in range(len(self.points))]
            return np.sign(b)[..., None] * np.stack(cols, axis=-1)
        return b[..., None] * self.unit

    def force(self, b, E):
        b = np.abs(np.asarray(b, float))
        if self.policy == "nails":
            return np.interp(np.clip(b, 0, self.bs[-1]), self.bs, self.fmax) * E * I_FLAT / STUD_LEN ** 3
        return force(self.c, E, b)
