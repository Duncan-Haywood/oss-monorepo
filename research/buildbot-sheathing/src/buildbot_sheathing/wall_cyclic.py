"""Milestone 20: milestone 19's wall with hysteretic fasteners, under the CUREE loading history.

Milestone 19 (``wall_push.py``) pushed Weiss's wall over monotonically with path-independent springs. Weiss
tested her walls cyclically (ASTM E2126, the CUREE basic history), so here every fastener remembers its path:

* ``Saws``: the ten-parameter SAWS hysteresis of Folz and Filiatrault (2001), vectorised. Envelope (Foschi):
  E(d) = (F0 + r1 K0 d)(1 - exp(-K0 d / F0)) up to Du, then FU + r2 K0 (d - Du), never below zero. Off the
  envelope the force moves at the unloading stiffness r3 K0 and is clamped between two bounds: going up,
  U(d) = max(P+(d), min(R+(d), E(d))), going down the mirror L(d), with the pinching lines P+-(d) = +-FI + r4 K0 d
  and the reloading lines R+-(d) through (Dmax, E(Dmax)) at slope Kp = K0 (F0 / (K0 |Dmax|))^alpha, where
  Dmax = beta times the largest excursion onto the envelope on that side. Until a spring first passes DINT2
  (where the envelope meets the pinching line) it is elastic on the envelope; past DF (where the pinching line
  meets the falling branch) it carries nothing. Off the last envelope point the spring unloads and reloads on
  the r3 K0 line until its force reaches that side's pinching line. These are OpenSees ``SAWSMaterial``'s
  rules (the port of Folz's code) written as bounds; H93 checks the two agree on the CUREE history.
* a sheathing nail: an oriented spring pair (Judd and Fonseca 2005), two uncoupled ``Saws`` springs along and
  across the direction the nail first slips (set from the wall's linear solution at a small positive drift);
* a stud-to-plate joint, laterally: a ``Saws`` spring, ``nails`` times one end nail's; bearing, ties and pins as
  milestone 19 (stiff penalties, path-independent);
* an anchor rod: a gap ``rod_gap`` each side of the rod in a hole that crushes. Past the cap the hole lengthens
  on that side, so later cycles slide further before the rod bears again.

The top plate is driven along the wall without rotating through a list of drifts; at each step Newton finds the
free coordinates where the out-of-balance force vanishes, from the fastener states committed at the last step.

Units: metres and newtons.
"""
from dataclasses import dataclass
from functools import cached_property

import numpy as np

from . import wall_push as P

LBF = 4.448222
INCH = 0.0254


