"""Convergence diagnostics for the (P, V) repair (milestone 7 of research/grid-linopf).

`traced_slp` runs the same loop as `vlin.slp` (same linearisation, QP, step and trust rules, same
history) and logs, per round, what the one-step finishing condition needs:

* the step d in per unit (P over baseMVA, V in pu) and its 2-norm;
* the remainder e = m(x0 + d) - m(x0) - J d of every tracked quantity (slack P, |S| at both branch
  ends, limited angle differences, PQ-bus voltages, unit Q), divided by that row's QP margin
  (vlin.MARGIN; thermal margins are a fraction of rating) and signed towards the row's nearer bound
  (for a broken row, towards the bound it breaks);
* rho = the largest normalised remainder, kappa = max |e_i| / mu_i / ||d||^2 (a curvature estimate);
* the smallest singular value and condition number of PYPOWER's Newton power-flow Jacobian at the
  round's base point.

Proposition 1 (LOG.md, milestone 7 plan): after a hard QP every row of the linear model sits at
least mu_i inside its bound, so a row of the trial point is broken only if its remainder towards
that bound exceeds mu_i. The extra power flow at the trial point is diagnostic only: nothing
computed here feeds back into the repair.
"""
import numpy as np
from pypower.bustypes import bustypes
from pypower.dSbus_dV import dSbus_dV
from pypower.api import makeYbus
from pypower.idx_brch import ANGMAX, ANGMIN, BR_STATUS, F_BUS, RATE_A, T_BUS
from pypower.idx_bus import BUS_I, BUS_TYPE, NONE, VA, VM, VMAX, VMIN
from pypower.idx_gen import GEN_BUS, PG, PMAX, PMIN, QMAX, QMIN

from . import vlin
from .aclin import angle_limited

FAMILIES = ("slack", "load", "ang", "v", "q")


def row_meta(ppc, lay, aidx, margin):
    """Per entry of vlin.measure(): family, lower and upper bound, margin mu, and whether it is a row
    the QP constrains (rated live branch ends, live units)."""
    br, bus, g = ppc["branch"], ppc["bus"], ppc["gen"]
    nbr = br.shape[0]
    fam, lo, hi, mu, use = [], [], [], [], []

    def put(f, l, h, m, u):
        n = len(l)
        fam.extend([f] * n)
        lo.extend(l)
        hi.extend(h)
        mu.extend(np.broadcast_to(m, (n,)))
        use.extend(u)

    s = lay.slack
    put("slack", [g[s, PMIN]], [g[s, PMAX]], margin["slack"], [True])
    rate = np.concatenate([br[:, RATE_A], br[:, RATE_A]])
    on = np.concatenate([br[:, BR_STATUS], br[:, BR_STATUS]]) > 0
    put("load", np.full(2 * nbr, -np.inf), rate, np.maximum(margin["load"] * rate, 1e-12), on & (rate > 0))
    put("ang", br[aidx, ANGMIN], br[aidx, ANGMAX], margin["ang"], np.ones(len(aidx), bool))
    put("v", bus[lay.pq, VMIN], bus[lay.pq, VMAX], margin["v"], np.ones(len(lay.pq), bool))
    put("q", g[:, QMIN], g[:, QMAX], margin["q"], lay.live)
    return {"fam": np.array(fam), "lo": np.array(lo, float), "hi": np.array(hi, float),
            "mu": np.array(mu, float), "use": np.array(use, bool)}


def broken_rows(meta, m):
    """Rows of a measured vector outside their bounds by more than the AC check's tolerance (vlin.TOL;
    thermal relative to rating). Returns (index array, +1 above / -1 below)."""
    tol = np.array([vlin.TOL[f] for f in meta["fam"]])
    hi_t = np.where(meta["fam"] == "load", meta["hi"] * (1.0 + tol), meta["hi"] + tol)
    lo_t = meta["lo"] - tol
    up = meta["use"] & (m > hi_t)
    dn = meta["use"] & (m < lo_t)
    idx = np.where(up | dn)[0]
    return idx, np.where(up[idx], 1.0, -1.0)


def remainder_stats(meta, m_lin, m1, dnorm):
    """Normalised remainders of the rows the QP constrains. Returns rho, kappa and the normalised
    remainder vector (signed towards each row's nearer bound at the model point)."""
    e = m1 - m_lin
    u = meta["use"] & np.isfinite(e)
    near_hi = (meta["hi"] - m_lin) <= (m_lin - meta["lo"])
    sgn = np.where(near_hi, 1.0, -1.0)
    r = sgn * e / meta["mu"]
    rho = float(r[u].max()) if u.any() else 0.0
    mag = float(np.abs(e[u] / meta["mu"][u]).max()) if u.any() else 0.0
    kappa = mag / dnorm ** 2 if dnorm > 0 else float("nan")
    return rho, kappa, r, e


