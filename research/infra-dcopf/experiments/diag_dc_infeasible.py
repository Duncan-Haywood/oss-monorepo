"""Why the DC OPF has no solution on five held-out PGLib cases (research/grid-linopf; plan in LOG.md 2026-11-16,
committed before this ran).

For each of the 24 held-out cases (fix_ref, then big_slack: the one protocol's reference):
  (a) aggregates: total load PD + GS against the summed live PMIN and PMAX; energised components;
  (b) PYPOWER rundcopf under four conventions, with and without angle limits:
        MP        MATPOWER B: b = 1/(x tap), phase shifts kept (the protocol's DC);
        PM        PowerModels DCP: b = x/(r^2+x^2), taps ignored (run_pglib.pm_convention);
        MP-notap  b = 1/x (taps ignored);
        PM-tap    b = x/(r^2+x^2)/tap;
      objective against PGLib's published DC objective (BASELINE.md);
  (c) an elastic DC OPF (HiGHS LP on the B-theta form, MP convention, no angle limits, no
      generation cost: only the l1 slack is minimised, 1 per MW, a phase-1 LP) with slacks on every rated branch row
      and on each unit's PMIN and PMAX: which rows need relaxing and by how much.
Writes experiments/results_dc_infeasible.txt and .json. Usage: diag_dc_infeasible.py [case/kind ...]
"""
import copy
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402
import scipy.sparse as sp  # noqa: E402
from scipy.optimize import linprog  # noqa: E402
from scipy.sparse.csgraph import connected_components  # noqa: E402
from pypower.api import ppoption, rundcopf  # noqa: E402
from pypower.ext2int import ext2int  # noqa: E402
from pypower.idx_brch import ANGMAX, ANGMIN, BR_R, BR_STATUS, BR_X, F_BUS, RATE_A, SHIFT, T_BUS, TAP  # noqa: E402
from pypower.idx_bus import BUS_TYPE, GS, PD  # noqa: E402
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PMAX, PMIN  # noqa: E402
from pypower.makeBdc import makeBdc  # noqa: E402

from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402

DCOPT = ppoption(VERBOSE=0, OUT_ALL=0)
HELDOUT = ["case500_goc", "case588_sdet", "case793_goc", "case1354_pegase", "case1803_snem",
           "case1888_rte", "case1951_rte", "case2000_goc"]
KINDS = ["typ", "api", "sad"]
X0 = 1e-4
UNSCORED = {("case1803_snem", "typ"), ("case1803_snem", "api"), ("case1803_snem", "sad"),
            ("case1951_rte", "api"), ("case2000_goc", "api")}


def big_slack(ppc):
    """diag_slack_move.big_slack, copied so this script runs on Python 3.11 (run_fold.py needs 3.12)."""
    p = copy.deepcopy(ppc)
    g = p["gen"]
    live = np.where(g[:, GEN_STATUS] > 0)[0]
    k = live[np.argmax(g[live, PMAX])]
    b = int(g[k, GEN_BUS])
    p["bus"][p["bus"][:, BUS_TYPE] == 3, BUS_TYPE] = 2
    p["bus"][p["bus"][:, 0] == b, BUS_TYPE] = 3
    return p, b, k


def convention(ppc, kind):
    p = copy.deepcopy(ppc)
    br = p["branch"]
    r, x, tap = br[:, BR_R].copy(), br[:, BR_X].copy(), br[:, TAP].copy()
    if kind == "MP":
        return p
    if kind == "MP-x0":  # declared after the first run: x = 0 branches (bus ties) get x = 1e-4 pu
        on = br[:, BR_STATUS] > 0
        br[on & (x == 0), BR_X] = X0
        return p
    if kind == "MP-notap":
        br[:, TAP] = 0.0
    elif kind == "PM":
        br[:, BR_X] = (r * r + x * x) / x
        br[:, TAP] = 0.0
    elif kind == "PM-tap":
        br[:, BR_X] = (r * r + x * x) / x
    else:
        raise KeyError(kind)
    return p


