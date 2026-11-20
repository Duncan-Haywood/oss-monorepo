"""Rule P: rule C, with the enlarged step tried only before the first halving (research/grid-linopf).

Plan, rule P and predictions P0 to P6 in LOG.md (2026-11-20, "Rule P", committed before this ran).

The case1888 API diagnosis (diag_case1888.py) found rule C's loss there is a budget miss, not a stall, and that
withholding any one of its three firings finishes the case; the round-5 firing is the only one taken after a
halving. Rule P keeps rule C's firings while the boxes are unhalved and sends every later failed hard QP to the
elastic chain (enlarge_pre=True in vlin.slp and converge.traced_slp). Same cases and protocol as
run_enlarge_rel.py, compared with the frozen runs and rule C's (results_enlarge_rel.json). case1888 API is
where the rule came from, so the held-out tally is also given without it.

Usage: OMP_NUM_THREADS=1 run_enlarge_pre.py dev | held | --summary
Writes results_enlarge_pre_parts/<arm>_<case>_<kind>.json, then results_enlarge_pre.json and .txt.
"""
import json
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402

from infra_dcopf import converge, vlin  # noqa: E402
from run_enlarge_rel import DEV_REF, HELD_REF, dev_touched, held_touched, pct, sign_p  # noqa: E402

PARTS = HERE / "results_enlarge_pre_parts"
OUT = HERE / "results_enlarge_pre"
C_PARTS = HERE / "results_enlarge_rel_parts"
DEV_ROUNDS = 30
CAP = 2.0
ORIGIN = ("case1888_rte", "api")


def part(arm, name, kind):
    return PARTS / f"{arm}_{name}_{kind}.json"


def dev_job(job):
    from run_elastic import setup
    arm, name, kind = job
    f = part(arm, name, kind)
    if f.exists():
        return json.loads(f.read_text())
    ppc, ac, start, vf = setup(name, kind)
    t = time.time()
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=DEV_ROUNDS, enlarge=CAP, enlarge_rel=True,
                                       enlarge_pre=True)
    cl = next((h for h in hist if h.get("clean")), None)
    out = {"case": name, "kind": kind, "ac": ac, "secs": time.time() - t,
           "statuses": [h["status"] + ("/" + h["qp"] if "qp" in h else "") for h in hist],
           "clean_at": cl["it"] if cl else None, "clean_cost": cl["cost"] if cl else None,
           "enlarge": [{"it": tr["it"], "halvings": tr["halvings"], **tr["enlarge"]} for tr in trace if "enlarge" in tr]}
    f.write_text(json.dumps(out, default=float))
    return out


def held_job(job):
    """run_heldout_slack.phase_j's protocol with rule P; nothing else changed (as run_enlarge_rel.held_job)."""
    from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
    from infra_dcopf.vsched import file_schedule
    from diag_slack_move import big_slack
    from run_fold import FINAL_ROUNDS, path
    from run_heldout_slack import jsonable
    from run_homotopy import dc_start
    from run_perturb import strip
    arm, name, kind = job
    f = part(arm, name, kind)
    if f.exists():
        return json.loads(f.read_text())
    t0 = time.time()
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, _b, _k = big_slack(ppc)
    out = {"case": name, "kind": kind, "ac": float(baseline()[(name, kind)][1])}
    pg, _rule = dc_start(p)
    vf = file_schedule(p)
    pts, _ = path(p, lambda m: m * pg, vf)
    if not pts or pts[-1][0] < 1.0:
        out["stop"] = "no power flow at mu = 1"
    else:
        info, trace = [], []
        hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                        screen=True, warm=pts[-1][1], warm_check=True, enlarge=CAP, info=info, trace=trace,
                        enlarge_rel=True, enlarge_pre=True)
        best = vlin.best_of(hist, p["baseMVA"])
        out.update(status=[x["status"] for x in hist], qp=[x.get("qp") for x in hist],
                   clean_at=next((x["it"] for x in hist if x.get("clean")), None),
                   final=strip(best) if best else None, enlarge=info,
                   halvings=[t["halvings"] for t in trace])
    out["secs"] = time.time() - t0
    out = jsonable(out)
    f.write_text(json.dumps(out, default=float))
    return out


