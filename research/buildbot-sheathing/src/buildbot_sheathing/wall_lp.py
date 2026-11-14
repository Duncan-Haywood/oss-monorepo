"""Milestone 17: milestone 15's rigid-body limit analysis for a whole wall, built as Weiss (2017) tested it.

Milestones 14-16 modelled one 4 by 8 ft sheet with a hold-down at each of its own end studs. Weiss's
walls (MS thesis, Washington State University, 2017, Ch. 4) are 8 by 8 ft: two vertical sheets meeting
on a single middle stud, double end studs, one sill plate bolted down, a double top plate, and HTT4
hold-downs on the double end studs only. So the stud the two sheets share is held to the sill by its
two end nails and nothing else.

Bodies (each a small rigid motion (u, v, theta) about the global origin, so a point (x, z) moves
(u - theta z, v + theta x)): the sill (the ground, fixed), the top plate, each stud and each sheet.
Fasteners and joints are rigid-plastic, and the capacity is the least total dissipation over admissible
motions with the top plate's mid-point moved one unit along the wall (the kinematic theorem), solved as
a linear programme with SciPy's HiGHS:

* a sheathing nail joins its sheet to the member under it and dissipates F |slip| (a K-gon, at most
  1 - cos(pi / K) low);
* a stud-to-plate joint dissipates ``lat`` F |lateral slip| (``lat`` None: a pin); in the vertical the
  stud bears on the plate and opens against ``omega`` F per unit opening (a pin, ``lat`` None, does
  neither: milestone 14's joint); at a held-down stud bottom the hold-down is a rigid tie
  (``holddown=None``) or a rigid-plastic tie of capacity ``holddown`` F (``use_holddowns=False``: none);
* the top plate is ``"free"``, ``"norot"`` (no rotation: MCASHEW2's boundary condition in Weiss Ch. 3.2)
  or ``"slide"`` (along the wall only);
* optionally two sheets bear on each other at a shared edge (no overlap; separation is free).

Units: metres; capacities in units of one sheathing nail's capacity F per unit top displacement.
"""
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

from .budget import HEIGHT, IN
from .racking import WIDTH, layout, layout_spacing

WALL = 2 * WIDTH
# Weiss's frame: double end studs as one body (centre lines 1.5 in from each end), single studs at 16 in
WEISS_STUDS = np.array([1.5, 16, 32, 48, 64, 80, 94.5]) * IN
WEISS_NAILS = np.array([4, 2, 2, 2, 2, 2, 4])          # 16d end nails at each end of each stud


def _disp(x, z):
    return np.array([[1.0, 0.0, -z], [0.0, 1.0, x]])


