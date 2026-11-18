"""Milestone 2b of research/grid-linopf: is the repair's QP solved correctly?

Plan and predictions in LOG.md (2026-11-13, "Is the repair's QP solved correctly?", committed before
this ran). For each of the 36 PGLib-OPF v23.07 TYP, API and SAD cases with an AC optimum, run J-m-a
(vlin.slp with vlin.MARGIN and analytic sensitivities, PIPS on the full QP: the committed path of
results_vlin_margin_analytic.json) and keep every QP it poses. Re-solve each QP two more ways:
  S  PIPS by constraint generation (vlin.solve(screen=True)'s loop),
  C  Clarabel 0.11 on the full QP (interior point, conic form), the referee.
For each solution: did the solver report success, the largest violation of any row (A x <= u), of the
balance row and of the variable bounds, and the objective 0.5 x'Hx + c'x (+ elastic x the sum of
max(Ax - u, 0) for elastic QPs). Writes audit_qp.txt and audit_qp.json.
Usage: audit_qp.py [case ...]; OMP_NUM_THREADS=1 (4 worker processes)."""
import copy
import json
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
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT  # noqa: E402

KINDS = ["typ", "api", "sad"]
FEAS = 1e-6     # a solution is feasible if no row, balance or bound is broken by more (row units)
REL = 1e-6      # objectives agree if within this relative gap (of max(1, |objective|))


def screened(q):
    """vlin.solve's screened loop on a recorded QP (same start set, tolerance and pass limit)."""
    A, u = q["A"], q["u"]
    m, n = A.shape
    slack0 = u - A @ q["x0"]
    use = np.zeros(m, bool)
    use[slack0 < 0] = True
    use[np.argsort(slack0)[:min(m, n)]] = True
    passes = 0
    for _ in range(vlin.SCREEN_MAX):
        passes += 1
        x, ok = vlin._qp(q["H"], q["c"], A[use], u[use], q["a_eq"], q["b_eq"], q["xmin"], q["xmax"], q["x0"],
                         q["elastic"])
        if not ok:
            return x, False, passes, int(use.sum())
        broken = (~use) & (A @ x - u > vlin.SCREEN_TOL)
        if not broken.any():
            return x, True, passes, int(use.sum())
        use |= broken
    x, ok = vlin._qp(q["H"], q["c"], A, u, q["a_eq"], q["b_eq"], q["xmin"], q["xmax"], q["x0"], q["elastic"])
    return x, ok, passes + 1, m


def score(q, x):
    if x is None or not np.all(np.isfinite(x)):
        return {"row": None, "eq": None, "box": None, "obj": None}
    r = q["A"] @ x - q["u"]
    obj = 0.5 * x @ q["H"] @ x + q["c"] @ x
    if q["elastic"] is not None:
        obj += float(q["elastic"]) * np.maximum(r, 0.0).sum()
        row = 0.0  # elastic rows are soft
    else:
        row = float(max(r.max(), 0.0))
    return {"row": row, "eq": float(abs(q["a_eq"] @ x - q["b_eq"])),
            "box": float(max((q["xmin"] - x).max(), (x - q["xmax"]).max(), 0.0)), "obj": float(obj)}


def feasible(s):
    return s["row"] is not None and max(s["row"], s["eq"], s["box"]) <= FEAS


def run_case(job):
    name, kind = job
    ppc = load_m(case_path(name, kind))
    out = {"case": name, "kind": kind}
    ac = runopf(ppc, ACOPT)
    if not ac["success"]:
        return out
    dc = rundcopf(ppc, DCOPT)
    if not dc["success"]:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dc = rundcopf(free, DCOPT)
        if not dc["success"]:
            return out
    start, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    vlin.QP_LOG.clear()
    hist = vlin.slp(ppc, start, vf, margin=vlin.MARGIN, analytic=True, record=True)
    out["statuses"] = [x["status"] + ("/" + x["qp"] if "qp" in x else "") for x in hist]
    qps = []
    for i, q in enumerate(vlin.QP_LOG):
        rec = {"i": i, "elastic": q["elastic"], "rows": int(q["A"].shape[0]), "n": int(q["A"].shape[1])}
        rec["U"] = {"ok": q["ok_pips"], "secs": q["secs_pips"], **score(q, q["x_pips"])}
        t = time.time()
        xs, oks, passes, used = screened(q)
        rec["S"] = {"ok": oks, "secs": time.time() - t, "passes": passes, "used": used, **score(q, xs)}
        t = time.time()
        xc, okc = vlin._qp_clarabel(q["H"], q["c"], q["A"], q["u"], q["a_eq"], q["b_eq"], q["xmin"], q["xmax"],
                                    q["x0"], q["elastic"])
        rec["C"] = {"ok": okc, "secs": time.time() - t, **score(q, xc)}
        qps.append(rec)
    out["qps"] = qps
    return out


