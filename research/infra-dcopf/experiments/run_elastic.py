"""Is case73 API's stall a stationary point of the elastic QP's penalty? (research/grid-linopf)

Plan and predictions S1 to S4 (arm T) and V1, V2 (arm P) in LOG.md (2026-11-17, "Is case73 API's
stall a stationary point ...", committed before this ran).

Arm T: the frozen J-m-a repair (converge.traced_slp, 30 rounds, as run_converge.py) on the two
cases with an AC optimum that never finish, with a diagnostic hook. On every elastic round it records
the elastic QP's own objective P_rho(x) = cost + rho * sum_i w_i v_i (v_i the violation of row i's
margin-shifted bound; w_i = vlin.VSCALE on voltage rows, else 1): the model decrease, the true
decrease from the trial power flow, and a box probe (the same QP with every box entry scaled by t).
Reproduction gate: statuses, QP kinds, phi and step norms equal results_converge.json.

Arm P (a method change, exploratory): elastic rounds are accepted iff the true P_rho (plus rho times
the slack unit's excess over its P limits) falls; hard rounds keep the merit test. Run on the two
cases and on every development case (no-harm control).

Usage: run_elastic.py [--T] [--P] [--diag] [--summary]; OMP_NUM_THREADS=1 (4 processes for arm P).
Writes results_elastic.json and results_elastic.txt.
"""
import copy
import json
import math
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import rundcopf, runopf
from pypower.idx_brch import ANGMAX, ANGMIN
from pypower.idx_gen import PG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import converge, vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT  # noqa: E402

ROUNDS = 30
STALLS = [("case73_ieee_rts", "api"), ("case118_ieee", "api")]
KINDS = ["typ", "api", "sad"]
TS = [1.0, 1e-1, 1e-2, 1e-3]
REF = HERE / "results_converge.json"
OUT = HERE / "results_elastic"
FAMS = ("load", "ang", "v", "q")


def setup(name, kind):
    """run_converge.run_case's start: AC optimum, DC dispatch (angle limits dropped if it has no
    solution), case-file voltage setpoints. Returns (ppc, ac cost, start, vf) or None."""
    ppc = load_m(case_path(name, kind))
    ac = runopf(ppc, ACOPT)
    if not ac["success"]:
        return None
    dc = rundcopf(ppc, DCOPT)
    if not dc["success"]:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dc = rundcopf(free, DCOPT)
        if not dc["success"]:
            return None
    return ppc, float(ac["f"]), dc["gen"][:, PG].copy(), file_schedule(ppc)


def cost(ppc, lay, pg):
    c2, c1 = vlin.quad_costs(ppc)
    p = np.where(lay.live, pg, 0.0)
    return float(np.sum(np.where(lay.live, c2 * p * p + c1 * p, 0.0)))


def true_terms(ppc, lin, pg, v, m, margin):
    """(cost, per-row violation vector, row kinds) of the elastic QP's objective evaluated with the
    true row values m at (pg, v): rows() linearised at a point whose measured vector is m, evaluated
    at that point, gives sgn * scale * (m - bound) on every row."""
    fake = dict(lin, m0=m, pg0=pg, v0=v)
    A, u, kind, _, _ = vlin.rows(ppc, fake, margin)
    x = np.concatenate([pg, v])
    viol = np.maximum(A @ x - u, 0.0)
    return cost(ppc, lin["lay"], pg), viol, np.array(kind)


def model_obj(q, x):
    """The QP's objective at x (q one vlin.QP_LOG entry): 0.5 x'Hx + c'x + rho * sum max(0, Ax - u)."""
    v = np.maximum(q["A"] @ x - q["u"], 0.0)
    return float(0.5 * x @ q["H"] @ x + q["c"] @ x), float(v.sum())


def qp_record(ppc, lin, pt, vt, margin, solver, elastic):
    vlin.QP_LOG.clear()
    xp, xv, ok = vlin.solve(ppc, lin, ptrust=pt, vtrust=vt, margin=margin, solver=solver,
                            elastic=elastic, record=True)
    return vlin.QP_LOG[-1], np.concatenate([xp, xv]), ok


