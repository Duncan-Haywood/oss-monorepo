"""Joint linearisation in active power and generator voltage setpoints (milestone 3b of research/grid-linopf).

`aclin.py` linearises the AC power flow in P only, with the generator voltage setpoints held at a
schedule. Milestone 3 showed the schedule carries much of the result: at the case file's 1.0 pu the
P-only repair is clean on 2 of 11 API and 2 of 11 SAD cases. Here the setpoints are decision
variables. Variables x = [P (one per unit), V (one per bus with a live unit; units at a bus share
it)]. Finite differences of PYPOWER's AC power flow at the point (1 MW per non-slack unit, the slack
compensating; DV pu per voltage setpoint, stepped inward from the nearer bound) give the
sensitivities of:
  the slack unit's P            (balance row),
  |S| at both ends of each branch (thermal rows),
  limited branches' angle differences (angle rows),
  every non-generator bus's voltage magnitude (voltage rows),
  every live unit's Q            (reactive rows).
A QP on the case's own costs over the linear model gives the next point. Rows are written one-sided
(A x <= u). An elastic variant gives every row an l1 slack priced per row unit (voltage rows scaled
by VSCALE so 0.01 pu weighs like 1 MVA).
"""
import copy

import numpy as np
from scipy.sparse import csr_matrix
from pypower.api import ppoption, runpf
from pypower.idx_brch import ANGMAX, ANGMIN, BR_STATUS, RATE_A
from pypower.idx_bus import BUS_I, VA, VM, VMAX, VMIN
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PG, PMAX, PMIN, QG, QMAX, QMIN, VG
from pypower.qps_pips import qps_pips
from pypower.totcost import totcost

from .aclin import angle_diffs, angle_limited, end_flows, quad_costs, slack_gen

PFOPT = ppoption(VERBOSE=0, OUT_ALL=0, ENFORCE_Q_LIMS=0, PF_MAX_IT=30)
DV = 0.002          # pu, finite-difference step on a voltage setpoint
VSCALE = 100.0      # voltage rows (pu) multiplied by this before pricing the elastic slack
TOL = {"load": 1e-6, "slack": 1e-3, "ang": 1e-3, "v": 1e-4, "q": 1e-3}  # the checks' thresholds


class Layout:
    """Index bookkeeping: live units, the voltage-controlled buses and the PQ buses."""

    def __init__(self, ppc):
        g, bus = ppc["gen"], ppc["bus"]
        self.ng = g.shape[0]
        self.live = g[:, GEN_STATUS] > 0
        self.slack = slack_gen(ppc)
        self.pos = {int(b): i for i, b in enumerate(bus[:, BUS_I])}
        gb = [int(b) for b in g[self.live, GEN_BUS]]
        self.vbus = sorted(set(gb), key=gb.index)  # bus numbers with a live unit
        self.nv = len(self.vbus)
        self.vcol = {b: j for j, b in enumerate(self.vbus)}
        self.gen_v = np.array([self.vcol.get(int(b), -1) for b in g[:, GEN_BUS]])  # unit -> V index
        vset = set(self.vbus)
        self.pq = np.array([i for i, b in enumerate(bus[:, BUS_I]) if int(b) not in vset], dtype=int)
        self.vrow = np.array([self.pos[b] for b in self.vbus], dtype=int)  # bus rows of the V variables

    def vg_of(self, v):
        """Per-unit VG column from the per-bus setpoints (units off service keep 1.0)."""
        return np.where(self.gen_v >= 0, v[np.maximum(self.gen_v, 0)], 1.0)

    def v_of(self, vg):
        """Per-bus setpoints from a per-unit VG column (first live unit at each bus)."""
        v = np.ones(self.nv)
        for k in range(self.ng - 1, -1, -1):
            if self.live[k]:
                v[self.gen_v[k]] = vg[k]
        return v


def run_point(ppc, pg, vg, warm=None):
    p = copy.deepcopy(ppc)
    p["gen"][:, PG] = pg
    p["gen"][:, VG] = vg
    if warm is not None:
        p["bus"][:, VM] = warm["bus"][:, VM]
        p["bus"][:, VA] = warm["bus"][:, VA]
        # warm VM at generator buses would override nothing (PV buses take VG), so this is safe
    r, ok = runpf(p, PFOPT)
    return r if ok else None


def measure(ppc, res, lay, aidx):
    """The quantities the linear model tracks, from a power-flow result, as one vector."""
    return np.concatenate([[res["gen"][lay.slack, PG]], end_flows(res), angle_diffs(res, aidx),
                           res["bus"][lay.pq, VM], res["gen"][:, QG]])


