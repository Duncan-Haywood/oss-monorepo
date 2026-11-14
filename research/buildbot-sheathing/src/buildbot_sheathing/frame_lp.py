"""Milestone 15: a rigid-body limit analysis of a framed sheet, with framing joints of finite strength.

Milestone 14 (``racking.py``) pinned the studs to the plates with joints of unlimited strength, so the
frame could only rack as a parallelogram (a stud nail at height z moves gamma * z). Here every member
is its own rigid body and the joints between them are rigid-plastic too:

* bodies: the bottom plate (fixed, the ground), the top plate, each stud and the sheet, each with a
  small rigid motion (u, v, theta) about the global origin, so a point (x, z) moves
  (u - theta * z, v + theta * x);
* a sheathing nail joins the sheet to the member under it and dissipates F * |slip| (the Euclidean
  norm, bounded below by a K-sided polygon: at most 1 - cos(pi / K) low);
* a stud-to-plate joint at (x_s, 0) or (x_s, H) dissipates rho * F * |lateral slip|; in the vertical
  the stud bears on the plate (no closing) and opens against a withdrawal capacity omega * F;
  ``rho=None`` makes the joint rigid (milestone 14's pin), and a hold-down fixes an end stud's
  bottom vertically;
* the top plate's mid-point is moved one unit along the wall.

The racking capacity (in units of F, per unit top displacement) is the least total dissipation over
admissible motions, an upper bound by the kinematic theorem, solved as a linear programme (HiGHS).
For rigid joints it reduces to milestone 14's ``work / HEIGHT``.

Nail order matches ``racking.layout``: left joint edge, right joint edge, field stud 1, field stud 2,
bottom plate, top plate. Units: metres; capacities in units of one sheathing nail's capacity F.
"""
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

from .budget import EDGE, HEIGHT, IN, SPACING
from .racking import WIDTH

STUDS = np.array([0.0, SPACING, 2 * SPACING, WIDTH])   # stud centre lines under one sheet


# ------------------------------------------------------------------ NDS yield-limit ratio
def fe_dowel(G):
    """Dowel bearing strength (psi) for D < 1/4 in, NDS: 16,600 G^1.84 (any grain direction)."""
    return 16600.0 * G ** 1.84


def fyb(D):
    """Nail bending yield strength (psi) by diameter (in), NDS Appendix I, Table I1."""
    if D <= 0.099:
        return 130000.0
    if D <= 0.142:
        return 100000.0
    if D <= 0.177:
        return 90000.0
    return 80000.0


def z_single_shear(D, ls, lm, Fes, Fem, Fyb, Rd=2.2):
    """NDS yield-limit equations, single shear, D <= 0.17 in (R_d = 2.2 for every mode).

    Returns (Z lb, governing mode)."""
    Re, Rt = Fem / Fes, lm / ls
    k1 = (np.sqrt(Re + 2 * Re ** 2 * (1 + Rt + Rt ** 2) + Rt ** 2 * Re ** 3) - Re * (1 + Rt)) / (1 + Re)
    k2 = -1 + np.sqrt(2 * (1 + Re) + 2 * Fyb * (1 + 2 * Re) * D ** 2 / (3 * Fem * lm ** 2))
    k3 = -1 + np.sqrt(2 * (1 + Re) / Re + 2 * Fyb * (2 + Re) * D ** 2 / (3 * Fem * ls ** 2))
    modes = {
        "Im": D * lm * Fem / Rd,
        "Is": D * ls * Fes / Rd,
        "II": k1 * D * ls * Fes / Rd,
        "IIIm": k2 * D * lm * Fem / ((1 + 2 * Re) * Rd),
        "IIIs": k3 * D * ls * Fem / ((2 + Re) * Rd),
        "IV": D ** 2 / Rd * np.sqrt(2 * Fem * Fyb / (3 * (1 + Re))),
    }
    m = min(modes, key=modes.get)
    return float(modes[m]), m


