"""Milestone 6 of research/grid-linopf: the larger PGLib-OPF v23.07 cases (500 to 2,000 buses) as the
second held-out set, with every rule frozen as committed and the round budget frozen at 20
(milestone 7's recommendation, fixed before any of these cases was run).

Plan and predictions in LOG.md (2026-11-13, "Held-out larger cases", committed before this ran).
Per case (TYP, API, SAD of the eight cases in HELDOUT), frozen arms as in run_perturb.py:
  AC     PIPS AC OPF, the cost reference (a case without one is excluded and counted);
  S      plain DC dispatch at the case file's setpoints;
  S+R    milestone 3's reactive stage on S's dispatch;
  J      J-m-a (vlin.slp, margin=vlin.MARGIN, analytic, Clarabel), ROUNDS = 20, QPs screened by
         constraint generation (screen=True; with the full dense QP no case with an AC optimum finished in
         25 min, every worker inside Clarabel; gated on the 34 development cases, results_vlin_margin_analytic_screen_clarabel.txt);
  J10    J's first 10 rounds (the loop is deterministic and stops at its first clean round, so this is
         the 10-round run; its best point is best_of over rounds 1 to 10);
  J+R    the reactive stage on J's best point when J is not fully clean (and J10+R likewise).
Writes results_heldout.json and results_heldout.txt. Usage: run_heldout.py [--summary | --noref] [case ...];
OMP_NUM_THREADS=1 recommended (4 worker processes)."""
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
from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule, reactive_stage  # noqa: E402
from run_perturb import cluster_boot, fully, sign_test, strip, vlin_jsonable, wilson  # noqa: E402
from run_pglib import ACOPT, DCOPT  # noqa: E402

HELDOUT = ["case500_goc", "case588_sdet", "case793_goc", "case1354_pegase", "case1803_snem",
           "case1888_rte", "case1951_rte", "case2000_goc"]
KINDS = ["typ", "api", "sad"]
ROUNDS = 20
SPLIT = 10


def reactive(ppc, b):
    if b is None or b["clean"]:
        return None
    rs = reactive_stage(ppc, b["pg"])
    return None if rs is None else strip(vlin.check(ppc, rs[0], rs[1]))


def run_case(job, noref=False):
    """One case. With noref (an after-the-run diagnostic, --noref) PIPS is skipped and the cost reference
    is PGLib's published PowerModels/IPOPT AC objective (data/pglib/BASELINE.md)."""
    name, kind = job
    t0 = time.time()
    try:
        return _run_case(name, kind, noref, t0)
    except Exception as e:  # a case the code cannot handle is reported, not allowed to stop the run
        return {"case": name, "kind": kind, "ac_ok": False, "error": f"{type(e).__name__}: {e}",
                "nbus": 0, "secs": time.time() - t0}


