"""Milestone 4a of research/grid-linopf: LPAC-C as a one-shot dispatch baseline.

Plan and predictions in LOG.md (2026-11-13, "LPAC as a one-shot baseline", committed before any
LPAC code ran). PGLib-OPF v23.07 TYP, API and SAD, 12 cases each. For each case with an AC optimum:
  L      src/infra_dcopf/lpac.solve: LPAC's P for every unit and its 1 + phi at each unit's bus as
         the setpoint, one AC power flow, vlin.check;
  L-f    LPAC's P at the case file's setpoints (1.0 pu);
  L+R    when L is not fully clean, milestone 3's reactive stage on L's P;
  L->J   the frozen J-m-a repair (vlin.MARGIN, analytic sensitivities, Clarabel QP, 10 rounds)
         started at L's point; L->J+R the reactive stage on its best point when not clean.
Compared case by case with J-m-a from the DC start (results_vlin_margin_analytic_clarabel.json).
Writes results_lpac.txt and .json. Usage: run_lpac.py [--report] [case ...] (--report rebuilds the table from results_lpac.json); OMP_NUM_THREADS=1 recommended."""
import json
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import runopf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import lpac, vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule, reactive_stage  # noqa: E402
from run_pglib import ACOPT, CASES  # noqa: E402
from run_vlin import cell, jsonable, pct, strip  # noqa: E402

KINDS = ["typ", "api", "sad"]
BASE = HERE / "results_vlin_margin_analytic_clarabel.json"


def run_case(job):
    name, kind = job
    ppc = load_m(case_path(name, kind))
    t0 = time.time()
    ac = runopf(ppc, ACOPT)
    out = {"case": name, "kind": kind, "ac_ok": bool(ac["success"])}
    if not ac["success"]:
        return out
    out["ac"] = float(ac["f"])
    t1 = time.time()
    sol = lpac.solve(ppc)
    out["lpac_secs"] = time.time() - t1
    out["lpac_status"] = sol["status"]
    s2 = lpac.solve(ppc, solver="scs")  # second opinion on the same conic data
    out["scs_status"] = s2["status"]
    out["scs_obj"] = s2.get("obj")
    if not sol["ok"]:
        out["secs"] = time.time() - t0
        return out
    out["lpac_obj"] = sol["obj"]
    out["lpac_losses"] = sol["losses"]
    pg, vg = sol["pg"], sol["vg"]
    lv = ppc["gen"][:, 7] > 0
    vb = {int(b): i for i, b in enumerate(ppc["bus"][:, 0])}
    gi = np.array([vb[int(b)] for b in ppc["gen"][lv, 0]])
    vmax, vmin = ppc["bus"][gi, 11], ppc["bus"][gi, 12]
    out["vg_at_bound"] = [int(((vg[lv] >= vmax - 1e-5) | (vg[lv] <= vmin + 1e-5)).sum()), int(lv.sum())]
    out["vg_range"] = [float(vg[ppc["gen"][:, 7] > 0].min()), float(vg[ppc["gen"][:, 7] > 0].max())]
    L = vlin.check(ppc, pg, vg)
    out["L"] = strip(L)
    out["Lf"] = strip(vlin.check(ppc, pg, file_schedule(ppc)))
    if L is not None and not L["clean"]:
        rs = reactive_stage(ppc, pg)
        out["LR"] = {"ok": False} if rs is None else {"ok": True, "final": strip(vlin.check(ppc, rs[0], rs[1]))}
    t2 = time.time()
    hist = vlin.slp(ppc, pg, vg, margin=vlin.MARGIN, analytic=True, solver="clarabel")
    out["LJ_secs"] = time.time() - t2
    b = vlin.best_of(hist, ppc["baseMVA"])
    out["LJ"] = {"rounds": len(hist), "clean_at": next((x["it"] for x in hist if x.get("clean")), None),
                 "statuses": [x["status"] + ("/" + x["qp"] if "qp" in x else "") for x in hist],
                 "final": strip(b)}
    if b is not None and not b["clean"]:
        rs = reactive_stage(ppc, b["pg"])
        out["LJR"] = {"ok": False} if rs is None else {"ok": True, "final": strip(vlin.check(ppc, rs[0], rs[1]))}
    out["secs"] = time.time() - t0
    return out


def clean(c):
    return bool(c and c.get("clean"))


def pclean(c):
    return bool(c and c.get("p_clean"))