def nds_rho(G_frame=0.50, G_panel=0.50, n_end=2, c_eg=0.67):
    """Lateral capacity of a stud-to-plate joint (``n_end`` 16d common end nails through a 1.5 in
    plate into the stud's end grain, end-grain factor ``c_eg``) over one 8d common sheathing nail
    through 15/32 in OSB into the framing. A design-level ratio from the NDS yield model."""
    f_frame, f_panel = fe_dowel(G_frame), fe_dowel(G_panel)
    D8, L8, t_osb = 0.131, 2.5, 15 / 32
    z8, m8 = z_single_shear(D8, t_osb, L8 - t_osb, f_panel, f_frame, fyb(D8))
    D16, L16, t_plate = 0.162, 3.5, 1.5
    z16, m16 = z_single_shear(D16, t_plate, L16 - t_plate, f_frame, f_frame, fyb(D16))
    return {"z8": z8, "mode8": m8, "z16": z16, "mode16": m16, "joint": n_end * c_eg * z16,
            "rho": n_end * c_eg * z16 / z8}


# ------------------------------------------------------------------ the LP
def _disp_rows(x, z):
    """Rows mapping a body's (u, v, theta) to the displacement (dx, dz) of point (x, z)."""
    return np.array([[1.0, 0.0, -z], [0.0, 1.0, x]])


