"""Milestone 3b of research/grid-linopf: generator voltage setpoints as decision variables in the repair.

Plan and predictions in LOG.md (2026-11-12, "Voltage setpoints as decision variables", committed
before this ran). PGLib-OPF v23.07 TYP, API and SAD, 12 cases each. For each case with an AC optimum:
  start  the plain DC-MP dispatch (with angle limits; without them if that DC OPF is infeasible) at
         the case file's voltage setpoints (1.0 pu), milestone 3's start;
  J      src/infra_dcopf/vlin.slp: successive linearisation over P and the voltage setpoints, with
         thermal, slack, angle, bus-voltage and Q rows, up to 10 rounds, stop when fully clean;
  J+R    when J is not fully clean, milestone 3's reactive stage (vsched.reactive_stage) on J's best
         dispatch, checked at its own voltages.
Baselines F, F+R and O are read from results_vsched.json (same start, deterministic).
Every point gets vlin.check (thresholds as milestone 3). Writes results_vlin.txt and .json.
With --margin it runs variant J-m instead (vlin.MARGIN: bounds pulled inside their limits; plan in
LOG.md, written after J's results) and writes results_vlin_margin.txt and .json.
With --analytic (milestone 2, plan in LOG.md 2026-11-13) the sensitivities come from the power-flow
Jacobian (vlin.jacobian_sens) instead of finite differences; outputs get the suffix _analytic and a
case-by-case comparison with the finite-difference run of the same variant.
Usage: run_vlin.py [--margin] [--analytic] [case ...]; OMP_NUM_THREADS=1 recommended (4 worker processes)."""
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
from infra_dcopf.vsched import file_schedule, reactive_stage  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT  # noqa: E402

KINDS = ["typ", "api", "sad"]
MARGIN = "--margin" in sys.argv
ANALYTIC = "--analytic" in sys.argv


def strip(c):
    return None if c is None else {k: v for k, v in c.items() if k not in ("pg", "vg")}


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
    dc = rundcopf(ppc, DCOPT)
    if not dc["success"]:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dc = rundcopf(free, DCOPT)
        out["start_rule"] = "DC, no ang"
        if not dc["success"]:
            out["secs"] = time.time() - t0
            return out
    else:
        out["start_rule"] = "DC+ang"
    start, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    out["start"] = strip(vlin.check(ppc, start, vf))
    t1 = time.time()
    pf0 = vlin.PF_COUNT[0]
    hist = vlin.slp(ppc, start, vf, margin=vlin.MARGIN if MARGIN else None, analytic=ANALYTIC)
    out["J_secs"] = time.time() - t1
    out["J_pf"] = vlin.PF_COUNT[0] - pf0
    b = vlin.best_of(hist, ppc["baseMVA"])
    out["J"] = {"rounds": len(hist), "clean_at": next((x["it"] for x in hist if x.get("clean")), None),
                "p_clean_at": next((x["it"] for x in hist if x.get("p_clean")), None),
                "statuses": [x["status"] + ("/" + x["qp"] if "qp" in x else "") for x in hist],
                "final": strip(b),
                "vg_range": None if b is None else [float(b["vg"].min()), float(b["vg"].max())]}
    if b is not None and not b["clean"]:
        rs = reactive_stage(ppc, b["pg"])
        if rs is None:
            out["JR"] = {"ok": False}
        else:
            pg2, vg2, _r = rs
            out["JR"] = {"ok": True, "final": strip(vlin.check(ppc, pg2, vg2))}
    out["secs"] = time.time() - t0
    return out


def pct(x, y):
    return 100.0 * (x / y - 1.0)


def cell(r, c):
    if c is None:
        return "PF failed"
    return (f"{c['n_over']:3d} {100 * c['max_load']:7.2f} {c['slack_out_mw']:6.1f} {c['n_ang']:4d} {c['ang_exc_deg']:6.3f} "
            f"{c['vviol']:3d} {c['qviol']:3d} {pct(c['cost'], r['ac']):+8.3f}%")


def fully_old(c):
    return bool(c and c["clean"] and c["vviol"] == 0 and c["qviol"] == 0)


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