def report(rows):
    base = {(r["case"], r["kind"]): r for r in json.loads(BASE.read_text())} if BASE.exists() else {}
    L = []
    P = L.append
    P("Milestone 4a of research/grid-linopf: LPAC-C (Coffrin and Van Hentenryck 2014, PowerModels form) as a")
    P("one-shot dispatch baseline. PGLib-OPF v23.07, PYPOWER AC power flow, checks as vlin.check.")
    P("Columns per point: overloads, max loading %, slack excursion MW, angle violations, worst angle excess deg,")
    P("bus-voltage violations, Q violations, AC cost vs the AC optimum.")
    P("")
    P(f"{'case':18s} {'kind':4s} {'LPAC obj':>9s} {'L (LPAC P and V, one AC power flow)':>52s}   {'L-f':>4s} {'L+R':>4s} "
      f"{'L->J':>5s} {'L->J+R':>6s} {'J-m-a':>6s} {'J+R':>4s}")
    agg = {k: 0 for k in ("n", "L", "Lp", "Lf", "Lfp", "LR", "LJ", "LJR", "J", "JR", "obj1", "start_p")}
    lj_rounds, j_rounds, objgap, lcost, ljcost = [], [], [], [], []
    for r in rows:
        if not r.get("ac_ok"):
            P(f"{r['case']:18s} {r['kind']:4s} no AC optimum")
            continue
        if "L" not in r:
            P(f"{r['case']:18s} {r['kind']:4s} LPAC {r.get('lpac_status')} (SCS: {r.get('scs_status')})")
            continue
        agg["n"] += 1
        bj = base.get((r["case"], r["kind"]), {})
        g = pct(r["lpac_obj"], r["ac"])
        objgap.append(g)
        agg["obj1"] += abs(g) <= 1.0
        cl = clean(r["L"])
        lr = cl or clean(r.get("LR", {}).get("final"))
        lj = r["LJ"]["clean_at"]
        ljr = bool(lj) or clean(r.get("LJR", {}).get("final"))
        j = bj.get("J", {}).get("clean_at")
        jr = bool(j) or clean(bj.get("JR", {}).get("final"))
        agg["L"] += cl
        agg["Lp"] += pclean(r["L"])
        agg["Lf"] += clean(r["Lf"])
        agg["Lfp"] += pclean(r["Lf"])
        agg["LR"] += lr
        agg["LJ"] += bool(lj)
        agg["LJR"] += ljr
        agg["J"] += bool(j)
        agg["JR"] += jr
        agg["start_p"] += pclean(bj.get("start"))
        if lj:
            lj_rounds.append(lj)
            ljcost.append(pct(r["LJ"]["final"]["cost"], r["ac"]))
        if j:
            j_rounds.append(j)
        if cl:
            lcost.append(pct(r["L"]["cost"], r["ac"]))
        yn = lambda b: "yes" if b else "no"
        P(f"{r['case']:18s} {r['kind']:4s} {g:+8.3f}% {cell(r, r['L']):>52s}   {yn(clean(r['Lf'])):>4s} {yn(lr):>4s} "
          f"{('@' + str(lj)) if lj else 'no':>5s} {yn(ljr):>6s} {('@' + str(j)) if j else 'no':>6s} {yn(jr):>4s}")
    n = agg["n"]
    P("")
    P(f"Cases with an AC optimum and an LPAC solution: {n}")
    nl = sum(1 for r in rows if r.get("ac_ok"))
    inconc = sum(1 for r in rows if r.get("ac_ok") and "max_iters" in str(r.get("scs_status")))
    agree = sum(1 for r in rows if r.get("ac_ok") and "max_iters" not in str(r.get("scs_status"))
                and (r.get("lpac_status") == "Solved") == (r.get("scs_status") == "solved"))
    gaps = [abs(r["scs_obj"] / r["lpac_obj"] - 1) for r in rows if r.get("lpac_obj") and r.get("scs_obj")]
    P(f"LPAC solved by Clarabel on {n} of {nl} cases with an AC optimum; SCS agrees on solved/infeasible on {agree} of {nl}, stops at its iteration limit without a verdict on {inconc}"
      + (f", objectives within {max(gaps):.1e} relative where both solve" if gaps else ""))
    P(f"LPAC objective within 1 % of the AC optimum: {agg['obj1']} of {n} (median {np.median(objgap):+.3f} %, "
      f"range {min(objgap):+.3f} to {max(objgap):+.3f} %)")
    vb_cases = sum(1 for r in rows if r.get("vg_at_bound") and r["vg_at_bound"][0] > 0)
    vb_units = sum(r["vg_at_bound"][0] for r in rows if r.get("vg_at_bound"))
    vb_all = sum(r["vg_at_bound"][1] for r in rows if r.get("vg_at_bound"))
    P(f"LPAC voltage setpoints at a bus-voltage bound (1e-5 pu): {vb_units} of {vb_all} live units, on {vb_cases} of {n} cases")
    P(f"L    P-clean {agg['Lp']}, fully clean {agg['L']}"
      + (f" (mean AC cost of clean points {np.mean(lcost):+.3f} %)" if lcost else ""))
    P(f"L-f  P-clean {agg['Lfp']}, fully clean {agg['Lf']}")
    P(f"L or L+R fully clean {agg['LR']}")
    P(f"L->J fully clean {agg['LJ']}, with R {agg['LJR']}"
      + (f"; median clean round {np.median(lj_rounds):.0f}, mean cost {np.mean(ljcost):+.3f} %" if lj_rounds else ""))
    P(f"J-m-a from the DC start on the same {n} cases (reference; all 34: 21 and 31): fully clean {agg['J']}, with R {agg['JR']}"
      + (f"; median clean round {np.median(j_rounds):.0f}" if j_rounds else "") + f"; DC start P-clean {agg['start_p']}")
    P(f"LPAC solve time summed {sum(r.get('lpac_secs', 0) for r in rows):.1f} s; L->J repair time summed "
      f"{sum(r.get('LJ_secs', 0) for r in rows):.0f} s")
    return "\n".join(L) + "\n", agg


def main():
    if "--report" in sys.argv:  # rebuild the table from the saved JSON
        text, _ = report(json.loads((HERE / "results_lpac.json").read_text()))
        (HERE / "results_lpac.txt").write_text(text)
        print(text)
        return
    names = [a for a in sys.argv[1:] if not a.startswith("--")]
    jobs = [(c, k) for k in KINDS for c in CASES if not names or c in names]
    with Pool(4) as pool:
        rows = pool.map(run_case, jobs, chunksize=1)
    order = {(c, k): i for i, (c, k) in enumerate(jobs)}
    rows.sort(key=lambda r: order[(r["case"], r["kind"])])
    text, _ = report(rows)
    tag = "" if not names else "_partial"
    (HERE / f"results_lpac{tag}.txt").write_text(text)
    (HERE / f"results_lpac{tag}.json").write_text(json.dumps(jsonable(rows), indent=1))
    print(text)


if __name__ == "__main__":
    main()