@dataclass(frozen=True)
class Saws:
    F0: float
    FI: float
    Du: float
    K0: float
    r1: float
    r2: float
    r3: float
    r4: float
    alpha: float
    beta: float
    gamma: float = np.inf      # milestone 21: energy capacity E_t = gamma FU Du (inf: no degradation)

    @staticmethod
    def imperial(K0, r1, r2, r3, r4, F0, FI, Du, alpha, beta):
        """Parameters as tabulated (lbf/in, lbf, in) to newtons and metres."""
        return Saws(F0 * LBF, FI * LBF, Du * INCH, K0 * LBF / INCH, r1, r2, r3, r4, alpha, beta)

    def scaled(self, force, disp):
        """The same shape with forces times ``force`` and displacements times ``disp``."""
        return Saws(self.F0 * force, self.FI * force, self.Du * disp, self.K0 * force / disp,
                    self.r1, self.r2, self.r3, self.r4, self.alpha, self.beta, self.gamma)

    def degrading(self, gamma):
        """The same spring with energy-based strength degradation (milestone 21): E_t = gamma FU Du."""
        return Saws(self.F0, self.FI, self.Du, self.K0, self.r1, self.r2, self.r3, self.r4, self.alpha, self.beta,
                    gamma)

    # ---------------------------------------------------------------- envelope
    @cached_property
    def FU(self):
        return (self.F0 + self.r1 * self.K0 * self.Du) * (1 - np.exp(-self.K0 * self.Du / self.F0))

    def env(self, x):
        """Envelope load and slope at x >= 0."""
        x = np.asarray(x, float)
        F0, K0 = self.F0, self.K0
        a = F0 + self.r1 * K0 * x
        b = 1 - np.exp(-K0 * x / F0)
        rise = x <= self.Du
        Fr = a * b
        kr = a * (K0 / F0) * (1 - b) + self.r1 * K0 * b
        Ff = self.FU + self.r2 * K0 * (x - self.Du)
        F = np.where(rise, Fr, np.maximum(Ff, 0.0))
        k = np.where(rise, kr, np.where(Ff > 0, self.r2 * K0, 0.0))
        return F, k

    def env_odd(self, d):
        F, k = self.env(np.abs(d))
        return np.sign(d) * F, k

    @cached_property
    def DINT2(self):
        """Where the envelope meets the pinching line FI + r4 K0 d (bisection, as SAWS)."""
        a = np.zeros_like(np.asarray(self.Du, float))
        b = 2.0 * np.asarray(self.Du, float)
        for _ in range(200):
            m = 0.5 * (a + b)
            hi = self.env(m)[0] - (self.FI + self.r4 * self.K0 * m) >= 0
            b = np.where(hi, m, b)
            a = np.where(hi, a, m)
        return 0.5 * (a + b)

    @cached_property
    def DF(self):
        """Where the pinching line meets the falling branch (or the branch reaches zero): no capacity beyond."""
        K0 = self.K0
        d1 = (self.FU + self.FI - self.r2 * K0 * self.Du) / (K0 * (self.r4 - self.r2))
        d2 = self.Du - self.FU / (self.r2 * K0)
        return np.minimum(d1, d2)

    @staticmethod
    def stack(parts):
        """One ``Saws`` whose parameters are arrays: ``parts`` is a list of (Saws, count)."""
        f = {}
        for name in ("F0", "FI", "Du", "K0", "r1", "r2", "r3", "r4", "alpha", "beta", "gamma"):
            f[name] = np.concatenate([np.full(n, getattr(sw, name), float) for sw, n in parts])
        return Saws(**f)

    # ---------------------------------------------------------------- hysteresis
    def init_state(self, n):
        z = np.zeros(n)
        return {"d": z.copy(), "F": z.copy(), "up": z.copy(), "um": z.copy(),
                "yielded": np.zeros(n, bool), "dead": np.zeros(n, bool), "env": np.zeros(n, int),
                "ulp": np.zeros(n, bool), "ulm": np.zeros(n, bool),
                "s": np.ones(n), "E": z.copy(), "rev": np.zeros(n, bool), "dir": z.copy()}

    def _reload(self, un, s=1.0):
        """Target (Dmax, Fmax) and stiffness Kp of the reloading line for excursions ``un`` (signed); ``s`` is the
        strength scale left by degradation (milestone 21)."""
        Dm = self.beta * un
        Fm, _ = self.env_odd(Dm)
        Fm = s * Fm
        Fm = np.where(np.abs(Dm) <= self.Du, np.clip(Fm, -s * self.FU, s * self.FU), Fm)
        DY = self.F0 / self.K0
        with np.errstate(divide="ignore"):
            Kp = np.where(np.abs(Dm) > 0, self.K0 * (DY / np.maximum(np.abs(Dm), 1e-300)) ** self.alpha, self.K0)
        return Dm, Fm, Kp

    def trial(self, d, st):
        """Force, tangent and the state to commit if this displacement is accepted."""
        d = np.asarray(d, float)
        K0 = self.K0
        dead = st["dead"] | (np.abs(d) >= self.DF)
        # milestone 21: the envelope and the pinching lines are scaled by the strength left, s (1 without
        # degradation); stiffness at unloading (r3 K0) and the reloading slopes are not
        sc = st["s"]
        Fe, ke = self.env_odd(d)
        Fe, ke = sc * Fe, sc * ke
        # bounds
        Dp, Fp, Kpp = self._reload(st["up"], sc)
        Dm, Fm, Kpm = self._reload(st["um"], sc)
        Pp = sc * (self.FI + self.r4 * K0 * d)
        Pm = sc * (-self.FI + self.r4 * K0 * d)
        Rp = Fp + Kpp * (d - Dp)
        Rm = Fm + Kpm * (d - Dm)
        # upper bound U = max(P+, min(R+, E), the unloading line from the last envelope point); its slope
        Fup, _ = self.env_odd(st["up"])
        Fup = sc * Fup
        Ul = np.where(st["ulp"] & (d <= st["up"]), np.minimum(Fup + self.r3 * K0 * (d - st["up"]), Fe), -np.inf)
        inner_u = np.minimum(Rp, Fe)
        k_inner_u = np.where(Rp < Fe, Kpp, ke)
        U = np.maximum(np.maximum(Pp, inner_u), Ul)
        kU = np.where(U == Ul, self.r3 * K0, np.where(Pp >= inner_u, sc * self.r4 * K0, k_inner_u))
        on_env_u = np.isclose(U, Fe, rtol=0, atol=1e-12 * self.FU) & (d > st["up"])
        Fum, _ = self.env_odd(st["um"])
        Fum = sc * Fum
        Ll = np.where(st["ulm"] & (d >= st["um"]), np.maximum(Fum + self.r3 * K0 * (d - st["um"]), Fe), np.inf)
        inner_l = np.maximum(Rm, Fe)
        k_inner_l = np.where(Rm > Fe, Kpm, ke)
        Lb = np.minimum(np.minimum(Pm, inner_l), Ll)
        kL = np.where(Lb == Ll, self.r3 * K0, np.where(Pm <= inner_l, sc * self.r4 * K0, k_inner_l))
        on_env_l = np.isclose(Lb, Fe, rtol=0, atol=1e-12 * self.FU) & (d < st["um"])
        Ft = st["F"] + self.r3 * K0 * (d - st["d"])
        F = np.clip(Ft, Lb, U)
        k = np.where(Ft > U, kU, np.where(Ft < Lb, kL, self.r3 * K0))
        # on the envelope and still moving away from zero: stay on it (SAWS LPATH 2 and 3)
        fwd_p = (st["env"] == 1) & (d >= st["d"]) & (d > 0)
        fwd_m = (st["env"] == -1) & (d <= st["d"]) & (d < 0)
        fwd = fwd_p | fwd_m
        F = np.where(fwd, Fe, F)
        k = np.where(fwd, ke, k)
        # elastic until first past DINT2
        elastic = ~st["yielded"] & (np.abs(d) <= self.DINT2)
        F = np.where(elastic, Fe, F)
        k = np.where(elastic, ke, k)
        F = np.where(dead, 0.0, F)
        k = np.where(dead, 0.0, k)
        # new excursions onto the envelope
        hit_u = ~elastic & ~dead & (((Ft >= U) & on_env_u) | fwd_p) & (d > 0)
        hit_l = ~elastic & ~dead & (((Ft <= Lb) & on_env_l) | fwd_m) & (d < 0)
        new = {"d": d.copy(), "F": F,
               "up": np.where(hit_u, np.maximum(st["up"], d), st["up"]),
               "um": np.where(hit_l, np.minimum(st["um"], d), st["um"]),
               "yielded": st["yielded"] | (np.abs(d) > self.DINT2), "dead": dead,
               "env": np.where(hit_u, 1, np.where(hit_l, -1, 0)),
               # still on the unloading line from that side's last envelope point (SAWS LPATH 4) until the
               # force falls to that side's pinching line
               "ulp": (st["ulp"] | hit_u) & ~(F <= Pp) & ~hit_l,
               "ulm": (st["ulm"] | hit_l) & ~(F >= Pm) & ~hit_u}
        # milestone 21: energy-based strength degradation. Work done on the spring, counted from its first
        # reversal after it has yielded (so a monotonic push is never degraded), sets s = 1 - E / E_t with
        # E_t = gamma FU Du: the c = 1 continuous form of Rahnama and Krawinkler (1993)'s rule as Ibarra, Medina
        # and Krawinkler (2005) use it. s is applied from the next step (explicit), and never rises.
        inc = d - st["d"]
        sgn = np.sign(inc)
        rev = st["rev"] | (st["yielded"] & (sgn * st["dir"] < 0))
        E = st["E"] + np.where(rev, 0.5 * (st["F"] + F) * inc, 0.0)
        Et = self.gamma * self.FU * self.Du
        with np.errstate(invalid="ignore", divide="ignore"):
            s_new = np.where(np.isfinite(Et), np.clip(1.0 - np.maximum(E, 0.0) / Et, 0.0, 1.0), 1.0)
        new.update({"E": E, "rev": rev, "dir": np.where(sgn != 0, sgn, st["dir"]),
                    "s": np.minimum(st["s"], s_new)})
        return F, k, new

    def run(self, history):
        """Force history of one spring driven through ``history`` (a 1-D array of displacements)."""
        st = self.init_state(1)
        out = np.zeros(len(history))
        for i, d in enumerate(history):
            F, _, st = self.trial(np.array([d]), st)
            out[i] = F[0]
        return out


