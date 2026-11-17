"""A second reference AC solver (research/grid-linopf, milestone 6 Next): IPOPT inside PYPOWER's unchanged
AC OPF (src/infra_dcopf/ipopt_nlp.py), on the 11 held-out cases PIPS cannot solve plus case300 TYP, scored
against PGLib-OPF v23.07's published PowerModels/IPOPT objective (data/pglib/BASELINE.md).

Declared after the V-first run (LOG.md 2026-11-14): PIPS stops "Numerically failed" after 12 iterations on
case1951_rte TYP at 10 %, 30 % and 100 % of load, so its failures there say nothing about feasibility.

Writes results_ipopt_ref.json / .txt. Usage: run_ipopt_ref.py [--summary] [case/kind ...]
"""
import json
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
from pypower.api import runopf  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_dcopf import ipopt_nlp  # noqa: E402
from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT  # noqa: E402

CASES = [("case300_ieee", "typ"), ("case1803_snem", "typ"), ("case1888_rte", "typ"), ("case1951_rte", "typ"),
         ("case588_sdet", "api"), ("case1354_pegase", "api"), ("case1803_snem", "api"), ("case1888_rte", "api"),
         ("case1951_rte", "api"), ("case1803_snem", "sad"), ("case1888_rte", "sad"), ("case1951_rte", "sad")]


def solve(job):
    name, kind = job
    t0 = time.time()
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    with ipopt_nlp.use_ipopt():
        r = runopf(ppc, ACOPT)
    ref = float(baseline()[(name, kind)][1])
    return {"case": name, "kind": kind, "nbus": int(ppc["bus"].shape[0]), "success": bool(r["success"]),
            "status": ipopt_nlp.LAST.get("status"), "message": ipopt_nlp.LAST.get("message"),
            "f": float(r["f"]), "pglib": ref, "gap_pct": 100 * (float(r["f"]) - ref) / ref, "secs": time.time() - t0}


def summary(rows):
    L = ["IPOPT (cyipopt 1.7, IPOPT 3.11.9, MUMPS) inside PYPOWER's AC OPF, PIPS's bound-midpoint start, tol 1e-6.",
         "Reference: PGLib-OPF v23.07 BASELINE.md AC objective (PowerModels + IPOPT).", "",
         f"{'case':16s} {'kind':4s} {'buses':>5s} {'status':>6s} {'objective':>13s} {'PGLib':>13s} {'gap %':>8s} {'s':>6s}"]
    for r in rows:
        L.append(f"{r['case']:16s} {r['kind']:4s} {r['nbus']:5d} {r['status']:6d} {r['f']:13.1f} {r['pglib']:13.1f} "
                 f"{r['gap_pct']:+8.3f} {r['secs']:6.0f}")
    ok = [r for r in rows if r["status"] == 0]
    near = [r for r in ok if abs(r["gap_pct"]) <= 0.1]
    L += ["", f"Solved (IPOPT status 0): {len(ok)} of {len(rows)}; within 0.1 % of PGLib's objective: {len(near)}"]
    return "\n".join(L) + "\n"


def main():
    jpath = HERE / "results_ipopt_ref.json"
    only = [tuple(a.split("/")) for a in sys.argv[1:] if not a.startswith("--")]
    if "--summary" in sys.argv:
        rows = json.loads(jpath.read_text())
    else:
        jobs = only or CASES
        with Pool(min(len(jobs), 4)) as pool:
            rows = []
            for r in pool.imap_unordered(solve, jobs):
                print(f"done {r['case']}/{r['kind']} status {r['status']} gap {r['gap_pct']:+.3f}% in {r['secs']:.0f}s",
                      flush=True)
                rows.append(r)
        order = {c: i for i, c in enumerate(CASES)}
        rows.sort(key=lambda r: order.get((r["case"], r["kind"]), 99))
        if only:
            print(summary(rows))
            return
        jpath.write_text(json.dumps(rows, indent=1))
    text = summary(rows)
    (HERE / "results_ipopt_ref.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