class Frame:
    """One sheet on its studs and plates. ``xz`` (n, 2) nail positions in ``racking.layout`` order."""

    def __init__(self, xz, frame=None, studs=STUDS, K=64):
        """``frame`` is ``racking.layout``'s frame displacement: 0 marks a bottom-plate nail, HEIGHT a
        top-plate nail, anything else a stud nail (milestone 14's convention: the corner nails at
        3/8 in from the sheet's ends are joint-stud nails). Without it, nails within 3/4 in of the
        sheet's bottom or top edge go to the plates."""
        self.xz = np.asarray(xz, float)
        self.studs = np.asarray(studs, float)
        self.K = K
        n = self.xz.shape[0]
        S = self.studs.size
        # body index: -1 ground (bottom plate), 0 top plate, 1..S studs, S + 1 sheet
        self.sheet = S + 1
        self.nb = S + 2
        member = np.empty(n, int)
        z = self.xz[:, 1]
        fr = None if frame is None else np.asarray(frame, float)
        for i in range(n):
            if fr is not None:
                if abs(fr[i]) < 1e-12:
                    member[i] = -1
                elif abs(fr[i] - HEIGHT) < 1e-12:
                    member[i] = 0
                else:
                    member[i] = 1 + int(np.argmin(np.abs(self.studs - self.xz[i, 0])))
                continue
            if z[i] < 2 * EDGE:
                member[i] = -1
            elif z[i] > HEIGHT - 2 * EDGE:
                member[i] = 0
            else:
                member[i] = 1 + int(np.argmin(np.abs(self.studs - self.xz[i, 0])))
        self.member = member

    def _rel(self, a, b, x, z):
        """Coefficient rows (2, 3 * nb) of the displacement of body a minus body b at (x, z)."""
        R = np.zeros((2, 3 * self.nb))
        D = _disp_rows(x, z)
        if a >= 0:
            R[:, 3 * a:3 * a + 3] += D
        if b >= 0:
            R[:, 3 * b:3 * b + 3] -= D
        return R

    def capacity(self, mask=None, rho=None, omega=0.0, holddown=True, rho_top=None, top_slide_only=False,
                 return_motion=False):
        """Least dissipation (units of F) for a unit top-plate displacement.

        mask       (n,) True where a sheathing nail holds (default all)
        rho        lateral capacity of each stud-to-plate joint over F; None: rigid joints
        omega      withdrawal (opening) capacity of each joint over F
        holddown   fix the two end studs' bottoms vertically
        rho_top    the top joints' rho if different (default rho)
        top_slide_only  the top plate only translates along the wall (no lift, no tilt), as a
                   continuous double top plate over a wall line, loaded from above, would hold it
        """
        n = self.xz.shape[0]
        mask = np.ones(n, bool) if mask is None else np.asarray(mask, bool)
        rho_top = rho if rho_top is None else rho_top
        nq = 3 * self.nb
        idx_t = np.flatnonzero(mask)
        nt = idx_t.size
        rows, cols, vals = [], [], []
        b_ub = []
        A_eq, b_eq = [], []
        r = 0
        phis = 2 * np.pi * np.arange(self.K) / self.K
        dirs = np.stack([np.cos(phis), np.sin(phis)], axis=1)
        # sheathing nails: dirs @ slip - t_i <= 0
        for j, i in enumerate(idx_t):
            R = self._rel(self.sheet, self.member[i], *self.xz[i])
            blk = dirs @ R                                              # (K, nq)
            nz = np.nonzero(blk)
            rows.extend((r + nz[0]).tolist())
            cols.extend(nz[1].tolist())
            vals.extend(blk[nz].tolist())
            rows.extend(range(r, r + self.K))
            cols.extend([nq + j] * self.K)
            vals.extend([-1.0] * self.K)
            b_ub.extend([0.0] * self.K)
            r += self.K
        cost = [0.0] * nq + [1.0] * nt
        nv = nq + nt
        S = self.studs.size
        for s in range(S):
            body = 1 + s
            for zj, plate, rr in ((0.0, -1, rho), (HEIGHT, 0, rho_top)):
                R = self._rel(body, plate, self.studs[s], zj)          # stud minus plate
                end = s in (0, S - 1)
                if rr is None:
                    A_eq.append(np.pad(R[0], (0, 0)))
                    b_eq.append(0.0)
                    A_eq.append(R[1])
                    b_eq.append(0.0)
                    continue
                # lateral: R[0] q - a + b = 0, cost rr (a + b)
                row = np.zeros(nq)
                row[:] = R[0]
                A_eq.append(("lat", row, nv))
                b_eq.append(0.0)
                cost += [rr, rr]
                nv += 2
                # vertical opening o >= 0: stud bottom lifts (sign +1) or stud top drops (sign -1)
                sign = 1.0 if plate == -1 else -1.0
                if plate == -1 and end and holddown:
                    A_eq.append(R[1])
                    b_eq.append(0.0)
                else:
                    A_eq.append(("open", sign * R[1], nv))
                    b_eq.append(0.0)
                    cost += [omega]
                    nv += 1
        # unit top-plate displacement at its mid-point
        R = self._rel(0, -1, WIDTH / 2, HEIGHT)
        A_eq.append(R[0])
        b_eq.append(1.0)
        if top_slide_only:
            for k in (1, 2):
                row = np.zeros(nq)
                row[k] = 1.0
                A_eq.append(row)
                b_eq.append(0.0)
        # assemble
        Aub = coo_matrix((vals, (rows, cols)), shape=(r, nv)).tocsr()
        Aeq = np.zeros((len(A_eq), nv))
        for k, e in enumerate(A_eq):
            if isinstance(e, tuple):
                kind, row, at = e
                Aeq[k, :nq] = row
                if kind == "lat":
                    Aeq[k, at] = -1.0
                    Aeq[k, at + 1] = 1.0
                else:
                    Aeq[k, at] = -1.0
            else:
                Aeq[k, :nq] = e
        bounds = [(None, None)] * nq + [(0, None)] * (nv - nq)
        res = linprog(np.array(cost), A_ub=Aub, b_ub=np.array(b_ub), A_eq=Aeq, b_eq=np.array(b_eq),
                      bounds=bounds, method="highs")
        if res.status != 0:
            raise RuntimeError(res.message)
        if return_motion:
            return float(res.fun), res.x[:nq].reshape(self.nb, 3)
        return float(res.fun)

    def relative(self, masks, ref=None, **kw):
        """Capacity of each mask relative to ``ref`` (default: the intact sheet with the same joints),
        solving each distinct pattern once."""
        masks = np.atleast_2d(np.asarray(masks, bool))
        pats, inv = np.unique(masks, axis=0, return_inverse=True)
        if ref is None:
            ref = self.capacity(None, **kw)
        vals = np.array([self.capacity(p, **kw) for p in pats])
        return vals[inv.ravel()] / ref


def stud_mechanism(motion):
    """Describe a solved motion: each stud's bottom slide and rotation, the sheet's motion."""
    return {"top": motion[0].tolist(), "studs": motion[1:-1].tolist(), "sheet": motion[-1].tolist()}


__all__ = ["Frame", "nds_rho", "z_single_shear", "fe_dowel", "fyb", "STUDS", "IN"]