def newton_svd(res):
    """Smallest singular value and condition number of the Newton power-flow Jacobian (polar form, as
    PYPOWER's newtonpf builds it) at a power-flow solution; (nan, nan) with isolated buses."""
    bus = res["bus"].copy()
    if (bus[:, BUS_TYPE] == NONE).any():
        return float("nan"), float("nan")
    br, gen = res["branch"].copy(), res["gen"].copy()
    row = {int(b): i for i, b in enumerate(bus[:, BUS_I])}
    bus[:, BUS_I] = np.arange(bus.shape[0])
    br[:, F_BUS] = [row[int(b)] for b in br[:, F_BUS]]
    br[:, T_BUS] = [row[int(b)] for b in br[:, T_BUS]]
    gen[:, GEN_BUS] = [row[int(b)] for b in gen[:, GEN_BUS]]
    Ybus, _, _ = makeYbus(res["baseMVA"], bus, br)
    V = bus[:, VM] * np.exp(1j * np.deg2rad(bus[:, VA]))
    _ref, pv, pq = bustypes(bus, gen)
    pvpq = np.r_[pv, pq]
    dS_dVm, dS_dVa = dSbus_dV(Ybus, V)
    dS_dVm, dS_dVa = dS_dVm.toarray(), dS_dVa.toarray()
    J = np.block([[dS_dVa[np.ix_(pvpq, pvpq)].real, dS_dVm[np.ix_(pvpq, pq)].real],
                  [dS_dVa[np.ix_(pq, pvpq)].imag, dS_dVm[np.ix_(pq, pq)].imag]])
    sv = np.linalg.svd(J, compute_uv=False)
    return float(sv[-1]), float(sv[0] / sv[-1]) if sv[-1] > 0 else float("inf")