def pen(ppc, lin, pg, v, m, margin, rho, slack_out):
    c, viol, _ = true_terms(ppc, lin, pg, v, m, margin)
    return c + rho * float(viol.sum()) + rho * slack_out


def slack_out(ppc, lay, ps):
    g = ppc["gen"][lay.slack]
    from pypower.idx_gen import PMAX, PMIN
    return float(max(ps - g[PMAX], 0.0) + max(g[PMIN] - ps, 0.0))


def hook_T(ppc):
    def hook(ctx):
        if ctx["qp"] == "hard":
            return None
        lin, lay, margin, solver = ctx["lin"], ctx["lay"], ctx["margin"], ctx["solver"]
        rho = float(ctx["kw"]["elastic"])
        pt, vt = ctx["ptrust"], ctx["vtrust"]
        q, xs, ok = qp_record(ppc, lin, pt, vt, margin, solver, rho)
        xb = np.concatenate([lin["pg0"], lin["v0"]])
        cb, vb = model_obj(q, xb)
        c1, v1 = model_obj(q, xs)
        same = float(np.abs(xs - np.concatenate([ctx["xp"], ctx["xv"]])).max())
        # true P_rho at the base and trial points
        cbt, viol_b, kind = true_terms(ppc, lin, lin["pg0"], lin["v0"], lin["m0"], margin)
        pg1 = ctx["xp"].copy()
        pg1[lay.slack] = ctx["r1"]["gen"][lay.slack, PG]
        c1t, viol_1, _ = true_terms(ppc, lin, pg1, ctx["xv"], ctx["m1"], margin)
        so_b = slack_out(ppc, lay, lin["pg0"][lay.slack])
        so_1 = slack_out(ppc, lay, pg1[lay.slack])
        P_b = cbt + rho * viol_b.sum()
        P_1 = c1t + rho * viol_1.sum()
        pred = (cb + rho * vb) - (c1 + rho * v1)
        probe = []
        p0 = pt if pt is not None else ctx["ptrust_next"]
        for t in TS:
            qt, xt, okt = qp_record(ppc, lin, p0 * t, vt * t, margin, solver, rho)
            ct, vtt = model_obj(qt, xt)
            probe.append({"t": t, "ok": bool(okt), "pred": float((cb + rho * vb) - (ct + rho * vtt)),
                          "pred_cost": float(cb - ct), "pred_viol": float(rho * (vb - vtt))})
        return {"rho": rho, "qp_repeat_maxdiff": same, "P_base_model": cb + rho * vb, "P_base_true": float(P_b),
                "model_true_base_gap": float((cb + rho * vb) - P_b),
                "pred": float(pred), "pred_cost": float(cb - c1), "pred_viol": float(rho * (vb - v1)),
                "act": float(P_b - P_1), "act_cost": float(cbt - c1t), "act_viol": float(rho * (viol_b.sum() - viol_1.sum())),
                "slack_out_base": so_b, "slack_out_trial": so_1,
                "psi_base": float(viol_b.sum()), "psi_trial": float(viol_1.sum()),
                "psi_base_fam": {f: float(viol_b[kind == f].sum()) for f in FAMS},
                "n_viol_base": int((viol_b > 1e-9).sum()),
                "phi_accept": ctx["phi_accept"],
                "pen_accept": bool(P_1 + rho * so_1 < P_b + rho * so_b),
                "probe": probe}
    return hook


def accept_P(ppc):
    def accept(ctx):
        if ctx["qp"] == "hard":
            return ctx["phi_accept"]
        lin, lay, margin = ctx["lin"], ctx["lay"], ctx["margin"]
        rho = float(ctx["kw"]["elastic"])
        pg1 = ctx["xp"].copy()
        pg1[lay.slack] = ctx["r1"]["gen"][lay.slack, PG]
        Pb = pen(ppc, lin, lin["pg0"], lin["v0"], lin["m0"], margin, rho, slack_out(ppc, lay, lin["pg0"][lay.slack]))
        P1 = pen(ppc, lin, pg1, ctx["xv"], ctx["m1"], margin, rho, slack_out(ppc, lay, pg1[lay.slack]))
        return P1 < Pb
    return accept