def linearise(ppc, pg0, v0, lay=None, warm=None):
    """Sensitivities of measure() to x = [P, V] at (pg0, v0). Returns a dict or None if a PF fails."""
    lay = lay or Layout(ppc)
    aidx = angle_limited(ppc)
    base = run_point(ppc, pg0, lay.vg_of(v0), warm)
    if base is None:
        return None
    pgb = base["gen"][:, PG].copy()
    m0 = measure(ppc, base, lay, aidx)
    J = np.zeros((len(m0), lay.ng + lay.nv))
    g = ppc["gen"]
    for k in range(lay.ng):
        if not lay.live[k] or k == lay.slack:
            continue
        pk = pgb.copy()
        step = 1.0 if pk[k] + 1.0 <= g[k, PMAX] + 1e-9 else -1.0
        pk[k] += step
        r = run_point(ppc, pk, lay.vg_of(v0), base)
        if r is None:
            return None
        J[:, k] = (measure(ppc, r, lay, aidx) - m0) / step
    vmax = ppc["bus"][lay.vrow, VMAX]
    for j in range(lay.nv):
        vj = v0.copy()
        step = DV if vj[j] + DV <= vmax[j] + 1e-9 else -DV
        vj[j] += step
        r = run_point(ppc, pgb, lay.vg_of(vj), base)
        if r is None:
            return None
        J[:, lay.ng + j] = (measure(ppc, r, lay, aidx) - m0) / step
    return {"base": base, "pg0": pgb, "v0": v0.copy(), "m0": m0, "J": J, "aidx": aidx, "lay": lay}


def rows(ppc, lin, margin=None):
    """One-sided linear rows A x <= u, the row kind per row, and the balance row (a_eq x = b_eq).
    margin: None (bounds as given) or a dict like MARGIN: each bound pulled inward by that amount
    (thermal as a fraction of rating), never past the bound range's midpoint."""
    mg = margin or {}
    lay, J, m0, aidx = lin["lay"], lin["J"], lin["m0"], lin["aidx"]
    x0 = np.concatenate([lin["pg0"], lin["v0"]])
    br, bus, g = ppc["branch"], ppc["bus"], ppc["gen"]
    nbr = br.shape[0]
    i = 0
    a_eq = -J[i].copy()
    a_eq[lay.slack] += 1.0  # P_s - dPs/dx x = P_s0 - dPs/dx x0
    b_eq = m0[i] - J[i] @ x0
    i += 1
    A, u, kind = [], [], []

    def add(Jr, mr, lo, hi, tag, scale=1.0):
        lo, hi = shrink(lo, hi, mg.get(tag, 0.0))
        # rows already outside a bound at the point by less than the check's tolerance may stay there
        t = TOL[tag]
        hi_eff = np.maximum(hi, np.minimum(mr, hi + t))
        lo_eff = np.minimum(lo, np.maximum(mr, lo - t))
        base = mr - Jr @ x0
        for sgn, bnd, ok in ((1.0, hi_eff, np.isfinite(hi)), (-1.0, lo_eff, np.isfinite(lo))):
            if ok.any():
                A.append(sgn * scale * Jr[ok])
                u.append(sgn * scale * (bnd[ok] - base[ok]))
                kind.extend([tag] * int(ok.sum()))

    rate = np.concatenate([br[:, RATE_A], br[:, RATE_A]])
    on = np.concatenate([br[:, BR_STATUS], br[:, BR_STATUS]]) > 0
    keep = on & (rate > 0)
    Jf, mf = J[i:i + 2 * nbr][keep], m0[i:i + 2 * nbr][keep]
    rk = rate[keep] * (1.0 - mg.get("load", 0.0))
    # thermal tolerance is relative (1 ppm of loading), as in the AC check
    hi = np.maximum(rk, np.minimum(mf, rk * (1.0 + TOL["load"])))
    A.append(Jf)
    u.append(hi - (mf - Jf @ x0))
    kind.extend(["load"] * int(keep.sum()))
    i += 2 * nbr
    na = len(aidx)
    if na:
        add(J[i:i + na], m0[i:i + na], br[aidx, ANGMIN], br[aidx, ANGMAX], "ang")
    i += na
    npq = len(lay.pq)
    add(J[i:i + npq], m0[i:i + npq], bus[lay.pq, VMIN], bus[lay.pq, VMAX], "v", VSCALE)
    i += npq
    lv = lay.live
    Jq, mq = J[i:i + lay.ng][lv], m0[i:i + lay.ng][lv]
    add(Jq, mq, g[lv, QMIN], g[lv, QMAX], "q")
    return np.vstack(A), np.concatenate(u), kind, a_eq, b_eq


