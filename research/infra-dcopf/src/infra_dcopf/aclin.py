"""AC-informed linearisation of the OPF at an AC operating point (PYPOWER cases).

At a point (a dispatch run through an AC power flow with fixed generator voltage setpoints),
measure by finite differences of the AC power flow, one generator at a time with the slack
generator compensating:
  a_k   = d P_slack / d P_k        (so 1 + a_k is the marginal loss factor of generator k);
  H_jk  = d |S_j| / d P_k          (apparent flow at the from and to end of every rated branch).
The linear model around the point is then
  P_s = P_s0 + sum_k a_k (P_k - P_k0),     |S| = |S|_0 + H (P - P_0) <= rating,
which carries the point's losses, reactive flows and voltage profile as offsets (a "hot-start"
linearisation; it is exact at the point and first order away from it). A QP on the case's own
quadratic costs gives the next dispatch.

Voltages are held at the given generator setpoints throughout, the same convention as the AC check
in experiments/run_pglib.py, so the voltage and reactive limits are checked, not optimised.
"""
import copy

import numpy as np
from scipy.sparse import csr_matrix
from pypower.api import ppoption, runpf
from pypower.idx_brch import ANGMAX, ANGMIN, BR_STATUS, F_BUS, PF, PT, QF, QT, RATE_A, T_BUS
from pypower.idx_bus import BUS_TYPE, REF, VA, VM
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PG, PMAX, PMIN, VG
from pypower.qps_pips import qps_pips

PFOPT = ppoption(VERBOSE=0, OUT_ALL=0, ENFORCE_Q_LIMS=0, PF_MAX_IT=30)


def with_dispatch(ppc, pg, vg):
    """A copy of ppc with generator P set to pg and voltage setpoints vg."""
    p = copy.deepcopy(ppc)
    p["gen"][:, PG] = pg
    p["gen"][:, VG] = vg
    return p


def run_point(ppc, pg, vg, warm=None):
    """AC power flow of a dispatch. warm: a previous result whose bus voltages start Newton."""
    p = with_dispatch(ppc, pg, vg)
    if warm is not None:
        p["bus"][:, VM] = warm["bus"][:, VM]
        p["bus"][:, VA] = warm["bus"][:, VA]
    r, ok = runpf(p, PFOPT)
    return r if ok else None


def slack_gen(ppc):
    """Index of the generator PYPOWER uses as the slack: the first in-service one at a reference bus."""
    g, bus = ppc["gen"], ppc["bus"]
    ref = set(bus[bus[:, BUS_TYPE] == REF, 0].astype(int))
    for i in range(g.shape[0]):
        if g[i, GEN_STATUS] > 0 and int(g[i, GEN_BUS]) in ref:
            return i
    raise ValueError("no in-service generator at a reference bus")


def end_flows(res):
    """Apparent flow at the from end and the to end of every branch (MVA), stacked."""
    br = res["branch"]
    return np.concatenate([np.hypot(br[:, PF], br[:, QF]), np.hypot(br[:, PT], br[:, QT])])


def angle_limited(ppc):
    """Indices of in-service branches with a voltage-angle difference limit tighter than +-360 deg
    (MATPOWER's convention: 0 or +-360 means unlimited)."""
    br = ppc["branch"]
    lo, hi = br[:, ANGMIN], br[:, ANGMAX]
    on = br[:, BR_STATUS] > 0
    return np.where(on & (((lo > -360) & (lo != 0)) | ((hi < 360) & (hi != 0))))[0]


def angle_diffs(res, idx):
    """theta_from - theta_to in degrees for the branches idx of a power-flow result."""
    pos = {int(b): i for i, b in enumerate(res["bus"][:, 0])}
    br = res["branch"][idx]
    f = np.array([pos[int(b)] for b in br[:, F_BUS]], dtype=int)
    t = np.array([pos[int(b)] for b in br[:, T_BUS]], dtype=int)
    va = res["bus"][:, VA]
    return va[f] - va[t]


def linearise(ppc, pg0, vg, delta=1.0, warm=None, angles=False):
    """Finite-difference sensitivities at the dispatch pg0. Returns a dict or None if the base PF fails.
    angles: also the sensitivities G of the limited branches' angle differences (degrees per MW),
    taken from the same power flows (lin["G"], lin["d0"], lin["aidx"])."""
    base = run_point(ppc, pg0, vg, warm)
    if base is None:
        return None
    s = slack_gen(ppc)
    live = ppc["gen"][:, GEN_STATUS] > 0
    cols = [k for k in range(len(pg0)) if live[k] and k != s]
    pg_base = base["gen"][:, PG].copy()  # slack output as solved
    s0 = end_flows(base)
    a = np.zeros(len(pg0))
    H = np.zeros((len(s0), len(pg0)))
    aidx = angle_limited(ppc) if angles else np.zeros(0, dtype=int)
    d0 = angle_diffs(base, aidx)
    G = np.zeros((len(aidx), len(pg0)))
    for k in cols:
        pk = pg_base.copy()
        # step inward from whichever bound is nearer so the probe stays inside the unit's range
        step = delta if pk[k] + delta <= ppc["gen"][k, PMAX] + 1e-9 else -delta
        pk[k] += step
        r = run_point(ppc, pk, vg, base)
        if r is None:
            return None
        a[k] = (r["gen"][s, PG] - pg_base[s]) / step
        H[:, k] = (end_flows(r) - s0) / step
        if len(aidx):
            G[:, k] = (angle_diffs(r, aidx) - d0) / step
    out = {"base": base, "pg0": pg_base, "s0": s0, "a": a, "H": H, "slack": s, "cols": cols}
    if angles:
        out.update(G=G, d0=d0, aidx=aidx)
    return out


