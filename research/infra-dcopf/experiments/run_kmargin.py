"""Rule K: a curvature-aware thermal margin on rows whose AC remainder broke the rating (research/grid-linopf).

Plan, rule K and predictions K0 to K7 in LOG.md (2026-11-22, "Rule K", committed before this ran).

The case1888 API diagnosis (diag_case1888.py, K2 there) found that on every solved hard round the trial's worst
branch end was predicted by the QP's linear model at exactly its margin and landed up to 8 points over its rating:
the second-order remainder of a row the QP held. Rule K (vlin.slp(kmargin=cap)) arms such a row with its observed
remainder and pulls that row's bound in by it, decayed by 4 per halving of the boxes and capped. The frozen
repair is otherwise unchanged (no rule E, C or P). Arms: K (cap 0.05, the arm the adoption rule reads) and Ks
(cap 0.02, a sensitivity arm). Development: the 34 cases with an AC optimum, 30 rounds, run_elastic.setup's
start, as results_converge.json. Held-out: run_heldout_slack's protocol (as run_enlarge_pre.held_job), the 19
cases that reach the repair, 20 rounds, against results_heldout_slack.json.

Usage: OMP_NUM_THREADS=1 run_kmargin.py dev | held | --summary
Writes results_kmargin_parts/<arm>_<split>_<case>_<kind>.json, then results_kmargin.json and .txt.
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

from infra_dcopf import vlin  # noqa: E402
from run_enlarge_rel import DEV_REF, HELD_REF, pct, sign_p  # noqa: E402

PARTS = HERE / "results_kmargin_parts"
OUT = HERE / "results_kmargin"
DEV_ROUNDS = 30
ARMS = {"K": 0.05, "Ks": 0.02}
STALLS = [("case1354_pegase", "typ"), ("case1354_pegase", "api"), ("case1354_pegase", "sad"),
          ("case588_sdet", "sad"), ("case500_goc", "sad")]


def part(arm, split, name, kind):
    return PARTS / f"{arm}_{split}_{name}_{kind}.json"


def dev_job(job):
    from run_elastic import setup
    arm, name, kind = job
    f = part(arm, "dev", name, kind)
    if f.exists():
        return json.loads(f.read_text())
    ppc, ac, start, vf = setup(name, kind)
    t = time.time()
    kinfo = []
    hist = vlin.slp(ppc, start, vf, rounds=DEV_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                    kmargin=ARMS[arm], kinfo=kinfo)
    cl = next((h for h in hist if h.get("clean")), None)
    out = {"case": name, "kind": kind, "ac": ac, "secs": time.time() - t,
           "statuses": [h["status"] + ("/" + h["qp"] if "qp" in h else "") for h in hist],
           "clean_at": cl["it"] if cl else None, "clean_cost": cl["cost"] if cl else None, "kinfo": kinfo}
    f.write_text(json.dumps(out, default=float))
    return out


def held_job(job):
    """run_heldout_slack.phase_j's protocol with rule K; nothing else changed (as run_enlarge_pre.held_job)."""
    from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
    from infra_dcopf.vsched import file_schedule
    from diag_slack_move import big_slack
    from run_fold import FINAL_ROUNDS, path
    from run_heldout_slack import jsonable
    from run_homotopy import dc_start
    from run_perturb import strip
    arm, name, kind = job
    f = part(arm, "held", name, kind)
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
        kinfo = []
        hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                        screen=True, warm=pts[-1][1], warm_check=True, kmargin=ARMS[arm], kinfo=kinfo)
        best = vlin.best_of(hist, p["baseMVA"])
        out.update(status=[x["status"] for x in hist], qp=[x.get("qp") for x in hist],
                   clean_at=next((x["it"] for x in hist if x.get("clean")), None),
                   final=strip(best) if best else None, kinfo=kinfo)
    out["secs"] = time.time() - t0
    out = jsonable(out)
    f.write_text(json.dumps(out, default=float))
    return out


def refs():
    dref = {(r["case"], r["kind"]): r for r in json.loads(DEV_REF.read_text()) if r.get("ac_ok", True) and r.get("statuses")}
    href = {(r["case"], r["kind"]): r for r in json.loads(HELD_REF.read_text()) if "status" in r}
    return dref, href


def cost_of(split, r):
    if split == "dev":
        return r.get("clean_cost")
    return (r.get("final") or {}).get("cost") if r.get("clean_at") else None


def same_run(split, a, b):
    if split == "dev":
        return a.get("statuses") == b.get("statuses")
    return a.get("status") == b.get("status") and a.get("qp") == b.get("qp")


def tally(split, ref, got):
    out = {"n": len(ref), "frozen": 0, "K": 0, "gained": [], "lost": [], "d_rounds": [], "d_cost_pts": []}
    for k, f in ref.items():
        r = got.get(k, f)
        fc, kc = f.get("clean_at"), r.get("clean_at")
        out["frozen"] += fc is not None
        out["K"] += kc is not None
        if fc is None and kc is not None:
            out["gained"].append(f"{k[0]} {k[1]}")
        if fc is not None and kc is None:
            out["lost"].append(f"{k[0]} {k[1]}")
        if fc is not None and kc is not None:
            out["d_rounds"].append(kc - fc)
            out["d_cost_pts"].append(pct(cost_of(split, r), f["ac"]) - pct(cost_of(split, f), f["ac"]))
    return out