def no_angles(ppc):
    p = copy.deepcopy(ppc)
    p["branch"][:, ANGMIN], p["branch"][:, ANGMAX] = -360.0, 360.0
    return p


def dc(ppc):
    r = rundcopf(ppc, DCOPT)
    return float(r["f"]) if r["success"] else None


def aggregates(ppc):
    bus, gen, br = ppc["bus"], ppc["gen"], ppc["branch"]
    live = gen[:, GEN_STATUS] > 0
    idx = {int(b): i for i, b in enumerate(bus[:, 0])}
    on = br[:, BR_STATUS] > 0
    f = [idx[int(b)] for b in br[on, F_BUS]]
    t = [idx[int(b)] for b in br[on, T_BUS]]
    n = bus.shape[0]
    A = sp.coo_matrix((np.ones(len(f)), (f, t)), shape=(n, n))
    ncomp, lab = connected_components(A, directed=False)
    gbus = np.array([idx[int(b)] for b in gen[live, GEN_BUS]])
    active = set(lab[gbus]) | set(lab[np.abs(bus[:, PD]) > 0])
    gen_comps = set(lab[gbus])
    load_only = [c for c in active if c not in gen_comps]
    return {"load_mw": float(bus[:, PD].sum()), "gs_mw": float(bus[:, GS].sum()),
            "pmin_mw": float(gen[live, PMIN].sum()), "pmax_mw": float(gen[live, PMAX].sum()),
            "n_live": int(live.sum()), "n_neg_pmin": int((gen[live, PMIN] < 0).sum()),
            "n_components": int(ncomp), "n_active_components": len(active), "n_load_only_components": len(load_only),
            "n_rated": int(((br[:, RATE_A] > 0) & on).sum()), "n_tap": int(((br[:, TAP] != 0) & (br[:, TAP] != 1) & on).sum()),
            "n_shift": int(((br[:, SHIFT] != 0) & on).sum()), "n_zero_x": int(((br[:, BR_X] == 0) & on).sum()),
            "zero_x": [[int(r[F_BUS]), int(r[T_BUS]), float(r[BR_R]), float(r[RATE_A])] for r in br[on & (br[:, BR_X] == 0)]]}