def quad_costs(ppc):
    """(c2, c1) per generator for polynomial (model 2) costs up to quadratic."""
    gc = ppc["gencost"]
    if np.any(gc[:, 0] != 2) or np.any(gc[:, 3] > 3):
        raise ValueError("only polynomial costs up to quadratic are supported")
    n = gc[:, 3].astype(int)
    c2 = np.where(n == 3, gc[:, 4], 0.0)
    c1 = np.where(n == 3, gc[:, 5], np.where(n == 2, gc[:, 4], 0.0))
    return c2, c1


def solve_linear(ppc, lin, margin=1.0, trust=None, elastic=None, tol=1e-6):
    """QP on the linear model: min sum c2 P^2 + c1 P subject to the linearised balance, flow rows
    |S| <= margin * rating and unit limits (intersected with |P - P0| <= trust if given). A row
    already above its rating at the point by less than tol (the AC check's own 1 ppm threshold, e.g.
    a solver's 1 + 1e-9) may stay at its present level, so it alone does not make the model infeasible. elastic: a penalty in $/MVA-h; each flow row then gets a slack s >= 0 priced
    at it (an l1 penalty, so the QP is always feasible and the overload is driven to zero when the
    model allows). Returns (pg, ok)."""
    g = ppc["gen"]
    ng = g.shape[0]
    live = g[:, GEN_STATUS] > 0
    c2, c1 = quad_costs(ppc)
    Hq = np.diag(2.0 * np.where(live, c2, 0.0)) + 1e-8 * np.eye(ng)  # tiny ridge for linear-cost units
    c = np.where(live, c1, 0.0)
    s, a, pg0 = lin["slack"], lin["a"], lin["pg0"]
    # balance: P_s - sum_k a_k P_k = P_s0 - sum_k a_k P_k0
    row = -a.copy()
    row[s] = 1.0
    rhs = pg0[s] - a @ pg0
    br = ppc["branch"]
    rate = np.concatenate([br[:, RATE_A], br[:, RATE_A]])
    on = np.concatenate([br[:, BR_STATUS], br[:, BR_STATUS]]) > 0
    keep = on & (rate > 0)
    Hf = lin["H"][keep]
    s0 = lin["s0"][keep]
    cap = np.maximum(margin * rate[keep], np.minimum(s0, rate[keep] * (1.0 + tol)))
    uf = cap - s0 + Hf @ pg0
    if "G" in lin and len(lin["aidx"]):
        # angle rows, one-sided each way: G x <= dmax - d0 + G P0 and -G x <= -(dmin - d0 + G P0);
        # a row already outside its limit by less than tol (relative) may stay where it is
        G, d0 = lin["G"], lin["d0"]
        dmin, dmax = br[lin["aidx"], ANGMIN], br[lin["aidx"], ANGMAX]
        umax = np.maximum(dmax, np.minimum(d0, dmax + tol * np.abs(dmax)))
        umin = np.minimum(dmin, np.maximum(d0, dmin - tol * np.abs(dmin)))
        Hf = np.vstack([Hf, G, -G])
        uf = np.concatenate([uf, umax - d0 + G @ pg0, -(umin - d0 + G @ pg0)])
    A = np.vstack([row[None, :], Hf])
    lo = np.concatenate([[rhs], np.full(Hf.shape[0], -np.inf)])
    up = np.concatenate([[rhs], uf])
    xmin = np.where(live, g[:, PMIN], 0.0)
    xmax = np.where(live, g[:, PMAX], 0.0)
    if trust is not None:
        xmin = np.maximum(xmin, pg0 - trust)
        xmax = np.minimum(xmax, pg0 + trust)
        xmin = np.minimum(xmin, xmax)
    x0 = np.clip(pg0, xmin, xmax)
    if elastic is not None:
        m = Hf.shape[0]
        Hq = np.block([[Hq, np.zeros((ng, m))], [np.zeros((m, ng)), 1e-8 * np.eye(m)]])
        c = np.concatenate([c, np.full(m, float(elastic))])
        A = np.block([[A[:1], np.zeros((1, m))], [Hf, -np.eye(m)]])
        xmin, xmax = np.concatenate([xmin, np.zeros(m)]), np.concatenate([xmax, np.full(m, np.inf)])
        x0 = np.concatenate([x0, np.maximum(Hf @ x0 - uf, 0.0)])
    res = qps_pips(csr_matrix(Hq), c, csr_matrix(A), lo, up, xmin, xmax, x0, {"verbose": 0, "max_it": 200})
    x, _f, eflag = res[0], res[1], res[2]
    ok = eflag > 0
    return np.asarray(x).ravel()[:ng], bool(ok)
