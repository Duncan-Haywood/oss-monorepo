"""Confirmation split for rule C and rule P (research/grid-linopf).

Plan, split, adoption rule and predictions Q0 to Q6 in LOG.md (2026-11-20, "Confirmation split", committed before
this ran). The split is every PGLib-OPF v23.07 case from 2,001 to 2,999 buses (11 networks, TYP, API and SAD: 33
cases); none was used by any earlier step. Protocol: run_heldout_slack.phase_j's, unchanged (largest-PMAX slack,
DC start, load continuation, 20 rounds of the repair on Clarabel), with three arms:
  F  the frozen repair (run_fold.repair_stage's call);
  C  rule C (enlarge=2, enlarge_rel=True; run_enlarge_rel.held_job's call);
  P  rule P (rule C with enlarge_pre=True; run_enlarge_pre.held_job's call).
C and P differ from F only on a failed hard QP, so they are run only on cases whose F run has one; the rest are
counted as F (gate Q0 checks the inert reruns).

Usage: OMP_NUM_THREADS=1 run_confirm.py F | CP | --summary
Writes results_confirm_parts/<arm>_<case>_<kind>.json, then results_confirm.json and .txt.
"""
import json
import sys
import time
import traceback
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from run_enlarge_rel import held_touched, pct, sign_p  # noqa: E402

PARTS = HERE / "results_confirm_parts"
OUT = HERE / "results_confirm"
NETS = ["case2312_goc", "case2383wp_k", "case2736sp_k", "case2737sop_k", "case2742_goc", "case2746wop_k",
        "case2746wp_k", "case2848_rte", "case2853_sdet", "case2868_rte", "case2869_pegase"]
KINDS = ["typ", "api", "sad"]
CAP = 2.0
ARMS = {"F": {}, "C": {"enlarge": CAP, "enlarge_rel": True},
        "P": {"enlarge": CAP, "enlarge_rel": True, "enlarge_pre": True}}


def part(arm, name, kind):
    return PARTS / f"{arm}_{name}_{kind}.json"


def job(j):
    arm, name, kind = j
    f = part(arm, name, kind)
    if f.exists():
        return json.loads(f.read_text())
    try:
        out = _job(arm, name, kind)
    except Exception as e:  # recorded, not hidden
        out = {"case": name, "kind": kind, "arm": arm, "error": f"{type(e).__name__}: {e}",
               "tb": traceback.format_exc()[-2000:]}
    f.write_text(json.dumps(out, default=float))
    return out


def _job(arm, name, kind):
    from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
    from infra_dcopf.vsched import file_schedule
    from diag_slack_move import big_slack
    from run_fold import FINAL_ROUNDS, path
    from run_heldout_slack import jsonable
    from run_homotopy import dc_start
    from run_perturb import strip
    t0 = time.time()
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, _b, _k = big_slack(ppc)
    out = {"case": name, "kind": kind, "arm": arm, "nbus": int(p["bus"].shape[0]),
           "ac": float(baseline()[(name, kind)][1])}
    pg, rule = dc_start(p)
    out["start_rule"] = rule
    if pg is None:
        out["stop"] = "no DC start"
    else:
        vf = file_schedule(p)
        pts, _ = path(p, lambda m: m * pg, vf)
        out["mu_star"] = float(pts[-1][0]) if pts else 0.0
        if not pts or pts[-1][0] < 1.0:
            out["stop"] = "no power flow at mu = 1"
        else:
            info, trace = [], []
            kw = dict(ARMS[arm])
            if kw:
                kw.update(info=info, trace=trace)
            t1 = time.time()
            hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                            screen=True, warm=pts[-1][1], warm_check=True, **kw)
            best = vlin.best_of(hist, p["baseMVA"])
            out.update(J_secs=time.time() - t1, status=[x["status"] for x in hist], qp=[x.get("qp") for x in hist],
                       clean_at=next((x["it"] for x in hist if x.get("clean")), None),
                       final=strip(best) if best else None, enlarge=info,
                       halvings=[t["halvings"] for t in trace])
    out["secs"] = time.time() - t0
    return jsonable(out)


def load(arm):
    return {(r["case"], r["kind"]): r for r in (json.loads(f.read_text()) for f in sorted(PARTS.glob(f"{arm}_*.json")))}


