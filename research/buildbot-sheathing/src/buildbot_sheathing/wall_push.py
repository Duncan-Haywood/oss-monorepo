"""Milestone 19: milestone 17's wall as a displacement model, pushed over.

Milestones 17 and 18 (``wall_lp.py``) are rigid-plastic limit analyses: every fastener carries its full
capacity at any slip, all at once, and nothing has slack. Here the same bodies (top plate, studs, sheets;
each a small rigid motion (u, v, theta) about the global origin, as ``wall_lp``) are joined by springs:

* a sheathing nail: milestone 16's backbone (``softnail.Backbone``) along its own slip (2-D);
* a stud-to-plate joint, laterally: a 1-D backbone along the wall, ``nails`` times one end nail's;
  vertically, a stiff one-sided bearing (opening is free, milestone 17's omega = 0), and at a held-down
  stud bottom a stiff two-sided tie (milestone 17's rigid hold-down); ``joint=None`` makes every joint
  a stiff pin both ways (milestone 14's frame);
* an anchor rod at each held-down stud bottom, along the wall: no force over a gap ``rod_gap``, then a
  linear spring ``rod_k`` up to ``rod_cap`` (elastic-perfectly-plastic).

The top plate is pushed along the wall without rotating (MCASHEW2's boundary condition, as milestone 17)
to a drift D in steps; at each step the free coordinates sit at the least-energy state (damped Newton
from the last step, as milestone 16), and the racking load is dE/dD. Loading is path-independent: a spring
whose slip falls is read back down its backbone (``pushover`` counts how many sheathing nails do that).

Units: metres and newtons.
"""
import numpy as np

from .budget import HEIGHT


def _bb_parts(bb, r):
    """Load, tangent and energy of a backbone at slip magnitude r (any shape)."""
    return bb._parts(r)