def solve(ppc, lin, ptrust=None, vtrust=None, elastic=None, margin=None):
    """QP over x = [P, V]. Returns (pg, v, ok)."""
    mg = margin or {}
    lay = lin["lay"]
    g, bus = ppc["gen"], ppc["bus"]
    ng, nv = lay.ng, lay.nv
    A, u, _kind, a_eq, b_eq = rows(ppc, lin, margin)
    c2, c1 = quad_costs(ppc)
    H = np.zeros((ng + nv, ng + nv))
    H[:ng, :ng] = np.diag(2.0 * np.where(lay.live, c2, 0.0))
    H += 1e-8 * np.eye(ng + nv)
    c = np.concatenate([np.where(lay.live, c1, 0.0), np.zeros(nv)])
    pmin = np.where(lay.live, g[:, PMIN], 0.0)
    pmax = np.where(lay.live, g[:, PMAX], 0.0)
    vmin, vmax = shrink(bus[lay.vrow, VMIN], bus[lay.vrow, VMAX], mg.get("v", 0.0))
    s = lay.slack
    lo_s, hi_s = shrink(pmin[s:s + 1], pmax[s:s + 1], mg.get("slack", 0.0))
    pmin[s], pmax[s] = lo_s[0], hi_s[0]
    pg0, v0 = lin["pg0"], lin["v0"]
    if ptrust is not None:
        pmin, pmax = np.maximum(pmin, pg0 - ptrust), np.minimum(pmax, pg0 + ptrust)
        pmin = np.minimum(pmin, pmax)
    if vtrust is not None:
        vmin, vmax = np.maximum(vmin, v0 - vtrust), np.minimum(vmax, v0 + vtrust)
        vmin = np.minimum(vmin, vmax)
    xmin, xmax = np.concatenate([pmin, vmin]), np.concatenate([pmax, vmax])
    x0 = np.clip(np.concatenate([pg0, v0]), xmin, xmax)
    Aeq = a_eq[None, :]
    if elastic is None:
        AA = np.vstack([Aeq, A])
        lo = np.concatenate([[b_eq], np.full(A.shape[0], -np.inf)])
        up = np.concatenate([[b_eq], u])
    else:
        m = A.shape[0]
        n = ng + nv
        H = np.block([[H, np.zeros((n, m))], [np.zeros((m, n)), 1e-8 * np.eye(m)]])
        c = np.concatenate([c, np.full(m, float(elastic))])
        AA = np.block([[Aeq, np.zeros((1, m))], [A, -np.eye(m)]])
        lo = np.concatenate([[b_eq], np.full(m, -np.inf)])
        up = np.concatenate([[b_eq], u])
        xmin, xmax = np.concatenate([xmin, np.zeros(m)]), np.concatenate([xmax, np.full(m, np.inf)])
        x0 = np.concatenate([x0, np.maximum(A @ x0 - u, 0.0)])
    res = qps_pips(csr_matrix(H), c, csr_matrix(AA), lo, up, xmin, xmax, x0, {"verbose": 0, "max_it": 200})
    x = np.asarray(res[0]).ravel()
    return x[:ng], x[ng:ng + nv], bool(res[2] > 0)


def shrink(lo, hi, m):
    """Pull finite bounds inward by m, never past their midpoint."""
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    if not m:
        return lo, hi
    both = np.isfinite(lo) & np.isfinite(hi)
    half = np.where(both, 0.5 * (hi - lo), np.inf)
    d = np.minimum(m, np.maximum(half, 0.0))
    return np.where(np.isfinite(lo), lo + d, lo), np.where(np.isfinite(hi), hi - d, hi)


