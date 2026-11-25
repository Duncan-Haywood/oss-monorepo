"""The method of record on the confirmation split: frozen repair, reactive stage, rule CF (research/grid-linopf).

Plan, arms and predictions M0 to M6 in LOG.md (2026-11-24, "Method of record on the confirmation split", committed
before this ran). The split is run_confirm.py's: every PGLib-OPF v23.07 case of 2,001 to 2,999 buses (33 cases).
Its 18 finishers under the method of record's first two stages are fixed by earlier, stored runs:
  J  the 10 cases the frozen repair finishes (9 on the protocol's PIPS DC start, results_confirm_parts/F_*; one,
     case2742_goc API, on the second-solver start, results_confirm_rescue_parts/F_*). Each is rerun to its first
     clean point with run_confirm._job's code (gate M0: same clean round, cost within 1e-6 relative), then the cost
     phase runs from that point exactly as run_costphase.job's held-out branch does (screen, warm start from the
     load continuation, warm_check), twice: rule CP (fallback None) and rule CF (fallback = MARGIN with cap=True).
  R  the 8 cases the frozen repair leaves only reactive-limit short and the IPOPT reactive stage makes clean
     (results_confirm_reactive_parts/*_R.json). The reactive stage is rerun at the stored best point
     (run_confirm_reactive.r_step's call: largest-PMAX-slack network, vsched.reactive_stage on IPOPT, P pinned),
     keeping the point it returns (gate M0: clean, cost within 1e-6 relative of the stored J+R cost); then CP and CF
     from that point with no warm start (the check that called it clean used none).
Nothing about the rule, rounds, boxes or acceptance changes: vlin.cost_phase with CP_ROUNDS, CP_PBOX, CP_VBOX.

Usage: OMP_NUM_THREADS=1 run_confirm_cf.py run | --summary
Writes results_confirm_cf_parts/<arm>_<case>_<kind>.json, then results_confirm_cf.json and .txt.
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
from run_enlarge_rel import pct, sign_p  # noqa: E402

PARTS = HERE / "results_confirm_cf_parts"
OUT = HERE / "results_confirm_cf"
SRC_J = {"F": HERE / "results_confirm_parts", "X": HERE / "results_confirm_rescue_parts"}
SRC_R = HERE / "results_confirm_reactive_parts"
RULES = {"CP": None, "CF": {**vlin.MARGIN, "cap": True}}


def stored_j():
    """{(start, case, kind): record} for every frozen-repair finisher of the split."""
    out = {}
    for start, d in SRC_J.items():
        for f in sorted(d.glob("F_*.json")):
            r = json.loads(f.read_text())
            if r.get("clean_at"):
                out[(start, r["case"], r["kind"])] = r
    return out


def stored_r():
    """{(start, case, kind): (best record, R record)} for every case the reactive stage makes clean."""
    out = {}
    for f in sorted(SRC_R.glob("*_R.json")):
        r = json.loads(f.read_text())
        if r.get("JR") and r["JR"].get("clean"):
            b = json.loads((SRC_R / f.name.replace("_R.json", "_best.json")).read_text())
            out[(r["arm"], r["case"], r["kind"])] = (b, r)
    return out


def part(arm, start, name, kind):
    return PARTS / f"{arm}_{start}_{name}_{kind}.json"


def _phases(p, pg, vg, c0, warm, warm_check, out):
    for rule, fb in RULES.items():
        t = time.time()
        _pg, _vg, c, recs = vlin.cost_phase(p, pg, vg, c0, margin=vlin.MARGIN, analytic=True, screen=True,
                                            solver="clarabel", warm=warm, warm_check=warm_check, fallback=fb)
        out[rule] = {"secs": time.time() - t, "cost": c["cost"], "clean": bool(c["clean"]), "rounds": recs,
                     "accepted": sum(r["status"] == "accepted" for r in recs)}


def _net(name, kind):
    from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
    from diag_slack_move import big_slack
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, _b, _k = big_slack(ppc)
    return p, float(baseline()[(name, kind)][1])


def job_j(start, name, kind):
    from infra_dcopf.vsched import file_schedule
    from run_fold import FINAL_ROUNDS, path
    import run_homotopy
    if start == "X":
        import run_dc_rescue
        dc_start = run_dc_rescue.rescue_start
    else:
        dc_start = run_homotopy.dc_start
    t0 = time.time()
    p, ac = _net(name, kind)
    out = {"arm": "J", "start": start, "case": name, "kind": kind, "ac": ac, "nbus": int(p["bus"].shape[0])}
    pg, rule = dc_start(p)
    out["start_rule"] = rule
    vf = file_schedule(p)
    pts, _ = path(p, lambda m: m * pg, vf)
    hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                    screen=True, warm=pts[-1][1], warm_check=True)
    cl = next((h for h in hist if h.get("clean")), None)
    out["repair_secs"] = time.time() - t0
    out["rerun_clean_at"] = cl["it"] if cl else None
    out["rerun_cost"] = cl["cost"] if cl else None
    if cl is not None:
        _phases(p, cl["pg"], cl["vg"], cl, pts[-1][1], True, out)
    return out


def job_r(start, name, kind):
    from infra_dcopf import ipopt_nlp
    from infra_dcopf.vsched import reactive_stage
    b, _r = stored_r()[(start, name, kind)]
    t0 = time.time()
    p, ac = _net(name, kind)
    out = {"arm": "R", "start": start, "case": name, "kind": kind, "ac": ac, "nbus": int(p["bus"].shape[0])}
    with ipopt_nlp.use_ipopt():
        rs = reactive_stage(p, np.array(b["best_pg"]))
    c0 = None if rs is None else vlin.check(p, rs[0], rs[1])
    out["repair_secs"] = time.time() - t0
    out["rerun_clean"] = bool(c0 and c0["clean"])
    out["rerun_cost"] = c0["cost"] if c0 else None
    if c0 is not None and c0["clean"]:
        _phases(p, rs[0], rs[1], c0, None, False, out)
    return out


def job(j):
    arm, start, name, kind = j
    f = part(arm, start, name, kind)
    if f.exists():
        return json.loads(f.read_text())
    t0 = time.time()
    try:
        out = (job_j if arm == "J" else job_r)(start, name, kind)
    except Exception as e:  # recorded, not hidden
        out = {"arm": arm, "start": start, "case": name, "kind": kind, "error": f"{type(e).__name__}: {e}",
               "tb": traceback.format_exc()[-2000:]}
    out["secs"] = time.time() - t0
    f.write_text(json.dumps(out, default=float))
    print(arm, start, name, kind, round(out["secs"]), out.get("error", ""), flush=True)
    return out


def jobs():
    js = [("J",) + k for k in stored_j()] + [("R",) + k for k in stored_r()]
    w = {("J",) + k: r["secs"] for k, r in stored_j().items()}
    w.update({("R",) + k: rr["secs"] for k, (_b, rr) in stored_r().items()})
    return sorted(js, key=lambda j: -w[j])  # longest first


def summary():
    SJ, SR = stored_j(), stored_r()
    L = []
    P = L.append
    P("The method of record on the confirmation split: frozen repair, reactive stage, rule CF (research/grid-linopf)")
    P("Plan and predictions M0 to M6: LOG.md 2026-11-24 (committed before this ran). Split: every PGLib-OPF v23.07 "
      "case of 2,001 to 2,999 buses (33).")
    P(f"Cost phase: CP_ROUNDS {vlin.CP_ROUNDS}, P box {vlin.CP_PBOX} of range, V box {vlin.CP_VBOX} pu; CF = CP with "
      "MARGIN cap=True on an empty margined QP only. Cost % over PGLib's published AC objective.")
    P("Arms: J = finished by the frozen repair (start F = PIPS DC, X = second-solver DC); R = finished by the IPOPT "
      "reactive stage.")
    P("")
    P("  arm st case             kind   bus  M0   clean %    +CP %    +CF %  acc CP CF  e  CF s")
    rows = []
    gate = []
    for j in sorted(jobs(), key=lambda j: (j[0], j[2], j[3])):
        arm, start, name, kind = j
        f = part(*j)
        if not f.exists():
            P(f"  {arm:3s} {start:2s} {name:16s} {kind:4s} PENDING")
            continue
        r = json.loads(f.read_text())
        if "error" in r:
            P(f"  {arm:3s} {start:2s} {name:16s} {kind:4s} ERROR {r['error']}")
            gate.append((j, False))
            continue
        if arm == "J":
            s = SJ[(start, name, kind)]
            ok = (r["rerun_clean_at"] == s["clean_at"] and r["rerun_cost"] is not None
                  and abs(r["rerun_cost"] - s["final"]["cost"]) <= 1e-6 * abs(s["final"]["cost"]))
        else:
            sc = SR[(start, name, kind)][1]["JR"]["cost"]
            ok = r["rerun_clean"] and abs(r["rerun_cost"] - sc) <= 1e-6 * abs(sc)
        gate.append((j, ok))
        if "CF" not in r:
            P(f"  {arm:3s} {start:2s} {name:16s} {kind:4s} {r['nbus']:5d} {'ok' if ok else 'NO':>3s}  no clean point")
            continue
        e = any(x["status"] == "QP infeasible" for x in r["CP"]["rounds"])
        P(f"  {arm:3s} {start:2s} {name:16s} {kind:4s} {r['nbus']:5d} {'ok' if ok else 'NO':>3s} "
          f"{pct(r['rerun_cost'], r['ac']):+9.3f} {pct(r['CP']['cost'], r['ac']):+8.3f} {pct(r['CF']['cost'], r['ac']):+8.3f}"
          f"  {r['CP']['accepted']:>5d} {r['CF']['accepted']:>2d}  {'e' if e else '.'} {r['CF']['secs']:5.0f}")
        rows.append(dict(r, ok=ok, empty=e))
    P("")
    res = {"rows": [{k: v for k, v in x.items() if k not in ("CP", "CF")} | {
        "cp": pct(x["CP"]["cost"], x["ac"]), "cf": pct(x["CF"]["cost"], x["ac"]),
        "clean_pct": pct(x["rerun_cost"], x["ac"]), "acc_cp": x["CP"]["accepted"], "acc_cf": x["CF"]["accepted"]}
        for x in rows]}
    from collections import Counter
    for rule in RULES:
        t = Counter(rr["status"] for x in rows for rr in x[rule]["rounds"])
        P(f"round outcomes, {rule}: {sum(t.values())} rounds, " + ", ".join(f"{v} {k}" for k, v in t.most_common()))
        res[f"tally_{rule}"] = dict(t)
    fbt = Counter(rr["status"] for x in rows for rr in x["CF"]["rounds"] if rr.get("fallback"))
    P(f"CF fallback trials: {sum(fbt.values())}, " + ", ".join(f"{v} {k}" for k, v in fbt.most_common()))
    P("")
    stat = {}
    for name, sel in (("J", [x for x in rows if x["arm"] == "J"]), ("R", [x for x in rows if x["arm"] == "R"]),
                      ("all", rows)):
        if not sel:
            continue
        b = np.array([pct(x["rerun_cost"], x["ac"]) for x in sel])
        cp = np.array([pct(x["CP"]["cost"], x["ac"]) for x in sel])
        cf = np.array([pct(x["CF"]["cost"], x["ac"]) for x in sel])
        lo, hi = int((cf < b - 1e-9).sum()), int((cf > b + 1e-9).sum())
        flo, fhi = int((cf < cp - 1e-9).sum()), int((cf > cp + 1e-9).sum())
        acc = sum(x["CF"]["accepted"] > 0 for x in sel)
        worse = [f"{x['case']} {x['kind']}" for x in sel
                 if x["CF"]["cost"] > x["rerun_cost"] or not x["CF"]["clean"]
                 or x["CP"]["cost"] > x["rerun_cost"] or not x["CP"]["clean"]]
        share = np.array([(u - v) / u if u > 1e-9 else 0.0 for u, v in zip(b, cf)])
        P(f"[{name}] {len(sel)} finishers: mean gap clean {b.mean():+.3f}, +CP {cp.mean():+.3f}, +CF {cf.mean():+.3f} "
          f"points; median clean {np.median(b):+.3f}, +CF {np.median(cf):+.3f}; share of the gap CF closes median "
          f"{np.median(share):.2f}")
        P(f"[{name}] CF cheaper than the clean point on {lo}, dearer on {hi}; CF against CP cheaper on {flo}, dearer on "
          f"{fhi} (sign test P = {sign_p(flo, fhi):.3f}); accepted CF step on {acc} of {len(sel)}; dearer or dirtier: "
          f"{worse or 'none'}")
        stat[name] = {"n": len(sel), "clean": b.mean(), "cp": cp.mean(), "cf": cf.mean(), "acc": acc,
                      "cf_cheaper_cp": flo, "cf_dearer_cp": fhi, "worse": worse, "share_median": float(np.median(share)),
                      "cf_median": float(np.median(cf)), "clean_median": float(np.median(b))}
    res["stat"] = stat
    P("")
    nbad = [f"{j[0]} {j[1]} {j[2]} {j[3]}" for j, ok in gate if not ok]
    P(f"M0 (gate: every rerun reproduces its stored clean point and cost): {'held' if not nbad else 'refuted'} "
      f"({len(gate) - len(nbad)} of {len(gate)}{'; ' + ', '.join(nbad) if nbad else ''})")
    a = stat.get("all")
    if a:
        cut = 0.9 * a["clean"]
        P(f"M1 (all 18: CF's mean gap at least 10 % below the clean points'): {'held' if a['cf'] <= cut else 'refuted'} "
          f"({a['cf']:+.3f} against {a['clean']:+.3f})")
        P(f"M2 (all 18: CF's mean gap no higher than CP's): {'held' if a['cf'] <= a['cp'] + 1e-12 else 'refuted'} "
          f"({a['cf']:+.3f} against {a['cp']:+.3f})")
        P(f"M3 (an accepted CF step on at least 14 of 18): {'held' if a['acc'] >= 14 else 'refuted'} ({a['acc']})")
    r = stat.get("R")
    if r:
        P(f"M4 (R arm: CF lowers the mean gap of the reactive-stage points): {'held' if r['cf'] < r['clean'] else 'refuted'}"
          f" ({r['clean']:+.3f} to {r['cf']:+.3f})")
    j = stat.get("J")
    if j:
        P(f"M5 (J arm: mean gap after CF at most +1.000 point, from the clean points' +1.322): "
          f"{'held' if j['cf'] <= 1.0 else 'refuted'} ({j['cf']:+.3f})")
    if a:
        P(f"M6 (check, by construction: no point dearer or dirtier after CP or CF): "
          f"{'held' if not a['worse'] else 'refuted'} {a['worse'] or ''}")
    P("Method of record on the split: 18 of 33 finish (10 by the repair, 8 after the reactive stage), at the CF "
      "mean gap above.")
    return "\n".join(L) + "\n", res


def main():
    PARTS.mkdir(exist_ok=True)
    if sys.argv[1:2] == ["run"]:
        with Pool(4, maxtasksperchild=1) as pool:
            pool.map(job, jobs(), chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