# ---------------------------------------------------------------- loading history
def curee(delta, max_amp=3.0):
    """Peak amplitudes of the CUREE basic loading history (Krawinkler et al. 2001, CUREE W-02, Sec. 1.1), in
    order, each a full symmetric cycle; ``primary`` marks the primary cycles. Stops after the primary cycle of
    amplitude ``max_amp`` times delta and its trailing cycles."""
    amps, prim = [0.05] * 6, [False] * 6
    for a, n in ((0.075, 6), (0.1, 6), (0.2, 3), (0.3, 3), (0.4, 2), (0.7, 2), (1.0, 2)):
        amps += [a] + [0.75 * a] * n
        prim += [True] + [False] * n
    a = 1.0
    while a + 0.5 <= max_amp + 1e-9:
        a += 0.5
        amps += [a] + [0.75 * a] * 2
        prim += [True, False, False]
    return np.array(amps) * delta, np.array(prim)


def cycle_path(amps, step):
    """Drift history for symmetric cycles 0 -> +a -> -a -> 0 with steps no larger than ``step``."""
    pts = [0.0]
    for a in amps:
        for target in (a, -a, 0.0):
            start = pts[-1]
            n = max(1, int(np.ceil(abs(target - start) / step)))
            pts += list(start + (target - start) * np.arange(1, n + 1) / n)
    return np.array(pts[1:])