def traced_slp(ppc, pg_start, vg_start, rounds=30, margin=None, analytic=True, solver="clarabel",
               hook=None, accept=None, enlarge=None, enlarge_once=False, enlarge_rel=False,
               enlarge_pre=False):
    """vlin.slp's loop, step for step, with diagnostics. Returns (hist, trace): hist as vlin.slp
    returns it; trace one dict per round.

    hook (optional, diagnostic): called after each solved round as hook(ctx) with a dict holding the
    round's lin, QP kwargs, boxes, solution, check result and trial power flow; whatever it returns
    (a dict) is stored under the round's trace key "hook". It must not change the repair.
    accept (optional, a method change; None = the frozen merit test): accept(ctx) -> bool decides
    whether a not-clean trial replaces the base point, with ctx as for hook plus "phi_accept", the
    frozen test's verdict.
    enlarge (optional, a method change; None = frozen): rule E's cap as a multiple of the first boxes
    (vlin.enlarged_step); its per-round record is stored under the trace key "enlarge".
    enlarge_once: rule O, rule E at most once per base point (as vlin.slp); a blocked round's trace has
    "enlarge" = {"blocked": True}.
    enlarge_rel: rule C, rule E capped at `enlarge` times the current stored boxes (as vlin.slp).
    enlarge_pre: rule P, the enlarged step tried only before the first halving (as vlin.slp)."""
    margin = margin or vlin.MARGIN
    lay = vlin.Layout(ppc)
    g = ppc["gen"]
    base_mva = ppc["baseMVA"]
    ptrust = np.maximum(0.2 * (g[:, PMAX] - g[:, PMIN]), 0.1)
    p_first = ptrust.copy()
    vtrust = np.full(lay.nv, vlin.VBOX)
    pg, v = pg_start.copy(), lay.v_of(vg_start)
    cur = vlin.check(ppc, pg, lay.vg_of(v))
    hist, trace = [], []
    warm = None
    halvings = 0
    used_here = False
    for it in range(1, rounds + 1):
        tr = {"it": it, "halvings": halvings, "phi": None if cur is None else vlin.merit(cur, base_mva)}
        lin = vlin.linearise(ppc, pg, v, lay, warm, analytic=analytic)
        if lin is None:
            hist.append({"it": it, "status": "PF failed at point"})
            tr["status"] = "PF failed at point"
            trace.append(tr)
            break
        warm = lin["base"]
        tr["smin"], tr["cond"] = newton_svd(lin["base"])
        pt = ptrust if it > 1 else None
        ok = False
        for kw in ({}, {"elastic": vlin.ELASTIC}, {"elastic": vlin.ELASTIC / 10}):
            xp, xv, ok = vlin.solve(ppc, lin, ptrust=pt, vtrust=vtrust, margin=margin, solver=solver, **kw)
            if ok:
                break
            if not kw and enlarge is not None and enlarge_once and used_here:
                tr["enlarge"] = {"blocked": True}
            elif not kw and enlarge is not None and enlarge_pre and halvings > 0:
                tr["enlarge"] = {"post_halving": True}
            elif not kw and enlarge is not None:
                xp, xv, ok, inf = vlin.enlarged_step(ppc, lin, pt, vtrust, margin,
                                                     enlarge * (ptrust if enlarge_rel else p_first),
                                                     enlarge * (vtrust if enlarge_rel else vlin.VBOX), solver)
                tr["enlarge"] = inf
                if ok:
                    kw = {"enlarged": inf["t_used"]}
                    used_here = True
                    break
        if not ok:
            hist.append({"it": it, "status": "QP infeasible"})
            tr["status"] = "QP infeasible"
            trace.append(tr)
            ptrust, vtrust = ptrust / 2, vtrust / 2
            halvings += 1
            continue
        qp = "+".join(kw) or "hard"
        vg = lay.vg_of(xv)
        c = vlin.check(ppc, xp, vg)
        if c is None:
            hist.append({"it": it, "status": "PF failed"})
            tr.update(status="PF failed", qp=qp)
            trace.append(tr)
            ptrust, vtrust = ptrust / 2, vtrust / 2
            halvings += 1
            continue
        hist.append({"it": it, "status": "clean" if c["clean"] else "not clean", "qp": qp,
                     **c, "pg": xp.copy(), "vg": vg.copy()})
        # diagnostics at the trial point (one extra power flow, same as check's)
        x0 = np.concatenate([lin["pg0"], lin["v0"]])
        x1 = np.concatenate([xp, xv])
        d = x1 - x0
        dpu = np.concatenate([d[:lay.ng] / base_mva, d[lay.ng:]])
        dpu[lay.slack] = 0.0  # the slack unit's P is an output of the power flow, not a step
        dnorm = float(np.linalg.norm(dpu))
        m_lin = lin["m0"] + lin["J"] @ d
        r1 = vlin.run_point(ppc, xp, vg)
        meta = row_meta(ppc, lay, lin["aidx"], margin)
        m1 = vlin.measure(ppc, r1, lay, lin["aidx"])
        rho, kappa, rn, e = remainder_stats(meta, m_lin, m1, dnorm)
        idx, side = broken_rows(meta, m1)
        brk = [{"fam": str(meta["fam"][i]), "r": float(side[j] * e[i] / meta["mu"][i])}
               for j, i in enumerate(idx)]
        phi_t = vlin.merit(c, base_mva)
        phi_acc = cur is None or phi_t < vlin.merit(cur, base_mva)
        ctx = {"it": it, "lin": lin, "kw": kw, "qp": qp, "ptrust": pt, "vtrust": vtrust,
               "ptrust_next": ptrust, "xp": xp, "xv": xv, "c": c, "cur": cur, "r1": r1, "m1": m1,
               "meta": meta, "lay": lay, "margin": margin, "solver": solver, "phi_accept": bool(phi_acc)}
        if not c["clean"] and accept is not None:
            phi_acc = bool(accept(ctx))
        accepted = (not c["clean"]) and phi_acc
        tr.update(status=hist[-1]["status"], qp=qp, dnorm=dnorm, dmax_p_pu=float(np.abs(dpu[:lay.ng]).max()),
                  dmax_v=float(np.abs(dpu[lay.ng:]).max()) if lay.nv else 0.0, rho=rho, kappa=kappa,
                  phi_trial=phi_t, accepted=bool(accepted), broken=brk,
                  rho_fam={f: float(rn[meta["use"] & (meta["fam"] == f)].max())
                           for f in FAMILIES if (meta["use"] & (meta["fam"] == f)).any()})
        if hook is not None:
            tr["hook"] = hook(ctx)
        trace.append(tr)
        if c["clean"]:
            break
        if accepted:
            pg, v, cur = xp.copy(), xv.copy(), c
            used_here = False
        else:
            ptrust, vtrust = ptrust / 2, vtrust / 2
            halvings += 1
    return hist, trace


def classify(tr):
    """Failure class of a not-clean trial: elastic, curvature (hard QP, every broken row's remainder
    above its margin) or other (hard QP, some broken row at or below its margin)."""
    if tr.get("status") != "not clean":
        return None
    if tr["qp"] != "hard":
        return "elastic"
    return "curvature" if tr["broken"] and all(b["r"] > 1.0 for b in tr["broken"]) else "other"