def run_T(job):
    name, kind = job
    s = setup(name, kind)
    ppc, ac, start, vf = s
    t0 = time.time()
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=ROUNDS, hook=hook_T(ppc))
    return {"case": name, "kind": kind, "arm": "T", "ac": ac, "secs": time.time() - t0,
            "statuses": [x["status"] + ("/" + x["qp"] if "qp" in x else "") for x in hist],
            "clean_at": next((x["it"] for x in hist if x.get("clean")), None), "trace": trace}


def run_P(job):
    name, kind = job
    s = setup(name, kind)
    if s is None:
        return {"case": name, "kind": kind, "arm": "P", "skip": True}
    ppc, ac, start, vf = s
    t0 = time.time()
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=ROUNDS, accept=accept_P(ppc))
    cl = next((x for x in hist if x.get("clean")), None)
    return {"case": name, "kind": kind, "arm": "P", "ac": ac, "secs": time.time() - t0,
            "statuses": [x["status"] + ("/" + x["qp"] if "qp" in x else "") for x in hist],
            "clean_at": cl["it"] if cl else None, "clean_cost": cl["cost"] if cl else None,
            "n_elastic": sum(1 for t in trace if t.get("qp") not in (None, "hard")),
            "last": {k: hist[-1].get(k) for k in ("n_over", "max_load", "slack_out_mw", "n_ang", "vviol", "qviol", "q_exc_mvar", "cost")},
            "phi": [t.get("phi_trial") for t in trace], "accepted": [t.get("accepted") for t in trace]}


def gate(rows, ref):
    """Arm T reproduces results_converge.json round by round."""
    bad = []
    for r in rows:
        f = ref[(r["case"], r["kind"])]
        if r["statuses"] != f["statuses"]:
            bad.append(f"{r['case']}/{r['kind']}: statuses differ")
            continue
        for a, b in zip(r["trace"], f["trace"]):
            for k in ("phi_trial", "dnorm"):
                x, y = a.get(k), b.get(k)
                if x is None and y is None:
                    continue
                if x is None or y is None or abs(x - y) > 1e-9 * max(1.0, abs(y)):
                    bad.append(f"{r['case']}/{r['kind']} round {a['it']}: {k} {x} vs {y}")
    return bad


def fmt(x):
    return "nan" if x is None or not math.isfinite(x) else f"{x:.3e}"