def summary():
    dref, href = refs()
    L = []
    P = L.append
    P("Rule K: a curvature-aware thermal margin (research/grid-linopf)")
    P("Plan, rule K and predictions K0 to K7: LOG.md 2026-11-22 (committed before this ran).")
    P("")
    res, rows = {}, {}
    for arm in ARMS:
        for split, ref, budget in (("dev", dref, DEV_ROUNDS), ("held", href, 20)):
            got = {(r["case"], r["kind"]): r for r in
                   (json.loads(f.read_text()) for f in sorted(PARTS.glob(f"{arm}_{split}_*.json")))}
            if not got:
                continue
            rows[f"{arm}:{split}"] = got
            P(f"Arm {arm} (cap {ARMS[arm]}), {'development' if split == 'dev' else 'held-out'}: {len(ref)} cases "
              f"({len(got)} run), {budget}-round budget")
            P("  case               kind  frozen@  K@   cost % over AC optimum frozen / K   rounds armed  max r")
            for key in sorted(ref, key=lambda k: (k[1], k[0])):
                f, r = ref[key], got.get(key)
                if r is None:
                    continue
                g = lambda x: "-" if x is None else f"{pct(x, f['ac']):+.3f}"  # noqa: E731
                ki = r.get("kinfo") or []
                mark = "" if f.get("clean_at") == r.get("clean_at") else "  <-"
                P(f"  {key[0]:18s} {key[1]:4s} {str(f.get('clean_at')):>7} {str(r.get('clean_at')):>4}   "
                  f"{g(cost_of(split, f)):>8} / {g(cost_of(split, r)):>8}   {len(ki):>12}  "
                  f"{max((x['r_max'] for x in ki), default=0.0):.4f}{mark}")
            inert = [k for k, r in got.items() if not r.get("kinfo") and k in ref]
            bad = [k for k in inert if not same_run(split, got[k], ref[k])]
            P(f"  gate K0 (rule never armed: equals the frozen run): {len(inert) - len(bad)} of {len(inert)}"
              + (f"; differ: {bad}" if bad else ""))
            t = tally(split, ref, got)
            dr = t["d_rounds"]
            fa, sl = sum(1 for d in dr if d < 0), sum(1 for d in dr if d > 0)
            P(f"  finishers: frozen {t['frozen']}, K {t['K']} of {t['n']}; gained {len(t['gained'])} {t['gained']}, "
              f"lost {len(t['lost'])} {t['lost']} (sign test P = {sign_p(len(t['gained']), len(t['lost'])):.3f})")
            if dr:
                cp = t["d_cost_pts"]
                P(f"  both finish ({len(dr)}): rounds K minus frozen median {np.median(dr):+.1f} (faster {fa}, slower "
                  f"{sl}, sign test P = {sign_p(fa, sl):.3f}); cost points mean {np.mean(cp):+.3f}, median "
                  f"{np.median(cp):+.3f}, range {min(cp):+.3f} to {max(cp):+.3f}")
            if split == "held":
                for key in STALLS:
                    r = got.get(key)
                    fin = (r or {}).get("final") or {}
                    P(f"    stall {key[0]} {key[1]}: clean@{(r or {}).get('clean_at')}, best point overloads "
                      f"{fin.get('n_over')}, max load {fin.get('max_load')}")
            res[f"{arm}:{split}"] = t
            P("")
    if "K:dev" in res:
        d = res["K:dev"]
        P(f"K1 (development finishers at least 31 of 34): {'held' if d['K'] >= 31 else 'refuted'} ({d['K']})")
        P(f"K2 (development: no frozen finisher lost): {'held' if not d['lost'] else 'refuted'} ({len(d['lost'])})")
        dr = d["d_rounds"]
        P(f"K3 (development, both finish: more faster than slower): "
          f"{'held' if sum(x < 0 for x in dr) > sum(x > 0 for x in dr) else 'refuted'} "
          f"({sum(x < 0 for x in dr)} faster, {sum(x > 0 for x in dr)} slower)")
        P(f"K6 (development, both finish: mean cost change at most +0.10 points): "
          f"{'held' if dr and np.mean(d['d_cost_pts']) <= 0.10 else 'refuted'} "
          f"({np.mean(d['d_cost_pts']) if dr else float('nan'):+.3f})")
    if "K:held" in res:
        h = res["K:held"]
        g = rows["K:held"]
        st = [k for k in STALLS if (g.get(k) or {}).get("clean_at")]
        P(f"K4 (held-out: at least one of the five overload stalls finishes): {'held' if st else 'refuted'} ({len(st)})")
        P(f"K5 (held-out finishers at least 10 of 19 and none lost): "
          f"{'held' if h['K'] >= 10 and not h['lost'] else 'refuted'} ({h['K']}, lost {len(h['lost'])})")
        P(f"K7 (adoption: development loses none and held-out gains more than it loses): "
          f"{'met' if 'K:dev' in res and not res['K:dev']['lost'] and len(h['gained']) > len(h['lost']) else 'not met'}")
    js = {"tally": res, **{a: list(v.values()) for a, v in rows.items()}}
    return "\n".join(L) + "\n", js


def main():
    PARTS.mkdir(exist_ok=True)
    dref, href = refs()
    jobs = []
    if "dev" in sys.argv:
        order = sorted(dref.values(), key=lambda r: -r.get("secs", 0))
        jobs += [(dev_job, (a, r["case"], r["kind"])) for a in ARMS for r in order]
    if "held" in sys.argv:
        order = sorted(href.values(), key=lambda r: -r["secs"])
        jobs += [(held_job, (a, r["case"], r["kind"])) for a in ARMS for r in order]
    if jobs:
        with Pool(4) as pool:
            pool.map(_run, jobs, chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


def _run(j):
    return j[0](j[1])


if __name__ == "__main__":
    main()