def elastic(ppc):
    """min sum of slacks s.t. DC balance (MP B matrix, shifts kept), |flow| <= rate + s_rate, PMIN - s_lo <= Pg <=
    PMAX + s_hi; no angle limits. Returns the slacks in MW and the rows that carry them."""
    p = ext2int(copy.deepcopy(ppc))
    base, bus, gen, br = p["baseMVA"], p["bus"], p["gen"], p["branch"]
    gen = gen[gen[:, GEN_STATUS] > 0]
    br = br[br[:, BR_STATUS] > 0]
    n, ng, nl = bus.shape[0], gen.shape[0], br.shape[0]
    Bbus, Bf, Pbusinj, Pfinj = makeBdc(base, bus, br)
    Bbus, Bf = sp.csr_matrix(Bbus), sp.csr_matrix(Bf)
    if not (np.isfinite(Bbus.data).all() and np.isfinite(Bf.data).all()):
        return {"status": "B non-finite"}
    Cg = sp.csr_matrix((np.ones(ng), (gen[:, GEN_BUS].astype(int), np.arange(ng))), shape=(n, ng))
    rated = np.where(br[:, RATE_A] > 0)[0]
    nr = len(rated)
    ref = int(np.where(bus[:, BUS_TYPE] == 3)[0][0])
    # variables: theta (n), pg (ng), s_up (nr), s_dn (nr), s_lo (ng), s_hi (ng)
    nv = n + 2 * ng + 2 * nr + ng
    nv = n + ng + 2 * nr + 2 * ng
    c = np.r_[np.zeros(n + ng), np.ones(2 * nr + 2 * ng)]
    # balance: Bbus theta - Cg pg = -(Pd + Gs)/base - Pbusinj
    Aeq = sp.hstack([Bbus, -Cg, sp.csr_matrix((n, 2 * nr + 2 * ng))]).tocsr()
    beq = -(bus[:, PD] + bus[:, GS]) / base - Pbusinj
    F = Bf[rated]
    rate = br[rated, RATE_A] / base
    I = sp.identity(nr, format="csr")
    Z = lambda a, b: sp.csr_matrix((a, b))  # noqa: E731
    G = sp.identity(ng, format="csr")
    A1 = sp.hstack([F, Z(nr, ng), -I, Z(nr, nr), Z(nr, 2 * ng)])      # F th - s_up <= rate - Pfinj
    A2 = sp.hstack([-F, Z(nr, ng), Z(nr, nr), -I, Z(nr, 2 * ng)])     # -F th - s_dn <= rate + Pfinj
    A3 = sp.hstack([Z(ng, n), -G, Z(ng, 2 * nr), -G, Z(ng, ng)])      # -pg - s_lo <= -pmin
    A4 = sp.hstack([Z(ng, n), G, Z(ng, 2 * nr), Z(ng, ng), -G])       # pg - s_hi <= pmax
    Aub = sp.vstack([A1, A2, A3, A4]).tocsr()
    bub = np.r_[rate - Pfinj[rated], rate + Pfinj[rated], -gen[:, PMIN] / base, gen[:, PMAX] / base]
    bounds = [(None, None)] * n + [(None, None)] * ng + [(0, None)] * (2 * nr + 2 * ng)
    bounds[ref] = (0.0, 0.0)
    res = linprog(c, A_ub=Aub, b_ub=bub, A_eq=Aeq, b_eq=beq, bounds=bounds, method="highs")
    assert nv == len(c)
    if res.status != 0:
        return {"status": int(res.status), "message": res.message}
    x = res.x
    s_up, s_dn = x[n + ng:n + ng + nr], x[n + ng + nr:n + ng + 2 * nr]
    s_lo, s_hi = x[n + ng + 2 * nr:n + 2 * ng + 2 * nr], x[n + 2 * ng + 2 * nr:]
    s_rate = (s_up + s_dn) * base
    tol = 1e-6
    rows = [{"from": int(p["order"]["bus"]["i2e"][int(br[k, F_BUS])]), "to": int(p["order"]["bus"]["i2e"][int(br[k, T_BUS])]),
             "rate_mw": float(br[k, RATE_A]), "excess_mw": float(s_rate[j]),
             "excess_pct": float(100 * s_rate[j] / br[k, RATE_A])}
            for j, k in enumerate(rated) if s_rate[j] > tol]
    rows.sort(key=lambda r: -r["excess_mw"])
    return {"status": 0, "total_mw": float(res.fun * base), "rate_mw": float(s_rate.sum()),
            "pmin_mw": float(s_lo.sum() * base), "pmax_mw": float(s_hi.sum() * base),
            "n_rate_rows": len(rows), "n_pmin": int((s_lo > tol).sum()), "n_pmax": int((s_hi > tol).sum()),
            "rows": rows[:10]}