def tally(ref, got, cref, arm, skip=()):
    """Finishers and paired changes, rule P against the frozen run and against rule C."""
    keys = [k for k in ref if k not in skip]
    cost = (lambda x: x.get("clean_cost")) if arm == "dev" else (lambda x: (x.get("final") or {}).get("cost"))
    out = {"n": len(keys), "frozen": 0, "C": 0, "P": 0, "gained": 0, "lost": 0, "gained_vs_C": 0, "lost_vs_C": 0,
           "d_rounds": [], "d_cost_pts": []}
    for k in keys:
        f = ref[k]
        fc = f.get("clean_at")
        c = cref.get(k)
        cc = c.get("clean_at") if c else fc
        r = got.get(k)
        pc = r.get("clean_at") if r else fc
        out["frozen"] += fc is not None
        out["C"] += cc is not None
        out["P"] += pc is not None
        out["gained"] += fc is None and pc is not None
        out["lost"] += fc is not None and pc is None
        out["gained_vs_C"] += cc is None and pc is not None
        out["lost_vs_C"] += cc is not None and pc is None
        if fc is not None and pc is not None:
            out["d_rounds"].append(pc - fc)
            pcost = cost(r) if r else cost(f)
            out["d_cost_pts"].append(pct(pcost, f["ac"]) - pct(cost(f), f["ac"]))
    return out