# ---------------------------------------------------------------- the wall
class CyclicWall:
    """Milestone 19's wall (``wall_push.PushWall`` geometry and penalties) with hysteretic fasteners.

    wall, mask      as ``PushWall``
    sheath          ``Saws`` of one sheathing nail (each nail an oriented pair)
    joint           ``Saws`` of one 16d end nail laterally (scaled by each stud's nail count)
    rod_gap, rod_k, rod_cap   the anchor rods (rod_cap 0: none)

    Every hysteretic spring (two per sheathing nail, one per joint) is one entry of a single vectorised
    ``Saws``; ``G`` maps the coordinates to the springs' displacements.
    """

    def __init__(self, wall, mask, sheath, joint, rod_gap=0.0, rod_k=0.0, rod_cap=0.0, k_pen=None):
        self.sheath, self.joint = sheath, joint
        k_pen = float(k_pen if k_pen is not None else 1e5 * sheath.K0)
        # borrow milestone 19's kinematics (the backbone objects are not used)
        pw = P.PushWall(wall, mask, _K0Only(sheath.K0), _K0Only(joint.K0), rod_gap=rod_gap, rod_k=rod_k,
                        rod_cap=rod_cap, k_pen=k_pen)
        self.pw = pw
        self.nq, self.free = pw.nq, pw.free
        self.R2, self.Rlat, self.wlat = pw.R2, pw.Rlat, pw.wlat
        self.Rbear, self.Rtie, self.Rrod = pw.Rbear, pw.Rtie, pw.Rrod
        self.kp = k_pen
        self.rod_gap, self.rod_k, self.rod_cap = float(rod_gap), float(rod_k), float(rod_cap)
        self.m = self.R2.shape[0]
        self.springs = Saws.stack([(sheath, 2 * self.m)] + [(joint.scaled(w, 1.0), 1) for w in self.wlat])
        self.Rpen = self.Rtie
        self.set_orientation(np.tile(np.array([1.0, 0.0]), (self.m, 1)))
        self.reset()

    def set_orientation(self, e):
        self.e = np.asarray(e, float)
        ep = np.stack([-self.e[:, 1], self.e[:, 0]], axis=1)
        Ga = np.einsum("mi,mij->mj", self.e, self.R2) if self.m else np.zeros((0, self.nq))
        Gb = np.einsum("mi,mij->mj", ep, self.R2) if self.m else np.zeros((0, self.nq))
        self.G = np.vstack([Ga, Gb, self.Rlat])

    def reset(self):
        self.st = self.springs.init_state(self.G.shape[0])
        nr = self.Rrod.shape[0]
        self.hole = {"lo": np.full(nr, -self.rod_gap), "hi": np.full(nr, self.rod_gap)}
        self.q = np.zeros(self.nq)

    def orient(self, D=1e-4):
        """Set each nail's pair along the slip of the linear wall (initial stiffnesses) at drift D."""
        K0 = self.sheath.K0
        q = np.zeros(self.nq)
        H = K0 * np.einsum("mia,mib->ab", self.R2, self.R2)
        H += (self.Rlat.T * (self.wlat * self.joint.K0)) @ self.Rlat
        H += self.kp * (self.Rbear.T @ self.Rbear + self.Rtie.T @ self.Rtie)
        if self.Rrod.shape[0] and self.rod_gap == 0:
            H += self.rod_k * self.Rrod.T @ self.Rrod
        f = self.free
        q[0] = D
        q[f] = -np.linalg.solve(H[np.ix_(f, f)], H[f, 0] * D)
        s = self.R2 @ q
        r = np.linalg.norm(s, axis=1)
        e = np.where(r[:, None] > 0, s / np.maximum(r, 1e-300)[:, None], np.array([1.0, 0.0]))
        self.set_orientation(e)
        self.reset()

    # ---------------------------------------------------------------- forces
    def _rod(self, d, hole):
        lo, hi = hole["lo"], hole["hi"]
        k, cap = self.rod_k, self.rod_cap
        F = np.minimum(k * np.maximum(d - hi, 0.0), cap) - np.minimum(k * np.maximum(lo - d, 0.0), cap)
        kk = np.where((d > hi) & (k * (d - hi) < cap), k, 0.0) + np.where((d < lo) & (k * (lo - d) < cap), k, 0.0)
        new = {"lo": np.where(k * (lo - d) > cap, d + cap / k, lo), "hi": np.where(k * (d - hi) > cap, d - cap / k, hi)}
        return F, kk, new

    def forces(self, q):
        """Out-of-balance force g (nq,), tangent H and the trial states."""
        G = self.G
        F, k, st = self.springs.trial(G @ q, self.st)
        g = G.T @ F
        H = (G.T * k) @ G
        trial = {"springs": st}
        kp = self.kp
        if self.Rbear.shape[0]:
            d = self.Rbear @ q
            g += kp * np.minimum(d, 0.0) @ self.Rbear
            H += kp * (self.Rbear.T * (d < 0)) @ self.Rbear
        if self.Rtie.shape[0]:
            g += kp * (self.Rtie @ q) @ self.Rtie
            H += kp * self.Rtie.T @ self.Rtie
        if self.Rrod.shape[0]:
            d = self.Rrod @ q
            Fr, kr, trial["rod"] = self._rod(d, self.hole)
            g += Fr @ self.Rrod
            H += (self.Rrod.T * kr) @ self.Rrod
        return g, H, trial

    def commit(self, trial):
        self.st = trial["springs"]
        if "rod" in trial:
            self.hole = trial["rod"]

    def solve(self, D, iters=80, tol=1e-7):
        """Equilibrium at top-plate drift D from the committed state; returns load and residual (in F0).

        Within a step every spring's force is a function of its own displacement (from the committed state), so
        the out-of-balance force is the gradient of an incremental potential. Newton steps are shifted until
        the tangent is positive definite (a descent direction) and line-searched for a minimum of that potential
        along the step (the sign of g . step), as milestone 19's least-energy search."""
        q = self.q.copy()
        q[2] = 0.0
        q[0] = D
        f = self.free
        scale = self.sheath.F0
        g, H, tr = self.forces(q)
        res = np.abs(g[f]).max()
        nf = f.size
        I = np.eye(nf)
        for _ in range(iters):
            if res <= tol * scale:
                break
            A = H[np.ix_(f, f)]
            ev = np.linalg.eigvalsh(A)[0]
            if ev <= 1e-9 * self.sheath.K0:
                A = A + (1e-6 * self.sheath.K0 - ev + 1e-3 * abs(ev)) * I
            p = np.zeros(self.nq)
            p[f] = -np.linalg.solve(A, g[f])
            gn, Hn, trn = self.forces(q + p)
            slope1 = gn @ p
            if slope1 > 0:
                # the potential's minimum along the step lies inside: bisect on g . p
                lo, hi = 0.0, 1.0
                for _ in range(30):
                    t = 0.5 * (lo + hi)
                    gt, Ht, trt = self.forces(q + t * p)
                    if gt @ p > 0:
                        hi = t
                    else:
                        lo = t
                    if hi - lo < 1e-4:
                        break
                t = lo if lo > 0 else hi
                q = q + t * p
                g, H, tr = self.forces(q)
            else:
                q, g, H, tr = q + p, gn, Hn, trn
            res = np.abs(g[f]).max()
        self.q = q
        self.commit(tr)
        return float(g[0]), float(res / scale)

    def drive(self, drifts):
        """Load at each drift, and the largest residual (in F0)."""
        loads = np.zeros(len(drifts))
        worst = 0.0
        for i, D in enumerate(drifts):
            loads[i], r = self.solve(D)
            worst = max(worst, r)
        return loads, worst