class Wall:
    """Sheets on a row of studs between a fixed sill and a top plate.

    sheets  list of (xz (n, 2), frame (n,)) in ``racking.layout`` form, already placed in wall
            coordinates; ``frame`` 0 marks a sill nail, HEIGHT a top-plate nail, anything else a stud
            nail (on the nearest stud)
    studs   stud centre lines (m)
    nails   16d end nails at each end of each stud (multiplies the per-nail lateral ratio and omega)
    ends    stud indices whose bottoms carry hold-downs
    width   the wall length (the top plate is pushed at width / 2)
    """

    def __init__(self, sheets, studs=WEISS_STUDS, nails=WEISS_NAILS, ends=None, width=WALL, K=64):
        self.studs = np.asarray(studs, float)
        self.nails = np.asarray(nails, float)
        S = self.studs.size
        self.ends = (0, S - 1) if ends is None else tuple(ends)
        self.width = width
        self.K = K
        self.ns = len(sheets)
        self.nb = 1 + S + self.ns                          # top plate, studs, sheets
        xs, mem, own = [], [], []
        for k, (xz, fr) in enumerate(sheets):
            xz = np.asarray(xz, float)
            fr = np.asarray(fr, float)
            for i in range(xz.shape[0]):
                if abs(fr[i]) < 1e-12:
                    m = -1
                elif abs(fr[i] - HEIGHT) < 1e-12:
                    m = 0
                else:
                    m = 1 + int(np.argmin(np.abs(self.studs - xz[i, 0])))
                xs.append(xz[i])
                mem.append(m)
                own.append(1 + S + k)
        self.xz = np.array(xs)
        self.member = np.array(mem)
        self.owner = np.array(own)
        self.n = self.xz.shape[0]

    def _rel(self, a, b, x, z):
        R = np.zeros((2, 3 * self.nb))
        D = _disp(x, z)
        if a >= 0:
            R[:, 3 * a:3 * a + 3] += D
        if b >= 0:
            R[:, 3 * b:3 * b + 3] -= D
        return R

    def capacity(self, mask=None, lat=None, omega=0.0, holddown=None, use_holddowns=True, top="norot",
                 bear=(), hd_shear=0.0, return_motion=False):
        """Least dissipation (units of F) for a unit top-plate displacement.

        mask     (n,) True where a sheathing nail holds
        lat      lateral capacity of one 16d end nail over F (times ``nails`` per joint); None: pins
        omega    opening capacity of one end nail over F (times ``nails``), per unit opening
        holddown None: rigid ties at ``ends``; a number: tie capacity over F
        use_holddowns  False: the end studs' bottoms are plain joints
        top      "free", "norot" or "slide"
        bear     pairs (sheet a, sheet b, x) where sheet a's right edge meets sheet b's left edge at x:
                 they may separate along the wall but not overlap (checked at the bottom and top)
        hd_shear milestone 18: extra lateral capacity (over F) at each held-down stud bottom, the hold-down's
                 anchor rod bearing in the sill; 0 is milestone 17's model, ``np.inf`` stops the slide
        """
        mask = np.ones(self.n, bool) if mask is None else np.asarray(mask, bool)
        nq = 3 * self.nb
        K = self.K
        phis = 2 * np.pi * np.arange(K) / K
        dirs = np.stack([np.cos(phis), np.sin(phis)], axis=1)
        cost = [0.0] * nq
        nv = nq
        ub_r, ub_c, ub_v, b_ub = [], [], [], []
        r = 0
        eq = []                                             # (row over q, {var: coef}, rhs)

        def add_ub_block(blk, extra):
            nonlocal r
            nz = np.nonzero(blk)
            ub_r.extend((r + nz[0]).tolist())
            ub_c.extend(nz[1].tolist())
            ub_v.extend(blk[nz].tolist())
            for rr in range(blk.shape[0]):
                for var, cf in extra.items():
                    ub_r.append(r + rr)
                    ub_c.append(var)
                    ub_v.append(cf)
            b_ub.extend([0.0] * blk.shape[0])
            r += blk.shape[0]

        for i in np.flatnonzero(mask):
            R = self._rel(self.owner[i], self.member[i], *self.xz[i])
            add_ub_block(dirs @ R, {nv: -1.0})
            cost.append(1.0)
            nv += 1
        S = self.studs.size
        for s in range(S):
            body = 1 + s
            for zj, plate in ((0.0, -1), (HEIGHT, 0)):
                R = self._rel(body, plate, self.studs[s], zj)
                held = plate == -1 and s in self.ends and use_holddowns
                shear = hd_shear if held else 0.0
                if lat is None or np.isinf(shear):
                    eq.append((R[0], {}, 0.0))
                else:
                    eq.append((R[0], {nv: -1.0, nv + 1: 1.0}, 0.0))
                    cost += [lat * self.nails[s] + shear] * 2
                    nv += 2
                sign = 1.0 if plate == -1 else -1.0
                if lat is None or (held and holddown is None):   # a pin, or a rigid tie
                    eq.append((R[1], {}, 0.0))
                    continue
                c = omega * self.nails[s] + (holddown if held else 0.0)
                eq.append((sign * R[1], {nv: -1.0}, 0.0))
                cost.append(c)
                nv += 1
        for a, b, x in bear:
            for zz in (0.0, HEIGHT):
                R = self._rel(1 + S + b, 1 + S + a, x, zz)   # b minus a along the wall >= 0
                add_ub_block(-R[0:1], {})
        R = self._rel(0, -1, self.width / 2, HEIGHT)
        eq.append((R[0], {}, 1.0))
        rows = {"norot": (2,), "slide": (1, 2), "free": ()}[top]
        for k in rows:
            row = np.zeros(nq)
            row[k] = 1.0
            eq.append((row, {}, 0.0))
        Aub = coo_matrix((ub_v, (ub_r, ub_c)), shape=(r, nv)).tocsr()
        Aeq = np.zeros((len(eq), nv))
        beq = np.zeros(len(eq))
        for k, (row, ex, rhs) in enumerate(eq):
            Aeq[k, :nq] = row
            for var, cf in ex.items():
                Aeq[k, var] = cf
            beq[k] = rhs
        bounds = [(None, None)] * nq + [(0, None)] * (nv - nq)
        res = linprog(np.array(cost), A_ub=Aub, b_ub=np.array(b_ub), A_eq=Aeq, b_eq=beq, bounds=bounds,
                      method="highs")
        if res.status != 0:
            raise RuntimeError(res.message)
        if return_motion:
            return float(res.fun), res.x[:nq].reshape(self.nb, 3), res.x
        return float(res.fun)

    def dissipation(self, xvars, mask=None, lat=None):
        """Split a solved dissipation into sheathing nails per sheet and stud-to-plate joints (lat only)."""
        mask = np.ones(self.n, bool) if mask is None else np.asarray(mask, bool)
        nq = 3 * self.nb
        idx = np.flatnonzero(mask)
        t = xvars[nq:nq + idx.size]
        per = {k: float(t[self.owner[idx] == 1 + self.studs.size + k].sum()) for k in range(self.ns)}
        return per


def weiss_sheets(edge_in=6.0):
    """Two sheets in ``racking.layout`` form at ``edge_in`` inch edges and 12 in field, left at x 0-48 in,
    right at 48-96 in. 6 in is milestone 14's layout exactly."""
    xz, fr = layout() if abs(edge_in - 6.0) < 1e-9 else layout_spacing(edge_in)
    right = xz.copy()
    right[:, 0] += WIDTH
    return [(xz, fr), (right, fr.copy())]


def weiss_wall(edge_in=6.0, **kw):
    return Wall(weiss_sheets(edge_in), **kw)


def decay_mask(xz, z_cut=12 * IN, inclusive=False, edges_only=False, x_field=None):
    """True where a nail is kept after Weiss's simulated decay (every nail below ``z_cut`` omitted;
    ``inclusive`` also omits nails at z_cut; ``edges_only`` keeps field nails, whose x is in ``x_field``)."""
    z = xz[:, 1]
    gone = (z <= z_cut + 1e-9) if inclusive else (z < z_cut - 1e-9)
    if edges_only:
        field = np.isin(np.round(xz[:, 0] / IN, 3), np.round(np.asarray(x_field) / IN, 3))
        gone &= ~field
    return ~gone


__all__ = ["Wall", "WEISS_STUDS", "WEISS_NAILS", "WALL", "weiss_sheets", "weiss_wall", "decay_mask"]