def summary(res):
    ref = {(r["case"], r["kind"]): r for r in json.loads(REF.read_text())}
    L = []
    P = L.append
    P("Is case73 API's stall a stationary point of the elastic QP's penalty? (research/grid-linopf)")
    P("Plan and predictions: LOG.md 2026-11-17 (committed before this ran).")
    P("P_rho = cost + rho * sum_i w_i v_i, the elastic QP's objective (rho = 1e4, voltage rows x100).")
    P("pred = model decrease at the QP's solution; act = true decrease from the trial power flow;")
    P("probe pred(t)/t = model decrease with every box entry scaled by t, divided by t.")
    P("")
    T = [r for r in res if r["arm"] == "T"]
    if T:
        bad = gate(T, ref)
        P("Reproduction gate (arm T = results_converge.json, statuses, phi, ||d||): " + ("PASS" if not bad else "FAIL"))
        for b in bad[:10]:
            P("  " + b)
        P("")
        rej_phi = rej_pen = n_el = n_rat = 0
        s2 = s2n = 0
        for r in T:
            P(f"{r['case']} {r['kind']}: {r['secs']:.0f} s, clean at {r['clean_at']}")
            P(" it acc_phi acc_pen  rho    psi_base  n_v  load      ang       v         q         slack_out "
              " pred      act       act/pred  pr(1)/1   pr(.1)/.1 pr(.01)/.01 pr(1e-3)/1e-3  QPdiff")
            for t in r["trace"]:
                h = t.get("hook")
                if not h:
                    continue
                n_el += 1
                pr = {p["t"]: (p["pred"] / p["t"] if p["ok"] else float("nan")) for p in h["probe"]}
                rat = h["act"] / h["pred"] if h["pred"] > 0 else float("nan")
                if math.isfinite(rat) and rat > 0.1:
                    n_rat += 1
                if not h["phi_accept"]:
                    rej_phi += 1
                    rej_pen += int(h["act"] > 0)
                a, b = pr[1e-2], pr[1e-3]
                if math.isfinite(a) and math.isfinite(b) and a > 0 and b > 0:
                    s2n += 1
                    s2 += int(0.5 <= b / a <= 2.0)
                fam = h["psi_base_fam"]
                P(f"{t['it']:3d} {str(h['phi_accept'])[0]:>7} {str(h['pen_accept'])[0]:>7} {h['rho']:.0e} "
                  f"{fmt(h['psi_base'])} {h['n_viol_base']:4d} {fmt(fam['load'])} {fmt(fam['ang'])} {fmt(fam['v'])} {fmt(fam['q'])} "
                  f"{fmt(h['slack_out_base'])} {fmt(h['pred'])} {fmt(h['act'])} {fmt(rat):>9} "
                  f"{fmt(pr[1.0])} {fmt(pr[1e-1])} {fmt(pr[1e-2])}  {fmt(pr[1e-3])}     {h['qp_repeat_maxdiff']:.1e}")
            P("")
        c73 = next(r for r in T if r["case"] == "case73_ieee_rts")
        win = [t for t in c73["trace"] if t.get("hook") and 14 <= t["it"] <= 30]
        s1 = [t for t in win if next(p for p in t["hook"]["probe"] if p["t"] == 1e-3)["pred"]
              > 1e-6 * abs(t["hook"]["P_base_true"])]
        P(f"S1 (case73 API rounds 14-30: pred(1e-3) > 1e-6 x P_rho on every round): "
          f"{'held' if len(s1) == len(win) else 'refuted'} ({len(s1)}/{len(win)})")
        P(f"S2 (pred(1e-3)/1e-3 within 2x of pred(1e-2)/1e-2 on >= 75 % of elastic rounds): "
          f"{'held' if s2n and s2 >= 0.75 * n_el else 'refuted'} ({s2}/{n_el}; {s2n} with both positive)")
        P(f"S3 (true P_rho falls on >= half the elastic rounds phi rejects): "
          f"{'held' if rej_phi and rej_pen >= 0.5 * rej_phi else 'refuted'} ({rej_pen}/{rej_phi})")
        P(f"S4 (act/pred > 0.1 on >= half of all elastic rounds): {'held' if n_rat >= 0.5 * n_el else 'refuted'} ({n_rat}/{n_el})")
        P("")
    Pr = [r for r in res if r["arm"] == "P" and not r.get("skip")]
    if Pr:
        P("Arm P (elastic rounds accepted on the true P_rho + rho x slack excess; hard rounds on phi), 30 rounds:")
        P("case               kind  frozen@  P@   n_el  cost_frozen%  cost_P%   last state (P)")
        lost = gained = 0
        changed = 0
        for r in Pr:
            f = ref.get((r["case"], r["kind"]))
            fc = f.get("clean_at") if f else None
            fcost = f.get("clean_cost") if f else None
            gp = lambda c: "     -" if c is None else f"{100 * (c / r['ac'] - 1):+.3f}"  # noqa: E731
            if f and r["statuses"] != f.get("statuses"):
                changed += 1
            lost += int(fc is not None and r["clean_at"] is None)
            gained += int(fc is None and r["clean_at"] is not None)
            la = r["last"]
            st = "" if r["clean_at"] else (r["statuses"][-1] if la.get("max_load") is None else f"over {la['n_over']} (max {la['max_load']:.4f}), slack {la['slack_out_mw']:.2f} MW, "
                                          f"ang {la['n_ang']}, v {la['vviol']}, q {la['qviol']} ({la['q_exc_mvar']:.2f} MVAr)")
            P(f"{r['case']:18s} {r['kind']:4s} {str(fc):>7} {str(r['clean_at']):>4} {r['n_elastic']:5d}  "
              f"{gp(fcost):>12} {gp(r['clean_cost']):>8}   {st}")
        stall = [r for r in Pr if (r["case"], r["kind"]) in STALLS]
        v1 = sum(1 for r in stall if r["clean_at"] is not None)
        P(f"V1 (arm P clean within 30 rounds on at least one of the two stalls): {'held' if v1 else 'refuted'} ({v1}/{len(stall)})")
        P(f"V2 (no frozen finisher lost): {'held' if lost == 0 else 'refuted'} (lost {lost}, gained {gained}; "
          f"{changed} of {len(Pr)} cases' status sequences differ from the frozen run)")
    D = [r for r in res if r["arm"] == "D"]
    if D:
        P("")
        P("After-the-run diagnostic (declared, not in the plan): the frozen repair's round-30 base point.")
        for r in D:
            P(f"{r['case']} {r['kind']}: voltage setpoints at the margin-shifted upper bound {r['set_at_hi']} of {r['n_set']}, "
              f"at the lower {r['set_at_lo']}; violated QP rows {r['viol_rows']} (sums {json.dumps({k: round(v, 6) for k, v in r['viol_sum'].items()})}); "
              f"PQ buses below Vmin {r['pq_below_vmin']}, above Vmax {r['pq_above_vmax']}; AC check {json.dumps(r['check'])}")
    return "\n".join(L) + "\n"


