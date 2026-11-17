"""Milestone 3 of research/grid-linopf: a voltage schedule not taken from the AC optimum.

Plan and predictions in LOG.md (2026-11-12, "Voltage schedule not from the AC optimum", written before
this ran). PGLib-OPF v23.07 TYP, API and SAD sets, 12 cases each. For each case with an AC optimum:
  start   the plain DC-MP dispatch (with angle limits; without them if that DC OPF is infeasible),
          the start rule of run_sad.py;
  O       C-ang (run_aclin.slp with angle rows, run_sad's check and merit) with every power flow at the
          AC optimum's voltage schedule: the oracle schedule all earlier results used;
  F       the same method, unchanged, with every power flow at the case file's setpoints (VG; 1.0 pu
          on every generator in PGLib), a schedule a market engine has without an AC OPF;
  F+R     F's final dispatch, then the reactive stage (src/infra_dcopf/vsched.py: AC OPF over
          voltages and Q with non-slack P pinned to the dispatch), checked at its own voltages;
  DC+R    the reactive stage applied to the start dispatch directly (no repair), a baseline.
Every final dispatch gets the full check: thermal, slack, angle, buses out of V band, units outside
Q limits, AC cost against the AC optimum. "P-clean" = thermal, slack and angle clean; "fully clean"
= P-clean with no V or Q violation. Writes experiments/results_vsched.txt and .json.
Usage: run_vsched.py [case ...]; OMP_NUM_THREADS=1 recommended (4 worker processes)."""
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
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule, opt_schedule, reactive_stage, ref_for  # noqa: E402
from run_aclin import slp  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT  # noqa: E402
from run_sad import best_of, make_check, merit_ang  # noqa: E402

KINDS = ["typ", "api", "sad"]


def strip(c):
    return None if c is None else {k: v for k, v in c.items() if k != "pg"}


def fully(c):
    return bool(c and c["clean"] and c["vviol"] == 0 and c["qviol"] == 0)


def repair(ppc, start, vg, ac):
    """C-ang at schedule vg; the AC checks read vg from ref_for(vg), the cost reference is the AC optimum."""
    full = make_check(vg)
    ref = ref_for(ppc, vg)
    chk = lambda p, pg, _a: full(p, pg, ref)  # noqa: E731
    hist = slp(ppc, start, vg, ac, angles=True, check_fn=chk, merit_fn=merit_ang)
    b = best_of(hist)
    return {"rounds": len(hist), "clean_at": next((x["it"] for x in hist if x.get("clean")), None),
            "final": strip(b), "pg": None if b is None else b["pg"]}


def stage(ppc, pg):
    rs = reactive_stage(ppc, pg)
    if rs is None:
        return {"ok": False}
    pg2, vg2, _r = rs
    c = make_check(vg2)(ppc, pg2, ref_for(ppc, vg2))
    return {"ok": True, "final": strip(c), "dp_slack_mw": float(np.abs(pg2 - pg).max())}


def run_case(job):
    name, kind = job
    ppc = load_m(case_path(name, kind))
    t0 = time.time()
    ac = runopf(ppc, ACOPT)
    out = {"case": name, "kind": kind, "ac_ok": bool(ac["success"])}
    if not ac["success"]:
        out["secs"] = time.time() - t0
        return out
    out["ac"] = float(ac["f"])
    vo, vf = opt_schedule(ppc, ac), file_schedule(ppc)
    out["vg_gap_pu"] = float(np.abs(vo - vf).max())
    dc = rundcopf(ppc, DCOPT)
    if dc["success"]:
        start = dc["gen"][:, PG].copy()
    else:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dcf = rundcopf(free, DCOPT)
        if not dcf["success"]:
            out["secs"] = time.time() - t0
            return out
        start = dcf["gen"][:, PG].copy()
    out["start_rule"] = "DC+ang" if dc["success"] else "DC, no ang"
    out["ac_self"] = strip(make_check(vo)(ppc, ac["gen"][:, PG], ref_for(ppc, vo)))
    out["start_O"] = strip(make_check(vo)(ppc, start, ref_for(ppc, vo)))
    out["start_F"] = strip(make_check(vf)(ppc, start, ref_for(ppc, vf)))
    o = repair(ppc, start, vo, ac)
    f = repair(ppc, start, vf, ac)
    out["O"] = {k: v for k, v in o.items() if k != "pg"}
    out["F"] = {k: v for k, v in f.items() if k != "pg"}
    out["FR"] = stage(ppc, f["pg"]) if f["pg"] is not None else {"ok": False}
    out["DCR"] = stage(ppc, start)
    out["secs"] = time.time() - t0
    return out


def pct(x, y):
    return 100.0 * (x / y - 1.0)


def cell(r, c):
    if c is None:
        return "PF failed"
    return (f"{c['n_over']:3d} {100 * c['max_load']:7.2f} {c['slack_out_mw']:6.1f} {c['n_ang']:4d} {c['ang_exc_deg']:6.3f} "
            f"{c['vviol']:3d} {c['qviol']:3d} {pct(c['cost'], r['ac']):+8.3f}%")


def jsonable(o):
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (np.floating, np.integer, np.bool_)):
        return o.item()
    return o