def check(ppc, pg, vg):
    """Full AC check of (pg, vg): counts and worst excesses of every limit class, and AC cost."""
    r = run_point(ppc, pg, vg)
    if r is None:
        return None
    br, bus, g = r["branch"], r["bus"], r["gen"]
    rate = ppc["branch"][:, RATE_A]
    on = (ppc["branch"][:, BR_STATUS] > 0) & (rate > 0)
    sf = end_flows(r)
    nbr = br.shape[0]
    load = np.maximum(sf[:nbr], sf[nbr:])[on] / rate[on]
    live = ppc["gen"][:, GEN_STATUS] > 0
    s = slack_gen(ppc)
    ps = g[s, PG]
    slack_out = float(max(ps - ppc["gen"][s, PMAX], 0.0) + max(ppc["gen"][s, PMIN] - ps, 0.0))
    aidx = angle_limited(ppc)
    d = angle_diffs(r, aidx)
    aexc = np.maximum(d - ppc["branch"][aidx, ANGMAX], ppc["branch"][aidx, ANGMIN] - d) if len(aidx) else np.zeros(0)
    vexc = np.maximum(bus[:, VM] - bus[:, VMAX], bus[:, VMIN] - bus[:, VM])
    qexc = np.where(live, np.maximum(g[:, QG] - g[:, QMAX], g[:, QMIN] - g[:, QG]), -np.inf)
    out = {
        "n_over": int((load > 1.0 + TOL["load"]).sum()), "max_load": float(load.max()),
        "slack_out_mw": slack_out,
        "n_ang": int((aexc > TOL["ang"]).sum()), "ang_exc_deg": float(max(aexc.max(), 0.0)) if len(aexc) else 0.0,
        "vviol": int((vexc > TOL["v"]).sum()), "v_exc_pu": float(max(vexc.max(), 0.0)),
        "qviol": int((qexc > TOL["q"]).sum()), "q_exc_mvar": float(np.maximum(qexc, 0.0).sum()),
        "cost": float(totcost(ppc["gencost"][live], g[live, PG]).sum()),
        "losses": float(g[live, PG].sum() - bus[:, 2].sum()),
    }
    out["p_clean"] = out["n_over"] == 0 and out["slack_out_mw"] < TOL["slack"] and out["n_ang"] == 0
    out["clean"] = out["p_clean"] and out["vviol"] == 0 and out["qviol"] == 0
    return out


def merit(c, base_mva):
    return (max(c["max_load"] - 1.0, 0.0) + c["slack_out_mw"] / base_mva + np.deg2rad(c["ang_exc_deg"])
            + 10.0 * c["v_exc_pu"] + c["q_exc_mvar"] / base_mva)


ROUNDS = 10
# Variant J-m (added after J's results, LOG.md 2026-11-12): bounds pulled inward so first-order
# error lands inside the limit, not on it. Units: thermal fraction of rating, MW, deg, pu, MVAr.
MARGIN = {"load": 1e-3, "slack": 0.1, "ang": 0.01, "v": 1e-3, "q": 0.1}
ELASTIC = 1e4
VBOX = 0.03


def slp(ppc, pg_start, vg_start, rounds=ROUNDS, margin=None):
    """Successive linearisation in (P, V): C's step rules (no P box in round 1, then 20 % of range,
    halved on a rejected step), a V box of VBOX pu from round 1 halved with P's, elastic fallback.
    Each history entry keeps its point under "pg" and "vg"."""
    lay = Layout(ppc)
    g = ppc["gen"]
    ptrust = np.maximum(0.2 * (g[:, PMAX] - g[:, PMIN]), 0.1)
    vtrust = np.full(lay.nv, VBOX)
    pg, v = pg_start.copy(), lay.v_of(vg_start)
    cur = check(ppc, pg, lay.vg_of(v))
    hist = []
    warm = None
    for it in range(1, rounds + 1):
        lin = linearise(ppc, pg, v, lay, warm)
        if lin is None:
            hist.append({"it": it, "status": "PF failed at point"})
            break
        warm = lin["base"]
        pt = ptrust if it > 1 else None
        ok = False
        for kw in ({}, {"elastic": ELASTIC}, {"elastic": ELASTIC / 10}):
            xp, xv, ok = solve(ppc, lin, ptrust=pt, vtrust=vtrust, margin=margin, **kw)
            if ok:
                break
        if not ok:
            hist.append({"it": it, "status": "QP infeasible"})
            ptrust, vtrust = ptrust / 2, vtrust / 2
            continue
        vg = lay.vg_of(xv)
        c = check(ppc, xp, vg)
        if c is None:
            hist.append({"it": it, "status": "PF failed"})
            ptrust, vtrust = ptrust / 2, vtrust / 2
            continue
        hist.append({"it": it, "status": "clean" if c["clean"] else "not clean", "qp": "+".join(kw) or "hard",
                     **c, "pg": xp.copy(), "vg": vg.copy()})
        if c["clean"]:
            break
        if cur is None or merit(c, ppc["baseMVA"]) < merit(cur, ppc["baseMVA"]):
            pg, v, cur = xp.copy(), xv.copy(), c
        else:
            ptrust, vtrust = ptrust / 2, vtrust / 2
    return hist


def best_of(hist, base_mva):
    good = [x for x in hist if "n_over" in x]
    if not good:
        return None
    return next((x for x in good if x["clean"]), None) or min(good, key=lambda x: merit(x, base_mva))