def compare_fd(rows, L):
    """Milestone 2: analytic-sensitivity run against the finite-difference run of the same variant."""
    P = L.append
    fdpath = HERE / ("results_vlin_margin.json" if MARGIN else "results_vlin.json")
    if not fdpath.exists():
        return
    fd = {(r["case"], r["kind"]): r for r in json.loads(fdpath.read_text())}
    P("")
    P(f"Analytic (A) against finite-difference (FD) sensitivities, same variant ({fdpath.name}):")
    P(f"{'case':18s} {'kind':4s} {'FD':>10s} {'A':>10s} {'FD+R':>6s} {'A+R':>6s} {'dCost pp':>9s} "
      f"{'FD s':>7s} {'A s':>7s} {'A PFs':>6s}")
    agg = {"fd": 0, "a": 0, "fdr": 0, "ar": 0, "same": 0, "n": 0, "fds": 0.0, "as": 0.0, "apf": 0}
    dcost = []
    for r in rows:
        f = fd.get((r["case"], r["kind"]))
        if "J" not in r or not f or "J" not in f:
            continue
        def st(x):
            return f"@{x['J']['clean_at']}" if x["J"]["clean_at"] else "no"
        def jr(x):
            return bool(x["J"]["clean_at"] or (x.get("JR", {}).get("ok") and x["JR"]["final"] and x["JR"]["final"]["clean"]))
        dc = ""
        if r["J"]["clean_at"] and f["J"]["clean_at"]:
            d = pct(r["J"]["final"]["cost"], r["ac"]) - pct(f["J"]["final"]["cost"], f["ac"])
            dcost.append(d)
            dc = f"{d:+.4f}"
        P(f"{r['case']:18s} {r['kind']:4s} {st(f):>10s} {st(r):>10s} {str(jr(f)):>6s} {str(jr(r)):>6s} {dc:>9s} "
          f"{f.get('J_secs', 0):7.1f} {r['J_secs']:7.1f} {r.get('J_pf', 0):6d}")
        agg["n"] += 1
        agg["fd"] += bool(f["J"]["clean_at"])
        agg["a"] += bool(r["J"]["clean_at"])
        agg["fdr"] += jr(f)
        agg["ar"] += jr(r)
        agg["same"] += bool(f["J"]["clean_at"]) == bool(r["J"]["clean_at"])
        agg["fds"] += f.get("J_secs", 0.0)
        agg["as"] += r["J_secs"]
        agg["apf"] += r.get("J_pf", 0)
    P(f"  {agg['n']} cases: fully clean FD {agg['fd']}, A {agg['a']} (same verdict on {agg['same']}); "
      f"with the reactive stage FD {agg['fdr']}, A {agg['ar']}")
    if dcost:
        P(f"  cost difference A - FD where both fully clean ({len(dcost)}): max |d| {max(abs(x) for x in dcost):.4f} pp, "
          f"mean {np.mean(dcost):+.4f} pp")
    P(f"  repair time (J only, summed): FD {agg['fds']:.0f} s, A {agg['as']:.0f} s ({agg['fds'] / max(agg['as'], 1e-9):.1f}x); "
      f"A ran {agg['apf']} AC power flows in its repairs")


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    jobs = [(c, k) for k in KINDS for c in CASES if not only or c in only]
    with Pool(4) as pool:
        rows = []
        for r in pool.imap(run_case, jobs):
            print(r["case"], r["kind"], f"{r['secs']:.0f}s", flush=True)
            rows.append(r)
    old = {(r["case"], r["kind"]): r for r in json.loads((HERE / "results_vsched.json").read_text())}
    L = []
    P = L.append
    P("PGLib-OPF v23.07 TYP, API, SAD from the case-file start (plain DC dispatch, 1.0 pu setpoints):")
    P("J = successive linearisation over P and the generator voltage setpoints (vlin.slp); J+R = milestone 3's")
    if MARGIN:
        P("VARIANT J-m: every QP bound pulled inside its limit by vlin.MARGIN = " + json.dumps(vlin.MARGIN)
          + " (exploratory: chosen after J's results on these cases).")
    P("reactive stage on J's best dispatch when J is not fully clean. Baselines from results_vsched.txt:")
    P("F = P-only repair at 1.0 pu, F+R = F then the reactive stage, O = P-only repair at the AC optimum's schedule.")
    P("Cell: branches over 100 %, worst loading %, slack MW outside limits, angle-limit violations, worst")
    P("angle excess (deg), buses out of V band, units outside Q limits, AC cost vs the AC optimum.")
    hdr = f"{'nOv':>3s} {'maxLd%':>7s} {'slkMW':>6s} {'nAng':>4s} {'angExc':>6s} {'V':>3s} {'Q':>3s} {'cost':>9s}"
    for kind in KINDS:
        sel = [r for r in rows if r["kind"] == kind]
        if not sel:
            continue
        P("")
        P(f"== {kind.upper()} ==")
        P(f"{'case':18s} {'method':7s} {'status':>16s} {hdr}")
        for r in sel:
            if not r["ac_ok"]:
                P(f"{r['case']:18s} AC OPF did not converge: no reference, skipped")
                continue
            if "J" not in r:
                P(f"{r['case']:18s} no DC start")
                continue
            P(f"{r['case']:18s} {'start':7s} {r['start_rule']:>16s} {cell(r, r['start'])}")
            j = r["J"]
            st = f"clean @{j['clean_at']}" if j["clean_at"] else f"not clean ({j['rounds']})"
            P(f"{r['case']:18s} {'J':7s} {st:>16s} {cell(r, j['final']) if j['final'] else 'no checked round'}")
            if "JR" in r:
                x = r["JR"]
                if not x["ok"]:
                    P(f"{r['case']:18s} {'J+R':7s} {'OPF failed':>16s}")
                else:
                    st = "fully clean" if x["final"] and x["final"]["clean"] else "not clean"
                    P(f"{r['case']:18s} {'J+R':7s} {st:>16s} {cell(r, x['final'])}")
            o = old.get((r["case"], r["kind"]))
            if o and "FR" in o:
                fr = o["FR"]
                st = "OPF failed" if not fr["ok"] else ("fully clean" if fully_old(fr["final"]) else "not clean")
                P(f"{r['case']:18s} {'(F+R)':7s} {st:>16s} " + (cell(r, fr["final"]) if fr["ok"] else ""))
    P("")
    P("Summary (cases with an AC optimum and a start):")
    tot = {}
    secs_j = []
    for kind in KINDS:
        sel = [r for r in rows if r["kind"] == kind and "J" in r]
        if not sel:
            continue
        n = len(sel)
        jf = [r for r in sel if r["J"]["clean_at"]]
        jp = sum(1 for r in sel if r["J"]["final"] and r["J"]["final"]["p_clean"])
        jr = sum(1 for r in sel if "JR" in r and r["JR"]["ok"] and r["JR"]["final"] and r["JR"]["final"]["clean"])
        ol = [old.get((r["case"], r["kind"]), {}) for r in sel]
        fr = sum(1 for o in ol if o.get("FR", {}).get("ok") and fully_old(o["FR"]["final"]))
        of = sum(1 for o in ol if o.get("O", {}).get("clean_at") and fully_old(o["O"]["final"]))
        fp = sum(1 for o in ol if o.get("F", {}).get("clean_at"))
        P(f"  {kind.upper()} ({n}): J fully clean {len(jf)} (P-clean {jp}); J or J+R fully clean {len(jf) + jr}; "
          f"baselines: F P-clean {fp}, F+R fully clean {fr}, O fully clean {of}")
        if jf:
            prem = [pct(r["J"]["final"]["cost"], r["ac"]) for r in jf]
            P(f"      J fully clean cost vs AC opt: mean {np.mean(prem):+.3f} %, median {np.median(prem):+.3f} %, "
              f"range {min(prem):+.3f} to {max(prem):+.3f} %; clean at rounds {sorted(r['J']['clean_at'] for r in jf)}")
        for k, v in (("n", n), ("J", len(jf)), ("JR", jr), ("FR", fr), ("O", of)):
            tot[k] = tot.get(k, 0) + v
        secs_j += [r["secs"] for r in sel]
    P(f"  All sets ({tot.get('n', 0)}): J fully clean {tot.get('J', 0)}; J+R adds {tot.get('JR', 0)}; "
      f"F+R fully clean {tot.get('FR', 0)}; O (oracle schedule) fully clean {tot.get('O', 0)}")
    ms3 = sum(o.get("secs", 0.0) for o in old.values())
    P(f"  Run time, all cases: this script {sum(r['secs'] for r in rows):.0f} s (milestone 3's run_vsched: {ms3:.0f} s, "
      f"which also ran the O arm and two reactive stages)")
    P("Run time: " + ", ".join(f"{r['case']}/{r['kind']} {r['secs']:.0f}s" for r in rows))
    if ANALYTIC:
        compare_fd(rows, L)
    text = "\n".join(L) + "\n"
    if not only:
        tag = ("results_vlin_margin" if MARGIN else "results_vlin") + ("_analytic" if ANALYTIC else "")
        (HERE / f"{tag}.json").write_text(json.dumps(jsonable(rows), indent=1))
        (HERE / f"{tag}.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