def summary():
    dref = {(r["case"], r["kind"]): r for r in json.loads(DEV_REF.read_text()) if r.get("ac_ok", True) and r.get("statuses")}
    href = {(r["case"], r["kind"]): r for r in json.loads(HELD_REF.read_text()) if "status" in r}
    L = []
    P = L.append
    P("Rule P: rule C with the enlarged step only before the first halving (research/grid-linopf)")
    P("Plan, rule P and predictions P0 to P6: LOG.md 2026-11-20 (committed before this ran).")
    P("Cases whose frozen run has no failed hard QP are identical by construction (not rerun, counted as frozen).")
    P("")
    res, rows_by = {}, {}
    for arm, ref, budget in (("dev", dref, DEV_ROUNDS), ("held", href, 20)):
        got = {(r["case"], r["kind"]): r for r in (json.loads(f.read_text()) for f in sorted(PARTS.glob(f"{arm}_*.json")))}
        if not got:
            continue
        cref = {(r["case"], r["kind"]): r for r in (json.loads(f.read_text()) for f in sorted(C_PARTS.glob(f"{arm}_*.json")))}
        rows_by[arm] = got
        skey = "statuses" if arm == "dev" else "status"
        P(f"{'Development' if arm == 'dev' else 'Held-out'}: {len(ref)} cases ({len(got)} rerun), {budget}-round budget")
        ev = [e for r in got.values() for e in r.get("enlarge", [])]
        P(f"  failed hard QPs {len(ev)}; post-halving (sent to the elastic chain) {sum(1 for e in ev if e.get('post_halving'))}; "
          f"fired {sum(1 for e in ev if e.get('fired'))}; enlarged hard QP solved {sum(1 for e in ev if e.get('ok'))}")
        P("  case               kind   frozen@  C@   P@    cost% over AC optimum frozen / C / P")
        cost = (lambda x: x.get("clean_cost")) if arm == "dev" else (lambda x: (x.get("final") or {}).get("cost") if x.get("clean_at") else None)
        for key in sorted(got, key=lambda k: (k[1], k[0])):
            f, r, c = ref[key], got[key], cref.get(key)
            fc, pc = f.get("clean_at"), r.get("clean_at")
            cc = c.get("clean_at") if c else fc
            gp = lambda x: "-" if x is None else f"{pct(x, f['ac']):+.3f}"  # noqa: E731
            mark = "" if fc == pc else "  <-"
            P(f"  {key[0]:18s} {key[1]:4s} {str(fc):>7} {str(cc):>4} {str(pc):>4}   "
              f"{gp(cost(f))} / {gp(cost(c) if c else cost(f))} / {gp(cost(r))}{mark}")
        # gate P0: where rule C fired only before any halving and never met a post-halving failed hard QP,
        # rule P equals rule C (dev, where C's parts store halvings)
        if arm == "dev":
            same = [k for k in got if k in cref and cref[k].get("enlarge")
                    and all(x.get("halvings", 0) == 0 for x in cref[k]["enlarge"])]
            bad = [k for k in same if got[k].get(skey) != cref[k].get(skey)]
            P(f"  gate P0 (rule C met failed hard QPs only before any halving: equals rule C's run): "
              f"{len(same) - len(bad)} of {len(same)}" + (f"; differ: {bad}" if bad else ""))
        inert = [k for k, r in got.items() if not any(x.get("ok") for x in r.get("enlarge", []))]
        bad = [k for k in inert if got[k].get(skey) != ref[k].get(skey)]
        P(f"  gate (no enlarged step taken: equals the frozen run): {len(inert) - len(bad)} of {len(inert)}"
          + (f"; differ: {bad}" if bad else ""))
        for label, skip in (("all", ()), ("without case1888 API", (ORIGIN,))) if arm == "held" else (("all", ()),):
            t = tally(ref, got, cref, arm, skip)
            dr = t["d_rounds"]
            fa, sl = sum(1 for d in dr if d < 0), sum(1 for d in dr if d > 0)
            P(f"  finishers ({label}, {t['n']} cases): frozen {t['frozen']}, rule C {t['C']}, rule P {t['P']}; "
              f"P against frozen: gained {t['gained']}, lost {t['lost']} (sign test P = {sign_p(t['gained'], t['lost']):.3f}); "
              f"P against C: gained {t['gained_vs_C']}, lost {t['lost_vs_C']}")
            if dr:
                P(f"    both finish ({len(dr)}): rounds P minus frozen median {np.median(dr):+.1f} (faster {fa}, slower {sl}, "
                  f"sign test P = {sign_p(fa, sl):.3f}); cost points mean {np.mean(t['d_cost_pts']):+.3f}")
            res[f"{arm}:{label}"] = t
        P("")
    if "dev:all" in res:
        d = res["dev:all"]
        c73 = rows_by["dev"].get(("case73_ieee_rts", "api"))
        P(f"P2 (case73 API fully clean within 30 rounds): {'held' if c73 and c73.get('clean_at') else 'refuted'}"
          f" ({c73.get('clean_at') if c73 else None})")
        P(f"P3 (development finishers at least 32 of 34): {'held' if d['P'] >= 32 else 'refuted'} ({d['P']})")
        P(f"P4 (development: no frozen finisher lost): {'held' if d['lost'] == 0 else 'refuted'} ({d['lost']})")
    if "held:all" in res:
        h, h1 = res["held:all"], res["held:without case1888 API"]
        o = rows_by["held"].get(ORIGIN)
        P(f"P1 (case1888 API fully clean within 20 rounds): {'held' if o and o.get('clean_at') else 'refuted'}"
          f" ({o.get('clean_at') if o else None})")
        P(f"P5 (held-out finishers at least 11 of 19): {'held' if h['P'] >= 11 else 'refuted'} ({h['P']})")
        P(f"P6 (held-out without case1888 API: at least 10 of 18, rule C's count): {'held' if h1['P'] >= 10 else 'refuted'} ({h1['P']})")
    return "\n".join(L) + "\n", {"tally": res, **{a: list(v.values()) for a, v in rows_by.items()}}


def main():
    PARTS.mkdir(exist_ok=True)
    if "dev" in sys.argv:
        ref = [r for r in json.loads(DEV_REF.read_text()) if r.get("statuses") and dev_touched(r)]
        ref.sort(key=lambda r: -r.get("secs", 0))
        with Pool(4) as pool:
            pool.map(dev_job, [("dev", r["case"], r["kind"]) for r in ref], chunksize=1)
    if "held" in sys.argv:
        ref = [r for r in json.loads(HELD_REF.read_text()) if "status" in r and held_touched(r)]
        ref.sort(key=lambda r: -r["secs"])
        with Pool(4) as pool:
            pool.map(held_job, [("held", r["case"], r["kind"]) for r in ref], chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