def dc_ref(ppc, angles=True, want_pg=False, solver="clarabel"):
    """Referee DC OPF on Clarabel (declared after the first run, not in the plan): the same B-theta model as
    rundcopf (makeBdc, shifts, rated rows, PMIN/PMAX, makeAang's angle rows, polynomial costs), solved by a
    second interior-point solver. Returns (objective $/h or None, Clarabel status).
    solver="highs-feas" (added 2026-11-21, diag_dc_highs.py): the same constraint rows with a zero objective on HiGHS
    (simplex with presolve, scipy linprog): returns (None, "Feasible" | "Infeasible" | HiGHS message[, pg])."""
    import clarabel
    q0 = copy.deepcopy(ppc)
    q0["gen"][:, 20] = np.arange(q0["gen"].shape[0])  # carry each unit's external row through ext2int (APF column)
    p = ext2int(q0)
    base, bus, br = p["baseMVA"], p["bus"], p["branch"]
    live = p["gen"][:, GEN_STATUS] > 0
    gen, gc = p["gen"][live], p["gencost"][live]
    if not (gc[:, 0] == 2).all() or not (gc[:, 3] <= 3).all():
        raise ValueError("referee handles polynomial costs of degree <= 2 only")
    coef = np.zeros((gen.shape[0], 3))  # c2, c1, c0 in $/MW^k h
    for i, row in enumerate(gc):
        nc = int(row[3])
        coef[i, 3 - nc:] = row[4:4 + nc]
    n, ng = bus.shape[0], gen.shape[0]
    Bbus, Bf, Pbusinj, Pfinj = makeBdc(base, bus, br)
    Bbus, Bf = sp.csr_matrix(Bbus), sp.csr_matrix(Bf)
    if not (np.isfinite(Bbus.data).all() and np.isfinite(Bf.data).all()):
        return (None, "B non-finite", None) if want_pg else (None, "B non-finite")
    Cg = sp.csr_matrix((np.ones(ng), (gen[:, GEN_BUS].astype(int), np.arange(ng))), shape=(n, ng))
    ref = int(np.where(bus[:, BUS_TYPE] == 3)[0][0])
    rated = np.where(br[:, RATE_A] > 0)[0]
    Z = lambda a, b: sp.csr_matrix((a, b))  # noqa: E731
    Aeq = sp.vstack([sp.hstack([Bbus, -Cg]), sp.hstack([sp.csr_matrix(([1.0], ([0], [ref])), shape=(1, n)), Z(1, ng)])])
    beq = np.r_[-(bus[:, PD] + bus[:, GS]) / base - Pbusinj, 0.0]
    F = Bf[rated]
    rate = br[rated, RATE_A] / base
    G = sp.identity(ng, format="csr")
    rows = [sp.hstack([F, Z(len(rated), ng)]), sp.hstack([-F, Z(len(rated), ng)]),
            sp.hstack([Z(ng, n), G]), sp.hstack([Z(ng, n), -G])]
    rhs = [rate - Pfinj[rated], rate + Pfinj[rated], gen[:, PMAX] / base, -gen[:, PMIN] / base]
    if angles:
        amin, amax = br[:, ANGMIN], br[:, ANGMAX]
        ia = np.where(((amin != 0) & (amin > -360)) | ((amax != 0) & (amax < 360)))[0]
        if len(ia):
            f, t = br[ia, F_BUS].astype(int), br[ia, T_BUS].astype(int)
            k = np.arange(len(ia))
            D = sp.csr_matrix((np.r_[np.ones(len(ia)), -np.ones(len(ia))], (np.r_[k, k], np.r_[f, t])), shape=(len(ia), n))
            lo = np.where((amin[ia] != 0) & (amin[ia] > -360), np.deg2rad(amin[ia]), -np.inf)
            hi = np.where((amax[ia] != 0) & (amax[ia] < 360), np.deg2rad(amax[ia]), np.inf)
            up, dn = np.isfinite(hi), np.isfinite(lo)
            rows += [sp.hstack([D[up], Z(up.sum(), ng)]), sp.hstack([-D[dn], Z(dn.sum(), ng)])]
            rhs += [hi[up], -lo[dn]]
    Ain = sp.vstack(rows)
    A = sp.vstack([Aeq, Ain]).tocsc()
    b = np.r_[beq, np.concatenate(rhs)]
    P = sp.block_diag([Z(n, n), sp.diags(2 * coef[:, 0] * base * base)]).tocsc()
    q = np.r_[np.zeros(n), coef[:, 1] * base]
    if solver == "highs-feas":
        neq = Aeq.shape[0]
        res = linprog(np.zeros(A.shape[1]), A_ub=Ain, b_ub=b[neq:], A_eq=Aeq, b_eq=b[:neq],
                      bounds=[(None, None)] * A.shape[1], method="highs")
        status = {0: "Feasible", 2: "Infeasible"}.get(res.status, f"HiGHS {res.status}: {res.message}")
        if not want_pg:
            return None, status
        full = None
        if res.status == 0:
            full = np.zeros(ppc["gen"].shape[0])
            full[gen[:, 20].astype(int)] = res.x[n:] * base
        return None, status, full
    st = clarabel.DefaultSettings()
    st.verbose = False
    sol = clarabel.DefaultSolver(sp.triu(P).tocsc(), q, A, b,
                                 [clarabel.ZeroConeT(Aeq.shape[0]), clarabel.NonnegativeConeT(Ain.shape[0])], st).solve()
    status = str(sol.status)
    if status not in ("Solved", "AlmostSolved"):
        return (None, status, None) if want_pg else (None, status)
    x = np.asarray(sol.x)
    pg = x[n:] * base
    f = float((coef[:, 0] * pg * pg + coef[:, 1] * pg + coef[:, 2]).sum())
    if not want_pg:
        return f, status
    full = np.zeros(ppc["gen"].shape[0])
    full[gen[:, 20].astype(int)] = pg
    return f, status, full