class FoschiBackbone:
    """A ``Saws`` envelope as a path-independent radial backbone for ``wall_push.PushWall`` (the H94 check)."""

    def __init__(self, saws):
        self.s = saws
        self.Fp = saws.FU
        self.dp = saws.Du

    def k0(self):
        return self.s.K0

    def _energy_rise(self, x):
        s = self.s
        a = s.K0 / s.F0
        c = s.r1 * s.K0
        ex = np.exp(-a * x)
        return s.F0 * x + 0.5 * c * x * x - (s.F0 * (1 - ex) / a + c * (1 - ex * (1 + a * x)) / a ** 2)

    def _parts(self, d):
        s = self.s
        d = np.asarray(d, float)
        P, dP = s.env(d)
        Er = self._energy_rise(np.minimum(d, s.Du))
        slope = -s.r2 * s.K0
        y = np.clip(d, s.Du, s.Du + s.FU / slope) - s.Du
        Ef = s.FU * y - 0.5 * slope * y * y
        return P, dP, Er + Ef


class _K0Only:
    """Stand-in backbone so ``PushWall`` can build its matrices (only k0 is read there)."""

    def __init__(self, k0):
        self._k0 = k0
        self.Fp = 1.0

    def k0(self):
        return self._k0


def anderson(fyb=115):
    """Anderson, Leichti, Sutt and Rosowsky (2007), Table 4: 0.113 in nails, 7/16 in OSB, DF-L (means)."""
    rows = {87: (2574, 0.050, -0.066, 4.36, 0.012, 237, 31.1, 0.424, 0.244, 1.18),
            115: (2851, 0.037, -0.069, 3.91, 0.028, 249, 32.4, 0.425, 0.265, 1.15),
            145: (2866, 0.051, -0.075, 4.43, 0.041, 261, 29.2, 0.402, 0.244, 1.13),
            241: (3099, 0.057, -0.051, 4.77, 0.064, 305, 28.7, 0.401, 0.158, 1.08)}
    return Saws.imperial(*rows[fyb])


def folz_filiatrault():
    """Folz and Filiatrault (2001)'s 8d nail in 9.5 mm OSB, as tabulated by Ghazinader (2024), Table 2."""
    return Saws(F0=751.0, FI=141.0, Du=12.5e-3, K0=0.561e6, r1=0.061, r2=-0.078, r3=1.40, r4=0.143,
                alpha=0.8, beta=1.1)


__all__ = ["Saws", "CyclicWall", "FoschiBackbone", "curee", "cycle_path", "anderson", "folz_filiatrault"]