def main():
    only = sys.argv[1:]
    jobs = [(c, k) for k in KINDS for c in CASES if not only or c in only]
    with Pool(4) as pool:
        rows = []
        for r in pool.imap(run_case, jobs):
            print(r["case"], r["kind"], f"{r['secs']:.0f}s", flush=True)
            rows.append(r)
    L = []
    P = L.append
    P("PGLib-OPF v23.07 TYP, API, SAD: the successive linearisation with angle rows (C-ang) at two voltage")
    P("schedules, O = the AC optimum's (oracle) and F = the case file's (1.0 pu), then a reactive stage")
    P("(AC OPF over V and Q with non-slack P pinned) after F (F+R) and after the plain DC start (DC+R).")
    P("Cell: branches over 100 %, worst loading %, slack MW outside limits, angle-limit violations, worst")
    P("angle excess (deg), buses out of V band, units outside Q limits, AC cost vs the AC optimum.")
    hdr = f"{'nOv':>3s} {'maxLd%':>7s} {'slkMW':>6s} {'nAng':>4s} {'angExc':>6s} {'V':>3s} {'Q':>3s} {'cost':>9s}"
    for kind in KINDS:
        sel = [r for r in rows if r["kind"] == kind]
        if not sel:
            continue
        P("")
        P(f"== {kind.upper()} ==")
        P(f"{'case':18s} {'method':7s} {'status':>15s} {hdr}")
        for r in sel:
            if not r["ac_ok"]:
                P(f"{r['case']:18s} AC OPF did not converge: no reference, skipped")
                continue
            if "O" not in r:
                P(f"{r['case']:18s} no DC start")
                continue
            P(f"{r['case']:18s} {'AC opt':7s} {'':>15s} {cell(r, r['ac_self'])}")
            P(f"{r['case']:18s} {'start/O':7s} {r['start_rule']:>15s} {cell(r, r['start_O'])}")
            P(f"{r['case']:18s} {'start/F':7s} {r['start_rule']:>15s} {cell(r, r['start_F'])}")
            for m in ("O", "F"):
                x = r[m]
                st = f"clean @{x['clean_at']}" if x["clean_at"] else f"not clean ({x['rounds']})"
                P(f"{r['case']:18s} {m:7s} {st:>15s} {cell(r, x['final']) if x['final'] else 'no checked round'}")
            for m, lab in (("FR", "F+R"), ("DCR", "DC+R")):
                x = r[m]
                if not x["ok"]:
                    P(f"{r['case']:18s} {lab:7s} {'OPF failed':>15s}")
                    continue
                st = "fully clean" if fully(x["final"]) else "not clean"
                P(f"{r['case']:18s} {lab:7s} {st:>15s} {cell(r, x['final'])}")
    P("")
    P("Summary (cases with an AC optimum and a start):")
    tot = {}
    for kind in KINDS:
        sel = [r for r in rows if r["kind"] == kind and "O" in r]
        if not sel:
            continue
        n = len(sel)
        pc = lambda m: sum(1 for r in sel if r[m]["clean_at"])  # noqa: E731
        fc = lambda m: sum(1 for r in sel if r[m]["clean_at"] and fully(r[m]["final"]))  # noqa: E731
        fr = sum(1 for r in sel if r["FR"]["ok"] and fully(r["FR"]["final"]))
        fr_on_f = sum(1 for r in sel if r["F"]["clean_at"] and r["FR"]["ok"] and fully(r["FR"]["final"]))
        dcr = sum(1 for r in sel if r["DCR"]["ok"] and fully(r["DCR"]["final"]))
        prem = [pct(r["F"]["final"]["cost"], r["ac"]) for r in sel if r["F"]["clean_at"]]
        prem_fr = [pct(r["FR"]["final"]["cost"], r["ac"]) for r in sel if r["FR"]["ok"] and fully(r["FR"]["final"])]
        P(f"  {kind.upper()} ({n}): P-clean O {pc('O')}, F {pc('F')}; fully clean O {fc('O')}, F {fc('F')}; "
          f"F+R fully clean {fr} ({fr_on_f} of F's {pc('F')} P-clean); DC+R fully clean {dcr}")
        if prem:
            P(f"      F P-clean cost vs AC opt: mean {np.mean(prem):+.3f} %, range {min(prem):+.3f} to {max(prem):+.3f} %")
        if prem_fr:
            P(f"      F+R fully clean cost vs AC opt: mean {np.mean(prem_fr):+.3f} %, range {min(prem_fr):+.3f} to {max(prem_fr):+.3f} %")
        for k, v in (("n", n), ("O", pc("O")), ("F", pc("F")), ("FR", fr), ("DCR", dcr)):
            tot[k] = tot.get(k, 0) + v
    P(f"  All sets ({tot.get('n', 0)}): P-clean O {tot.get('O', 0)}, F {tot.get('F', 0)}; "
      f"F+R fully clean {tot.get('FR', 0)}; DC+R fully clean {tot.get('DCR', 0)}")
    P("Run time: " + ", ".join(f"{r['case']}/{r['kind']} {r['secs']:.0f}s" for r in rows))
    text = "\n".join(L) + "\n"
    if not only:
        (HERE / "results_vsched.json").write_text(json.dumps(jsonable(rows), indent=1))
        (HERE / "results_vsched.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