def _run_case(name, kind, noref, t0):
    ppc, moved = fix_ref(load_m(case_path(name, kind)))
    out = {"case": name, "kind": kind, "nbus": int(ppc["bus"].shape[0]), "nbr": int(ppc["branch"].shape[0]),
           "ngen": int(ppc["gen"].shape[0]), "ref_moved": moved}
    if noref:
        out["ac_ok"], out["ac_secs"], out["ref"] = True, 0.0, "PGLib IPOPT"
        out["ac"] = float(baseline()[(name, kind)][1])
    else:
        ac = runopf(ppc, ACOPT)
        out["ac_ok"] = bool(ac["success"])
        out["ac_secs"] = time.time() - t0
        if not ac["success"]:
            out["secs"] = time.time() - t0
            return out
        out["ac"] = float(ac["f"])
    dc = rundcopf(ppc, DCOPT)
    out["start_rule"] = "DC+ang"
    if not dc["success"]:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dc = rundcopf(free, DCOPT)
        out["start_rule"] = "DC, no ang"
        if not dc["success"]:
            out["start_rule"] = None
            out["secs"] = time.time() - t0
            return out
    start, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    out["S"] = strip(vlin.check(ppc, start, vf))
    rs = reactive_stage(ppc, start)
    out["SR"] = None if rs is None else strip(vlin.check(ppc, rs[0], rs[1]))
    t1 = time.time()
    hist = vlin.slp(ppc, start, vf, rounds=ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel", screen=True)
    out["J_secs"] = time.time() - t1
    clean_at = next((x["it"] for x in hist if x.get("clean")), None)
    base = ppc["baseMVA"]
    b = vlin.best_of(hist, base)
    b10 = vlin.best_of(hist[:SPLIT], base)
    out["J"] = {"rounds": len(hist), "clean_at": clean_at, "final": strip(b),
                "status": [x["status"] for x in hist], "qp": [x.get("qp") for x in hist]}
    out["J10"] = {"clean_at": clean_at if clean_at and clean_at <= SPLIT else None, "final": strip(b10)}
    t2 = time.time()
    out["JR"] = reactive(ppc, b)
    out["J10R"] = out["JR"] if b10 is b else reactive(ppc, b10)
    out["R_secs"] = time.time() - t2
    out["secs"] = time.time() - t0
    return out


def ok(r, arm):
    if arm == "S":
        return fully(r.get("S"))
    if arm == "SR":
        return fully(r.get("S")) or fully(r.get("SR"))
    if arm in ("J", "J10"):
        return bool(r.get(arm) and r[arm]["clean_at"])
    if arm == "JR":
        return ok(r, "J") or fully(r.get("JR"))
    if arm == "J10R":
        return ok(r, "J10") or fully(r.get("J10R"))
    if arm == "S_tha":  # H1: DC dispatch breaks a thermal, slack or angle limit in AC
        return bool(r.get("S")) and not r["S"]["p_clean"]
    raise KeyError(arm)


def cost_of(r, arm):
    c = {"J": r["J"]["final"], "JR": r["JR"] if not ok(r, "J") else r["J"]["final"],
         "J10": r["J10"]["final"]}[arm]
    return 100 * (c["cost"] / r["ac"] - 1)


ARMS = [("S", "S (DC at file setpoints)"), ("SR", "S or S+R"), ("J10", "J, 10 rounds (H2 as written)"),
        ("J10R", "J10 or J10+R"), ("J", "J, 20 rounds (frozen budget)"), ("JR", "J or J+R")]


def summary(rows):
    L = []
    P = L.append
    bl = baseline()
    P("Milestone 6 of research/grid-linopf: held-out PGLib-OPF v23.07 cases, 500 to 2,000 buses, TYP/API/SAD.")
    P("Frozen arms: S = DC dispatch at the file's setpoints; S+R = reactive stage on S; J = J-m-a (margins,")
    P(f"analytic sensitivities, Clarabel), {ROUNDS} rounds; J10 = its first {SPLIT} rounds; +R = reactive stage on")
    P("the arm's best point. 'Fully clean' = vlin.check: no branch over rating, slack inside limits, angle,")
    P("bus-voltage and unit-Q limits met. None of these cases was run by any earlier milestone.")
    P("")
    P("PIPS AC optimum against PGLib's published PowerModels/IPOPT objective (validation):")
    for r in rows:
        ref = bl.get((r["case"], r["kind"]), (np.nan, np.nan))[1]
        if r.get("error"):
            P(f"  {r['case']:16s} {r['kind']:3s} ERROR {r['error']}")
        elif r["ac_ok"]:
            P(f"  {r['case']:16s} {r['kind']:3s} {r['nbus']:5d} buses  PIPS {r['ac']:.6g}  PGLib {ref:.6g}  "
              f"diff {100 * (r['ac'] / ref - 1):+.3f} %  ({r['ac_secs']:.0f} s)")
        else:
            P(f"  {r['case']:16s} {r['kind']:3s} {r['nbus']:5d} buses  PIPS no AC optimum  PGLib {ref:.6g}")
    P("")
    use = [r for r in rows if "J" in r]
    noref = [r for r in rows if not r["ac_ok"] and not r.get("error")]
    errs = [r for r in rows if r.get("error")]
    moved = [f"{r['case']}/{r['kind']} bus {r['ref_moved'][0]} -> {r['ref_moved'][1]}" for r in rows if r.get("ref_moved")]
    if moved:
        P("Reference bus with no live unit, moved by PYPOWER's own rule (pglib.fix_ref): " + "; ".join(moved) + ".")
    if errs:
        P("Errors (not scored): " + "; ".join(f"{r['case']}/{r['kind']}" for r in errs) + ".")
    nostart = [r for r in rows if r["ac_ok"] and "J" not in r]
    P(f"Cases: {len(rows)}; no PIPS AC optimum {len(noref)}"
      + (" (" + ", ".join(f"{r['case']}/{r['kind']}" for r in noref) + ")" if noref else "")
      + f"; no DC start {len(nostart)}"
      + (" (" + ", ".join(f"{r['case']}/{r['kind']}" for r in nostart) + ")" if nostart else "")
      + f"; scored {len(use)}.")
    P("")
    P(f"{'case':16s} {'kind':4s} {'start':>10s} {'S':>4s} {'S+R':>4s} {'J10':>5s} {'J':>5s} {'J+R':>4s}  "
      f"{'J best: nOv maxLd% slkMW nAng V Q':34s} {'cost':>8s} {'J s':>6s}")
    for r in use:
        f = r["J"]["final"]
        fs = (f"{f['n_over']:3d} {100 * f['max_load']:7.2f} {f['slack_out_mw']:6.1f} {f['n_ang']:4d} {f['vviol']:3d} {f['qviol']:3d}"
              if f else "no checked round")
        cst = f"{cost_of(r, 'J'):+.3f}%" if f else "-"
        jc = r["J"]["clean_at"]
        j10 = r["J10"]["clean_at"]
        P(f"{r['case']:16s} {r['kind']:4s} {str(r['start_rule']):>10s} {'y' if ok(r, 'S') else '-':>4s} "
          f"{'y' if ok(r, 'SR') else '-':>4s} {('@' + str(j10)) if j10 else 'no':>5s} {('@' + str(jc)) if jc else 'no':>5s} "
          f"{'y' if ok(r, 'JR') else '-':>4s}  {fs:34s} {cst:>8s} {r['J_secs']:6.0f}")
    P("")
    P("Fully clean rate over scored cases (Wilson 95 %; cluster bootstrap resamples the 8 base networks):")
    res = {}
    nets = sorted({r["case"] for r in use}, key=HELDOUT.index)
    for kind in KINDS + ["all"]:
        sel = [r for r in use if kind == "all" or r["kind"] == kind]
        if not sel:
            continue
        P(f"  {kind.upper()} ({len(sel)} cases):")
        for arm, lab in ARMS:
            k = sum(ok(r, arm) for r in sel)
            n = len(sel)
            w = wilson(k, n)
            extra = ""
            if kind == "all":
                groups = [np.array([ok(r, arm) for r in sel if r["case"] == c], int) for c in nets]
                b = cluster_boot([g for g in groups if len(g)])
                extra = f"  cluster [{b[0]:.3f}, {b[1]:.3f}]"
            res[(kind, arm)] = (k, n)
            P(f"    {lab:30s} {k:3d}/{n:<3d} = {k / n:.3f}  Wilson [{w[0]:.3f}, {w[1]:.3f}]{extra}")
    P("")
    apisad = [r for r in use if r["kind"] in ("api", "sad")]
    h1 = sum(ok(r, "S_tha") for r in apisad)
    P(f"H1 / P6a: DC dispatch breaks a thermal, slack or angle limit in AC on {h1} of {len(apisad)} scored API and SAD "
      f"cases ({h1 / max(len(apisad), 1):.3f}; held >= 0.80, refuted < 0.50).")
    k10, n = res.get(("all", "J10"), (0, 0))
    P(f"H2 as written / P6b: J fully clean within 10 rounds on {k10} of {n} ({k10 / max(n, 1):.3f}; held >= 0.75, refuted < 0.50).")
    k20, _ = res.get(("all", "J"), (0, 0))
    P(f"P6c: J fully clean within 20 rounds on {k20} of {n} ({k20 / max(n, 1):.3f}; bar >= 0.75).")
    kjr, _ = res.get(("all", "JR"), (0, 0))
    P(f"P6d: J or J+R fully clean on {kjr} of {n} ({kjr / max(n, 1):.3f}; bar >= 0.85).")
    w = sum(ok(r, "JR") and not ok(r, "SR") for r in use)
    l_ = sum(ok(r, "SR") and not ok(r, "JR") for r in use)
    P(f"P6e: J+R vs S+R paired: {w} wins, {l_} losses, exact sign test P = {sign_test(w, l_):.2g} (bar: P < 0.05, no more losses than 2).")
    prem = [cost_of(r, "J") for r in use if ok(r, "J")]
    if prem:
        P(f"P6f: cost of J's fully clean points over the AC optimum: {len(prem)} points, mean {np.mean(prem):+.3f} %, "
          f"median {np.median(prem):+.3f} %, range {min(prem):+.3f} to {max(prem):+.3f} %; within 0.1 %: "
          f"{sum(p <= 0.1 for p in prem)}; bar: mean <= +0.5 %.")
    late = [r for r in use if ok(r, "J") and not ok(r, "J10")]
    P(f"Late finishers (clean in rounds 11 to 20): {len(late)}"
      + (" (" + ", ".join(f"{r['case']}/{r['kind']} @{r['J']['clean_at']}" for r in late) + ")" if late else "") + ".")
    el = sum(q == "elastic" or (q and "elastic" in q) for r in use for q in r["J"]["qp"])
    tot = sum(len(r["J"]["qp"]) for r in use)
    P(f"Rounds run: {tot}; elastic QPs among them: {el}.")
    P(f"Wall time: {sum(r['secs'] for r in rows):.0f} s summed over cases; J alone {sum(r.get('J_secs', 0) for r in rows):.0f} s, "
      f"slowest J {max((r.get('J_secs', 0) for r in rows), default=0):.0f} s.")
    return "\n".join(L) + "\n"


def run_noref(job):
    return run_case(job, noref=True)


def noref_main():
    """After-the-run diagnostic: the cases without a PIPS AC optimum, run through every arm with PGLib's
    published IPOPT objective as the cost reference. Writes results_heldout_noref.json and .txt."""
    main_rows = json.loads((HERE / "results_heldout.json").read_text())
    jobs = [(r["case"], r["kind"]) for r in main_rows if not r["ac_ok"]]
    jobs.sort(key=lambda j: -HELDOUT.index(j[0]))
    rows = []
    with Pool(4) as pool:
        for i, r in enumerate(pool.imap_unordered(run_noref, jobs), 1):
            print(f"[{i}/{len(jobs)}] {r['case']} {r['kind']} {r['secs']:.0f}s "
                  f"J={'@' + str(r['J']['clean_at']) if r.get('J') and r['J']['clean_at'] else '-'}", flush=True)
            rows.append(r)
    rows.sort(key=lambda r: (KINDS.index(r["kind"]), HELDOUT.index(r["case"])))
    (HERE / "results_heldout_noref.json").write_text(json.dumps(vlin_jsonable(rows), indent=1))
    text = ("Diagnostic after the main run (declared in LOG.md after it, not pre-registered): the held-out cases\n"
            "PIPS found no AC optimum for, run through the same frozen arms; cost reference = PGLib's published\n"
            "PowerModels.jl/IPOPT objective, so the 'PIPS vs PGLib' lines below read 0 by construction.\n\n" + summary(rows))
    (HERE / "results_heldout_noref.txt").write_text(text)
    print(text)


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    jpath = HERE / "results_heldout.json"
    if "--noref" in sys.argv:
        return noref_main()
    if "--summary" in sys.argv:
        rows = json.loads(jpath.read_text())
    else:
        jobs = [(c, k) for k in KINDS for c in HELDOUT if not only or c in only]
        jobs.sort(key=lambda j: -HELDOUT.index(j[0]))
        rows = []
        with Pool(4) as pool:
            for i, r in enumerate(pool.imap_unordered(run_case, jobs), 1):
                print(f"[{i}/{len(jobs)}] {r['case']} {r['kind']} {r['secs']:.0f}s "
                      f"J={'@' + str(r['J']['clean_at']) if r.get('J') and r['J']['clean_at'] else '-'}", flush=True)
                rows.append(r)
        rows.sort(key=lambda r: (KINDS.index(r["kind"]), HELDOUT.index(r["case"])))
        if not only:
            jpath.write_text(json.dumps(vlin_jsonable(rows), indent=1))
    text = summary(rows)
    if not only:
        (HERE / "results_heldout.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