def diag_stall(job):
    """After-the-run diagnostic (declared in LOG.md, not in the plan): at round 30's base point of the
    frozen repair, where each violated QP row sits, how many voltage setpoints sit on their
    margin-shifted bounds, and what the AC check breaks."""
    from pypower.idx_bus import VM, VMAX, VMIN
    name, kind = job
    ppc, ac, start, vf = setup(name, kind)
    out = {}
    converge.traced_slp(ppc, start, vf, rounds=ROUNDS, hook=lambda c: out.update(c) if c["it"] == ROUNDS else None)
    lin, lay = out["lin"], out["lay"]
    bus = ppc["bus"]
    v0, mv = lin["v0"], vlin.MARGIN["v"]
    A, u, kinds, _, _ = vlin.rows(ppc, lin, vlin.MARGIN)
    r = A @ np.concatenate([lin["pg0"], v0]) - u
    kinds = np.array(kinds)
    vm = lin["base"]["bus"][lay.pq, VM]
    c = vlin.check(ppc, lin["pg0"], lay.vg_of(v0))
    return {"case": name, "kind": kind, "n_set": int(len(v0)),
            "set_at_hi": int(np.sum(v0 >= bus[lay.vrow, VMAX] - mv - 1e-6)),
            "set_at_lo": int(np.sum(v0 <= bus[lay.vrow, VMIN] + mv + 1e-6)),
            "viol_rows": {f: int(np.sum((r > 1e-9) & (kinds == f))) for f in FAMS},
            "viol_sum": {f: float(r[(r > 1e-9) & (kinds == f)].sum()) for f in FAMS},
            "pq_below_vmin": int(np.sum(vm < bus[lay.pq, VMIN])), "pq_above_vmax": int(np.sum(vm > bus[lay.pq, VMAX])),
            "check": {k: c[k] for k in ("n_over", "max_load", "slack_out_mw", "n_ang", "vviol", "v_exc_pu", "qviol", "q_exc_mvar")}}


def main():
    args = sys.argv[1:]
    path = OUT.with_suffix(".json")
    res = json.loads(path.read_text()) if path.exists() else []
    if "--summary" not in args:
        if "--T" in args:
            res = [r for r in res if r["arm"] != "T"] + [run_T(j) for j in STALLS]
        if "--P" in args:
            jobs = [(c, k) for k in KINDS for c in CASES]
            with Pool(4) as pool:
                pr = pool.map(run_P, jobs)
            res = [r for r in res if r["arm"] != "P"] + pr
        if "--diag" in args:
            res = [r for r in res if r["arm"] != "D"] + [dict(diag_stall(j), arm="D") for j in STALLS]
        path.write_text(json.dumps(res, default=float))
    txt = summary(res)
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