def classify(rec, a):
    """'solved' if the solver reported success and its point is feasible; 'claimed' if it reported success
    but the point breaks something by more than FEAS; 'failed' otherwise."""
    s = rec[a]
    if s["ok"]:
        return "solved" if feasible(s) else "claimed"
    return "failed"


def agree(x, y):
    return abs(x - y) <= REL * max(1.0, abs(y))


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    jobs = [(c, k) for k in KINDS for c in CASES if not only or c in only]
    rows = []
    with Pool(4) as pool:
        for r in pool.imap(run_case, jobs):
            print(r["case"], r["kind"], len(r.get("qps", [])), "QPs", flush=True)
            rows.append(r)
    L = []
    P = L.append
    P("QP audit along J-m-a's path (PIPS on the full QP, the committed path), PGLib-OPF v23.07 TYP, API, SAD.")
    P(f"U = PIPS, full QP (as run); S = PIPS by constraint generation; C = Clarabel, full QP (referee).")
    P(f"solved = reported success and feasible to {FEAS:g}; claimed = reported success, not feasible; "
      f"failed = reported failure. Objectives agree within {REL:g} relative.")
    allq = [(r, q) for r in rows for q in r.get("qps", [])]
    for el, name in ((None, "hard"), ("el", "elastic")):
        sel = [(r, q) for r, q in allq if (q["elastic"] is None) == (el is None)]
        P("")
        P(f"== {name} QPs: {len(sel)} ==")
        for a in "USC":
            cnt = {k: sum(1 for _, q in sel if classify(q, a) == k) for k in ("solved", "claimed", "failed")}
            P(f"  {a}: solved {cnt['solved']}, claimed {cnt['claimed']}, failed {cnt['failed']}; "
              f"time {sum(q[a]['secs'] for _, q in sel):.1f} s")
        uf_cs = [(r, q) for r, q in sel if classify(q, "U") != "solved" and classify(q, "C") == "solved"]
        P(f"  U not solved but C solved: {len(uf_cs)} QPs in "
          f"{len({(r['case'], r['kind']) for r, _ in uf_cs})} cases: "
          + ", ".join(sorted({f"{r['case']}/{r['kind']}" for r, _ in uf_cs})))
        uf_ss = [(r, q) for r, q in sel if classify(q, "U") != "solved" and classify(q, "S") == "solved"]
        P(f"  U not solved but S solved: {len(uf_ss)} QPs")
        cu = [(r, q) for r, q in sel if classify(q, "C") != "solved" and classify(q, "U") == "solved"]
        P(f"  C not solved but U solved: {len(cu)} QPs")
        for a in "US":
            both = [(r, q) for r, q in sel if classify(q, a) == "solved" and classify(q, "C") == "solved"]
            ag = sum(1 for _, q in both if agree(q[a]["obj"], q["C"]["obj"]))
            worse = [100 * (q[a]["obj"] - q["C"]["obj"]) / max(1.0, abs(q["C"]["obj"])) for _, q in both]
            P(f"  {a} vs C where both solved ({len(both)}): objectives agree on {ag}"
              + (f"; {a} - C, % of |obj|: max {max(worse):+.4f}, min {min(worse):+.4f}" if worse else ""))
    P("")
    P("Per case (hard QPs: U failed / C solved them; elastic QPs: count):")
    for r in rows:
        if "qps" not in r:
            P(f"  {r['case']:18s} {r['kind']:4s} no AC optimum or no start")
            continue
        h = [q for q in r["qps"] if q["elastic"] is None]
        e = [q for q in r["qps"] if q["elastic"] is not None]
        uf = sum(1 for q in h if classify(q, "U") != "solved")
        ucs = sum(1 for q in h if classify(q, "U") != "solved" and classify(q, "C") == "solved")
        P(f"  {r['case']:18s} {r['kind']:4s} hard {len(h):2d} (U not solved {uf:2d}, of which C solved {ucs:2d}); "
          f"elastic {len(e):2d}; rows {h[0]['rows'] if h else (e[0]['rows'] if e else 0):5d}; "
          f"U {sum(q['U']['secs'] for q in r['qps']):6.1f} s, S {sum(q['S']['secs'] for q in r['qps']):6.1f} s, "
          f"C {sum(q['C']['secs'] for q in r['qps']):6.1f} s")
    text = "\n".join(L) + "\n"
    if not only:
        (HERE / "audit_qp.json").write_text(json.dumps(rows, indent=0))
        (HERE / "audit_qp.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