def one(name, kind):
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, b, _ = big_slack(ppc)
    out = {"case": name, "kind": kind, "unscored": (name, kind) in UNSCORED, "agg": aggregates(p),
           "pglib_dc": baseline()[(name, kind)][0]}
    for conv in ("MP", "PM", "MP-notap", "PM-tap", "MP-x0"):
        q = convention(p, conv)
        out[conv] = {"ang": dc(q), "noang": dc(no_angles(q))}
        if conv in ("MP", "PM", "MP-x0"):
            for a in (True, False):
                f, s = dc_ref(q, a)
                out[conv]["ref_" + ("ang" if a else "noang")] = f
                out[conv]["ref_status_" + ("ang" if a else "noang")] = s
    out["elastic"] = elastic(p)
    if out["elastic"]["status"] != 0:
        out["elastic_x0"] = elastic(convention(p, "MP-x0"))
    return out


def fmt(v):
    return "   none   " if v is None else f"{v:10.4g}"


def summary(rows):
    L = []
    P = L.append
    P("Why the DC OPF has no solution on five held-out PGLib-OPF v23.07 cases (plan: LOG.md 2026-11-16).")
    P("Reference at the largest live unit (the one protocol). DC objective ($/h); 'none' = no solution reported.")
    P("PIPS = PYPOWER rundcopf; Clarabel = the same B-theta model on a second solver (declared after the first run).")
    P("PGLib = published PowerModels DCP objective (BASELINE.md, 5 significant figures).")
    P("")
    P("Table 1. With angle limits.")
    P(f"{'case':16s} {'kind':4s} {'PGLib':>10s} | {'MP PIPS':>10s} {'MP Clar':>10s} | {'PM PIPS':>10s} {'PM Clar':>10s} | "
      f"{'MPx0 PIPS':>10s} {'MPx0 Clar':>10s} | {'MPnt PIPS':>10s} {'PMt PIPS':>10s} | PMClar/PGLib-1")
    for r in rows:
        pg = r["pglib_dc"]
        pm = r["PM"]["ref_ang"]
        gap = f"{100 * (pm / pg - 1):+.3f}%" if pm and pg == pg else "-"
        P(f"{r['case']:16s} {r['kind']:4s} {fmt(pg if pg == pg else None)} | {fmt(r['MP']['ang'])} {fmt(r['MP']['ref_ang'])} | "
          f"{fmt(r['PM']['ang'])} {fmt(pm)} | {fmt(r['MP-x0']['ang'])} {fmt(r['MP-x0']['ref_ang'])} | "
          f"{fmt(r['MP-notap']['ang'])} {fmt(r['PM-tap']['ang'])} | {gap}{'  *' if r['unscored'] else ''}")
    P("")
    P("Table 2. Without angle limits.")
    P(f"{'case':16s} {'kind':4s} | {'MP PIPS':>10s} {'MP Clar':>10s} | {'PM PIPS':>10s} {'PM Clar':>10s} | "
      f"{'MPx0 PIPS':>10s} {'MPx0 Clar':>10s} | {'MPnt PIPS':>10s} {'PMt PIPS':>10s}")
    for r in rows:
        P(f"{r['case']:16s} {r['kind']:4s} | {fmt(r['MP']['noang'])} {fmt(r['MP']['ref_noang'])} | "
          f"{fmt(r['PM']['noang'])} {fmt(r['PM']['ref_noang'])} | {fmt(r['MP-x0']['noang'])} {fmt(r['MP-x0']['ref_noang'])} | "
          f"{fmt(r['MP-notap']['noang'])} {fmt(r['PM-tap']['noang'])}{'  *' if r['unscored'] else ''}")
    P("* = unscored under the one protocol (no MP solution from PIPS with or without angle limits).")
    P("Clarabel statuses other than Solved: " + "; ".join(
        f"{r['case']} {r['kind']} {c} {s}: {r[c]['ref_status_' + s]}" for r in rows for c in ("MP", "PM", "MP-x0")
        for s in ("ang", "noang") if r[c]["ref_status_" + s] not in ("Solved",)))
    P("")
    P("Table 3. Aggregates (MW) and the elastic MP LP (no angle limits; l1 slack on rated rows and unit PMIN/PMAX;")
    P("where the MP B matrix is non-finite, the LP is run on MP-x0 and marked x0).")
    P(f"{'case':16s} {'kind':4s} {'load':>9s} {'GS':>7s} {'sumPMIN':>9s} {'sumPMAX':>9s} {'comp':>5s} {'act':>4s} "
      f"{'taps':>5s} {'shft':>5s} {'x=0':>4s} | {'slack MW':>9s} {'rate':>9s} {'PMIN':>7s} {'PMAX':>7s} {'rows':>5s}")
    for r in rows:
        a = r["agg"]
        e, tag = (r["elastic"], "") if r["elastic"]["status"] == 0 else (r.get("elastic_x0", r["elastic"]), " x0")
        head = (f"{r['case']:16s} {r['kind']:4s} {a['load_mw']:9.1f} {a['gs_mw']:7.1f} {a['pmin_mw']:9.1f} {a['pmax_mw']:9.1f} "
                f"{a['n_components']:5d} {a['n_active_components']:4d} {a['n_tap']:5d} {a['n_shift']:5d} {a['n_zero_x']:4d} | ")
        if e["status"] != 0:
            P(head + f"LP status {e['status']}")
            continue
        P(head + f"{e['total_mw']:9.2f} {e['rate_mw']:9.2f} {e['pmin_mw']:7.2f} {e['pmax_mw']:7.2f} {e['n_rate_rows']:5d}{tag}")
    zx = [(r["case"], r["kind"], r["agg"]["zero_x"]) for r in rows if r["agg"]["n_zero_x"]]
    P("")
    P("In-service branches with x = 0 (from bus, to bus, r pu, RATE_A MVA): " +
      "; ".join(f"{c} {k}: {z}" for c, k, z in zx))
    return "\n".join(L) + "\n"


def main(argv):
    jobs = [tuple(a.split("/")) for a in argv] or [(c, k) for k in KINDS for c in HELDOUT]
    rows = []
    for name, kind in jobs:
        r = one(name, kind)
        rows.append(r)
        print(name, kind, json.dumps({k: r[k] for k in ("MP", "PM", "MP-x0", "elastic")}), flush=True)
    if not argv:
        (HERE / "results_dc_infeasible.json").write_text(json.dumps(rows, indent=1))
        txt = summary(rows)
        (HERE / "results_dc_infeasible.txt").write_text(txt)
        print(txt)


if __name__ == "__main__":
    main(sys.argv[1:])