class PushWall:
    """A ``wall_lp.Wall``'s bodies and nails, with springs.

    wall      a ``wall_lp.Wall`` (geometry, nail owners and members, studs, ``nails`` and ``ends``)
    mask      (n,) True where a sheathing nail holds
    sheath    ``softnail.Backbone`` of one sheathing nail
    joint     ``softnail.Backbone`` of one 16d end nail, laterally (None: stiff pins)
    rod_gap   slack before the anchor rod bears (m); rod_k its stiffness (N/m); rod_cap its cap (N)
              (rod_cap 0: no rod path, milestone 17)
    k_pen     stiffness of the bearing, ties and pins (N/m)
    """

    def __init__(self, wall, mask=None, sheath=None, joint=None, rod_gap=0.0, rod_k=0.0, rod_cap=0.0,
                 k_pen=None, use_holddowns=True):
        self.w = wall
        nq = 3 * wall.nb
        self.nq = nq
        mask = np.ones(wall.n, bool) if mask is None else np.asarray(mask, bool)
        self.sheath = sheath
        self.joint = joint
        self.rod_gap, self.rod_k, self.rod_cap = float(rod_gap), float(rod_k), float(rod_cap)
        self.k_pen = float(k_pen if k_pen is not None else 1e5 * sheath.k0())
        idx = np.flatnonzero(mask)
        self.mem = wall.member[idx]                           # member under each held nail (-1 sill, 0 top)
        self.R2 = np.stack([wall._rel(wall.owner[i], wall.member[i], *wall.xz[i]) for i in idx]) \
            if idx.size else np.zeros((0, 2, nq))
        lat, latw, bear, tie, rod = [], [], [], [], []
        for s in range(wall.studs.size):
            for zj, plate in ((0.0, -1), (HEIGHT, 0)):
                R = wall._rel(1 + s, plate, wall.studs[s], zj)
                held = plate == -1 and s in wall.ends and use_holddowns
                sign = 1.0 if plate == -1 else -1.0           # opening positive
                if joint is None:
                    tie.append(R[0])
                    tie.append(R[1])
                    continue
                lat.append(R[0])
                latw.append(wall.nails[s])
                if held:
                    tie.append(R[1])
                    if self.rod_cap > 0:
                        rod.append(R[0])
                else:
                    bear.append(sign * R[1])
        z = np.zeros((0, nq))
        self.Rlat = np.array(lat) if lat else z
        self.wlat = np.array(latw, float)
        self.Rbear = np.array(bear) if bear else z
        self.Rtie = np.array(tie) if tie else z
        self.Rrod = np.array(rod) if rod else z
        # the top plate (body 0): u is the imposed drift, theta is held at zero, v is free
        self.free = np.array([k for k in range(nq) if k not in (0, 2)])

    # ---------------------------------------------------------------- energy
    def _rod(self, d):
        r = np.abs(d)
        x = np.maximum(r - self.rod_gap, 0.0)
        k, cap = self.rod_k, self.rod_cap
        xy = cap / k
        el = x < xy
        P = np.where(el, k * x, cap)
        dP = np.where(el & (x > 0), k, 0.0)
        E = np.where(el, 0.5 * k * x * x, 0.5 * cap * xy + cap * (x - xy))
        return P, dP, E, np.sign(d)

    def state(self, q):
        """Energy, gradient (nq,) and Hessian (nq, nq) over the full coordinates."""
        nq = self.nq
        E = 0.0
        g = np.zeros(nq)
        H = np.zeros((nq, nq))
        # sheathing nails, 2-D
        if self.R2.shape[0]:
            s = self.R2 @ q                                    # (m, 2)
            r = np.linalg.norm(s, axis=1)
            P, dP, e = _bb_parts(self.sheath, r)
            small = r < 1e-12
            rs = np.where(small, 1.0, r)
            u = np.where(small[:, None], 0.0, s / rs[:, None])
            sec = np.where(small, self.sheath.k0(), P / rs)
            E += float(e.sum())
            g += np.einsum("mi,mij->j", P[:, None] * u, self.R2)
            uut = u[:, :, None] * u[:, None, :]
            Ks = dP[:, None, None] * uut + sec[:, None, None] * (np.eye(2) - uut)
            Ks = np.where(small[:, None, None], self.sheath.k0() * np.eye(2), Ks)
            H += np.einsum("mia,mij,mjb->ab", self.R2, Ks, self.R2)
        # stud-to-plate joints, laterally (1-D backbones times the nail count)
        if self.Rlat.shape[0]:
            d = self.Rlat @ q
            r = np.abs(d)
            P, dP, e = _bb_parts(self.joint, r)
            dP = np.where(r < 1e-12, self.joint.k0(), dP)
            E += float((self.wlat * e).sum())
            g += (self.wlat * P * np.sign(d)) @ self.Rlat
            H += (self.Rlat.T * (self.wlat * dP)) @ self.Rlat
        # bearing (one-sided), ties and pins (two-sided)
        kp = self.k_pen
        if self.Rbear.shape[0]:
            d = self.Rbear @ q
            c = np.minimum(d, 0.0)
            E += 0.5 * kp * float(c @ c)
            g += kp * c @ self.Rbear
            act = (d < 0).astype(float)
            H += kp * (self.Rbear.T * act) @ self.Rbear
        if self.Rtie.shape[0]:
            d = self.Rtie @ q
            E += 0.5 * kp * float(d @ d)
            g += kp * d @ self.Rtie
            H += kp * self.Rtie.T @ self.Rtie
        if self.Rrod.shape[0]:
            d = self.Rrod @ q
            P, dP, e, sg = self._rod(d)
            E += float(e.sum())
            g += (P * sg) @ self.Rrod
            H += (self.Rrod.T * dP) @ self.Rrod
        return E, g, H

    def relax(self, q, iters=80, tol=1e-7):
        """Damped Newton over the free coordinates to the nearest energy minimum."""
        f = self.free
        E, g, H = self.state(q)
        scale = self.sheath.Fp
        lam = 1e-6 * self.k_pen
        for _ in range(iters):
            gf = g[f]
            if np.abs(gf).max() <= tol * scale:
                break
            A = H[np.ix_(f, f)] + lam * np.eye(f.size)
            try:
                step = -np.linalg.solve(A, gf)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            qn = q.copy()
            qn[f] += step
            En, gn, Hn = self.state(qn)
            if En <= E + 1e-12 * abs(E) + 1e-14:
                q, E, g, H = qn, En, gn, Hn
                lam = max(lam * 0.3, 1e-9 * self.k_pen)
            else:
                lam = lam * 10 + 1e-6 * self.k_pen
        return q, g, float(np.abs(g[f]).max() / scale)

    def pushover(self, d_max=0.150, step=0.5e-3, record=False):
        """Peak racking load (N), drift at peak, the curve, and diagnostics: ``max_res`` the largest residual
        (in Fp) over the run, ``res_to_peak`` the largest up to the peak, ``unloaded`` the fraction of held nails
        whose slip fell by more than 1% of dp before the peak."""
        drifts = np.arange(1, int(round(d_max / step)) + 1) * step
        q = np.zeros(self.nq)
        curve = np.zeros(drifts.size)
        worst = 0.0
        prev = 0.0
        best, dpk, qpk = -np.inf, 0.0, q
        res_pk = 0.0
        rmax = np.zeros(self.R2.shape[0])
        unl = np.zeros(self.R2.shape[0], bool)
        unl_pk = 0.0
        for j, D in enumerate(drifts):
            if prev > 0:
                q = q * (D / prev)
            q[0], q[2] = D, 0.0
            q, g, res = self.relax(q)
            worst = max(worst, res)
            curve[j] = g[0]                                   # dE/dD
            if self.R2.shape[0]:
                r = np.linalg.norm(self.R2 @ q, axis=1)
                unl |= r < rmax - 0.01 * self.sheath.dp
                rmax = np.maximum(rmax, r)
            if curve[j] > best:
                best, dpk, qpk = curve[j], D, q.copy()
                res_pk = worst
                unl_pk = float(unl.mean()) if unl.size else 0.0
            prev = D
        out = {"peak": float(best), "drift_at_peak": float(dpk), "drifts": drifts, "curve": curve,
               "q_at_peak": qpk, "max_res": worst, "res_to_peak": res_pk, "unloaded": unl_pk, "final": float(curve[-1])}
        return out

    def work_split(self, q):
        """Energy stored by member group at state q: sheathing nails on each stud, plates; joints; rod."""
        w = self.w
        out = {}
        if self.R2.shape[0]:
            r = np.linalg.norm(self.R2 @ q, axis=1)
            e = _bb_parts(self.sheath, r)[2]
            out["sheathing"] = float(e.sum())
            out["sheathing_by_member"] = {int(k): float(e[self.mem == k].sum()) for k in np.unique(self.mem)}
        if self.Rlat.shape[0]:
            d = np.abs(self.Rlat @ q)
            out["joints"] = float((self.wlat * _bb_parts(self.joint, d)[2]).sum())
            out["joint_slip"] = d
        if self.Rrod.shape[0]:
            out["rod"] = float(self._rod(self.Rrod @ q)[2].sum())
        return out


def nds_rod_k(D_in=0.625):
    """NDS load/slip modulus for a dowel, wood-to-metal (2 x 270,000 D^1.5 lb/in), in N/m."""
    lb_per_in = 2 * 270000.0 * D_in ** 1.5
    return lb_per_in * 4.448222 / 0.0254


__all__ = ["PushWall", "nds_rod_k"]