def cost(r):
    return (r.get("final") or {}).get("cost") if r and r.get("clean_at") else None


def summary():
    F, C, Pr = load("F"), load("C"), load("P")
    L = []
    P = L.append
    P("Confirmation split for rule C and rule P (research/grid-linopf)")
    P("Plan, adoption rule and predictions Q0 to Q6: LOG.md 2026-11-20 (committed before this ran).")
    P("Split: every PGLib-OPF v23.07 case of 2,001 to 2,999 buses, TYP, API, SAD (33 cases), unused before.")
    P("Protocol: run_heldout_slack.phase_j's; 20 rounds; cost against PGLib's published AC objective.")
    P("C and P are rerun only where the frozen run has a failed hard QP; elsewhere they equal F by construction.")
    P("")
    errs = [k for d in (F, C, Pr) for k, r in d.items() if "error" in r]
    P(f"runs: F {len(F)}, C {len(C)}, P {len(Pr)}; errors {len(errs)}" + (f": {errs}" if errs else ""))
    reach = [k for k, r in F.items() if "status" in r]
    stops = {}
    for k, r in F.items():
        if "stop" in r:
            stops.setdefault(r["stop"], []).append(k)
    P(f"reach the repair: {len(reach)} of {len(F)}; " + "; ".join(f"{s}: {len(v)}" for s, v in stops.items()))
    touched = [k for k in reach if held_touched(F[k])]
    P(f"frozen run has a failed hard QP: {len(touched)} of {len(reach)}")
    pending = [k for k in touched if k not in C or k not in Pr]
    if pending:
        P(f"PENDING (C or P not run yet; excluded from every tally below): {len(pending)}: "
          + ", ".join(f"{n} {k}" for n, k in sorted(pending)))
        reach = [k for k in reach if k not in pending]
        touched = [k for k in touched if k not in pending]
        P(f"scored so far: {len(reach)} cases that reach the repair ({len(touched)} with a failed hard QP)")
    P("")
    P("  case               kind  bus   F@   C@   P@    cost % over AC optimum F / C / P")
    get = lambda d, k: d.get(k) if k in touched else F[k]  # noqa: E731
    gp = lambda r, ac: "-" if cost(r) is None else f"{pct(cost(r), ac):+.3f}"  # noqa: E731
    for k in sorted(reach, key=lambda k: (KINDS.index(k[1]), NETS.index(k[0]))):
        f, c, p = F[k], get(C, k), get(Pr, k)
        ca = lambda r: "?" if r is None else str(r.get("clean_at"))  # noqa: E731
        mark = "" if (ca(f) == ca(c) == ca(p)) else "  <-"
        P(f"  {k[0]:18s} {k[1]:4s} {f['nbus']:5d} {ca(f):>4} {ca(c):>4} {ca(p):>4}   "
          f"{gp(f, f['ac'])} / {gp(c, f['ac'])} / {gp(p, f['ac'])}{mark}")
    P("")
    # gate Q0: reruns on which no enlarged step was taken equal F
    for arm, d in (("C", C), ("P", Pr)):
        inert = [k for k in touched if k in d and "status" in d[k] and not any(x.get("ok") for x in d[k].get("enlarge", []))]
        bad = [k for k in inert if d[k]["status"] != F[k]["status"]]
        P(f"gate Q0 ({arm} reruns with no enlarged step equal F): {len(inert) - len(bad)} of {len(inert)}"
          + (f"; differ: {bad}" if bad else ""))
    ev = {a: [e for k in touched if k in d for e in d[k].get("enlarge", [])] for a, d in (("C", C), ("P", Pr))}
    for a in ("C", "P"):
        e = ev[a]
        P(f"  {a}: failed hard QPs {len(e)}, post-halving {sum(1 for x in e if x.get('post_halving'))}, "
          f"fired {sum(1 for x in e if x.get('fired'))}, enlarged QP solved {sum(1 for x in e if x.get('ok'))}")
    res = {"n": len(reach), "touched": len(touched), "pending": [list(k) for k in pending],
           "stops": {s: len(v) for s, v in stops.items()}}
    fin = lambda d, k: (get(d, k) or {}).get("clean_at") is not None  # noqa: E731
    for a, d in (("F", F), ("C", C), ("P", Pr)):
        res[a] = sum(fin(d, k) for k in reach)
    for a, d in (("C", C), ("P", Pr)):
        g = sum(1 for k in reach if not fin(F, k) and fin(d, k))
        lo = sum(1 for k in reach if fin(F, k) and not fin(d, k))
        both = [k for k in reach if fin(F, k) and fin(d, k)]
        dr = [get(d, k)["clean_at"] - F[k]["clean_at"] for k in both]
        dc = [pct(cost(get(d, k)), F[k]["ac"]) - pct(cost(F[k]), F[k]["ac"]) for k in both]
        fa, sl = sum(1 for x in dr if x < 0), sum(1 for x in dr if x > 0)
        res[a + "_vs_F"] = {"gained": g, "lost": lo, "both": len(both), "faster": fa, "slower": sl,
                            "d_cost_mean": float(np.mean(dc)) if dc else None,
                            "d_round_median": float(np.median(dr)) if dr else None}
        P(f"{a} against F: finishers {res[a]} vs {res['F']} of {len(reach)}; gained {g}, lost {lo} "
          f"(sign test P = {sign_p(g, lo):.3f}); both finish {len(both)}"
          + (f": rounds median {np.median(dr):+.1f} (faster {fa}, slower {sl}, sign test P = {sign_p(fa, sl):.3f}), "
             f"cost points mean {np.mean(dc):+.3f}" if dr else ""))
    gpc = sum(1 for k in reach if not fin(C, k) and fin(Pr, k))
    lpc = sum(1 for k in reach if fin(C, k) and not fin(Pr, k))
    res["P_vs_C"] = {"gained": gpc, "lost": lpc}
    P(f"P against C: gained {gpc}, lost {lpc}")
    P("")
    pf, cf = res["P_vs_F"], res["C_vs_F"]
    nreach = sum(1 for r in F.values() if "status" in r)
    P(f"Q1 (at least 17 of 33 reach the repair): {'held' if nreach >= 17 else 'refuted'} ({nreach})")
    if pending:
        P(f"Q2 to Q6 and the adoption rule below are on the {len(reach)} scored cases only; final once the "
          f"{len(pending)} pending cases have run.")
    P(f"Q2 (rule P finishers at least F's): {'held' if res['P'] >= res['F'] else 'refuted'} ({res['P']} vs {res['F']})")
    P(f"Q3 (rule P loses no F finisher): {'held' if pf['lost'] == 0 else 'refuted'} ({pf['lost']})")
    P(f"Q4 (rule P gains at least one case over F): {'held' if pf['gained'] >= 1 else 'refuted'} ({pf['gained']})")
    P(f"Q5 (rule P finishers at least rule C's): {'held' if res['P'] >= res['C'] else 'refuted'} ({res['P']} vs {res['C']})")
    q6 = pf["d_cost_mean"]
    P(f"Q6 (common finishers: P's mean cost change against F within 0.5 points): "
      f"{'held' if q6 is not None and abs(q6) <= 0.5 else 'refuted' if q6 is not None else 'untestable'} "
      f"({'-' if q6 is None else f'{q6:+.3f}'})")
    adopt = pf["gained"] > pf["lost"] and res["P"] >= res["C"]
    adopt_c = (not adopt) and cf["gained"] > cf["lost"]
    verdict = "rule P replaces the frozen repair" if adopt else "rule C replaces the frozen repair" if adopt_c \
        else "the frozen repair stays"
    res["verdict"] = verdict
    P(f"Adoption rule (fixed before the run): {verdict}")
    rows = {a: list(d.values()) for a, d in (("F", F), ("C", C), ("P", Pr))}
    return "\n".join(L) + "\n", {"tally": res, **rows}


def main():
    PARTS.mkdir(exist_ok=True)
    big = sorted(NETS, key=lambda n: -int(n[4:8]))
    if "F" in sys.argv:
        with Pool(4) as pool:
            pool.map(job, [("F", n, k) for n in big for k in KINDS], chunksize=1)
    if "CP" in sys.argv:
        F = load("F")
        jobs = [(a, n, k) for n in big for k in KINDS for a in ("C", "P")
                if (n, k) in F and "status" in F[(n, k)] and held_touched(F[(n, k)])]
        with Pool(4) as pool:
            pool.map(job, jobs, chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
