"""Rule CP: a post-feasibility cost phase from the first clean point (research/grid-linopf).

Plan, rule CP and predictions C0 to C6 in LOG.md (2026-11-23, "Rule CP", committed before this ran).

The repair (vlin.slp) stops at its first clean point. Rule CP (vlin.cost_phase) continues from it with up to
CP_ROUNDS hard QPs on the case's own costs inside a small box, accepting only clean, cheaper trials, so it can
only lower the cost. Two starts: F (the frozen repair) and K1 (vlin.slp(kmargin=0.05, k_first="skip"), which
reaches a clean point sooner on held-out but dearer). Each case that finishes under a start is rerun to its
clean point with the same code and protocol as its stored run (gate C0: same clean round, cost within 1e-6
relative), then the cost phase runs. Development as run_kmargin.dev_job (30 rounds, against results_converge.json
for F and results_kfirst_parts/K1_dev_* for K1); held-out as run_kmargin.held_job (20 rounds, against
results_heldout_slack.json and results_kfirst_parts/K1_held_*).

Usage: OMP_NUM_THREADS=1 run_costphase.py dev | held | --summary
Writes results_costphase_parts/<arm>_<split>_<case>_<kind>.json, then results_costphase.json and .txt.
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
import run_kmargin as rk  # noqa: E402
from run_enlarge_rel import pct, sign_p  # noqa: E402

PARTS = HERE / "results_costphase_parts"
OUT = HERE / "results_costphase"
ARMS = {"F": {}, "K1": {"kmargin": 0.05, "k_first": "skip"}}
CP_MARGIN = vlin.MARGIN  # rule CS (run_slackcap.py) sets {**MARGIN, "cap": True} and its own PARTS


def part(arm, split, name, kind):
    return PARTS / f"{arm}_{split}_{name}_{kind}.json"


def refs():
    """Stored runs per (arm, split): {(case, kind): record}."""
    dref, href = rk.refs()
    kp = HERE / "results_kfirst_parts"
    load = lambda pre: {(r["case"], r["kind"]): r for r in  # noqa: E731
                        (json.loads(f.read_text()) for f in sorted(kp.glob(f"{pre}_*.json")))}
    return {("F", "dev"): dref, ("F", "held"): href, ("K1", "dev"): load("K1_dev"), ("K1", "held"): load("K1_held")}


def _phase(p, hist, warm, split, out):
    cl = next((h for h in hist if h.get("clean")), None)
    out["rerun_clean_at"] = cl["it"] if cl else None
    out["rerun_cost"] = cl["cost"] if cl else None
    if cl is None:
        return out
    t = time.time()
    _pg, _vg, c, recs = vlin.cost_phase(p, cl["pg"], cl["vg"], cl, margin=CP_MARGIN, analytic=True,
                                        screen=split == "held", solver="clarabel", warm=warm,
                                        warm_check=split == "held")
    out.update(cp_secs=time.time() - t, cp_cost=c["cost"], cp_rounds=recs,
               cp_accepted=sum(r["status"] == "accepted" for r in recs), cp_clean=bool(c["clean"]))
    return out


def job(j):
    arm, split, name, kind = j
    f = part(arm, split, name, kind)
    if f.exists():
        return json.loads(f.read_text())
    PARTS.mkdir(exist_ok=True)
    kw = ARMS[arm]
    t0 = time.time()
    if split == "dev":
        from run_elastic import setup
        ppc, ac, start, vf = setup(name, kind)
        out = {"case": name, "kind": kind, "ac": ac}
        hist = vlin.slp(ppc, start, vf, rounds=rk.DEV_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                        **kw)
        out["repair_secs"] = time.time() - t0
        _phase(ppc, hist, None, split, out)
    else:
        from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
        from infra_dcopf.vsched import file_schedule
        from diag_slack_move import big_slack
        from run_fold import FINAL_ROUNDS, path
        from run_homotopy import dc_start
        ppc, _ = fix_ref(load_m(case_path(name, kind)))
        p, _b, _k = big_slack(ppc)
        out = {"case": name, "kind": kind, "ac": float(baseline()[(name, kind)][1])}
        pg, _rule = dc_start(p)
        vf = file_schedule(p)
        pts, _ = path(p, lambda m: m * pg, vf)
        if not pts or pts[-1][0] < 1.0:
            out["stop"] = "no power flow at mu = 1"
        else:
            hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                            screen=True, warm=pts[-1][1], warm_check=True, **kw)
            out["repair_secs"] = time.time() - t0
            _phase(p, hist, pts[-1][1], split, out)
    out["secs"] = time.time() - t0
    f.write_text(json.dumps(out, default=float))
    return out


def stored_cost(split, r):
    return rk.cost_of(split, r)


def summary():
    R = refs()
    L = []
    P = L.append
    P("Rule CP: a post-feasibility cost phase from the first clean point (research/grid-linopf)")
    P(f"Plan and predictions C0 to C6: LOG.md 2026-11-23 (committed before this ran). CP_ROUNDS {vlin.CP_ROUNDS}, "
      f"P box {vlin.CP_PBOX} of range, V box {vlin.CP_VBOX} pu.")
    P("")
    res = {}
    gate_n = gate_ok = 0
    for split in ("dev", "held"):
        got = {a: {(r["case"], r["kind"]): r for r in (json.loads(f.read_text())
                                                       for f in sorted(PARTS.glob(f"{a}_{split}_*.json")))}
               for a in ARMS}
        P(f"{'Development' if split == 'dev' else 'Held-out'}: % over PGLib's AC optimum, before -> after the cost phase")
        P("  case               kind   F@  F before   F after  acc    K1@  K1 before  K1 after  acc")
        keys = sorted(set(got["F"]) | set(got["K1"]), key=lambda k: (k[1], k[0]))
        for k in keys:
            cells = []
            for a in ARMS:
                r = got[a].get(k)
                if not r or r.get("rerun_clean_at") is None:
                    cells.append(f"{'-':>4} {'-':>9} {'-':>9} {'-':>4}")
                    continue
                cells.append(f"{r['rerun_clean_at']:>4} {pct(r['rerun_cost'], r['ac']):+9.3f} "
                             f"{pct(r['cp_cost'], r['ac']):+9.3f} {r['cp_accepted']:>4}")
            P(f"  {k[0]:18s} {k[1]:4s} {cells[0]}   {cells[1]}")
        for a in ARMS:
            rows = [r for r in got[a].values() if r.get("rerun_clean_at") is not None]
            ref = R[(a, split)]
            bad = []
            for r in got[a].values():
                s = ref.get((r["case"], r["kind"]))
                sc = stored_cost(split, s) if s else None
                ok = (s is not None and s.get("clean_at") == r.get("rerun_clean_at")
                      and (sc is None) == (r.get("rerun_cost") is None)
                      and (sc is None or abs(r["rerun_cost"] - sc) <= 1e-6 * abs(sc)))
                gate_n += 1
                gate_ok += ok
                if not ok:
                    bad.append(f"{r['case']} {r['kind']}")
            if not rows:
                continue
            before = np.array([pct(r["rerun_cost"], r["ac"]) for r in rows])
            after = np.array([pct(r["cp_cost"], r["ac"]) for r in rows])
            share = np.array([(b - x) / b if b > 1e-9 else 0.0 for b, x in zip(before, after)])
            acc = sum(r["cp_accepted"] > 0 for r in rows)
            cps = np.median([r["cp_secs"] for r in rows])
            rps = np.median([r["repair_secs"] for r in rows])
            worse = [f"{r['case']} {r['kind']}" for r in rows if r["cp_cost"] > r["rerun_cost"] or not r["cp_clean"]]
            P(f"  [{a}] {len(rows)} finishers; reproduce stored run (C0): {len(got[a]) - len(bad)} of {len(got[a])}"
              + (f", differ {bad}" if bad else ""))
            P(f"  [{a}] gap mean {before.mean():+.3f} -> {after.mean():+.3f} points, median {np.median(before):+.3f} -> "
              f"{np.median(after):+.3f}; share of gap closed median {np.median(share):.2f}, mean {share.mean():.2f}; "
              f"cases with an accepted step {acc} of {len(rows)}")
            P(f"  [{a}] median seconds: repair to first clean {rps:.1f}, cost phase {cps:.1f}; dearer or dirtier "
              f"after the phase: {worse or 'none'}")
            res[f"{a}:{split}"] = {"n": len(rows), "before": before.tolist(), "after": after.tolist(),
                                   "share": share.tolist(), "accepted": acc, "cp_secs": cps, "repair_secs": rps,
                                   "worse": worse, "keys": [f"{r['case']} {r['kind']}" for r in rows],
                                   "gate_bad": bad}
        # common finishers, held-out comparisons
        common = [k for k in keys if all(got[a].get(k, {}).get("rerun_clean_at") is not None for a in ARMS)]
        if common:
            g = lambda a, k, f: pct(got[a][k][f], got[a][k]["ac"])  # noqa: E731
            fb = np.array([g("F", k, "rerun_cost") for k in common])
            fa = np.array([g("F", k, "cp_cost") for k in common])
            kb = np.array([g("K1", k, "rerun_cost") for k in common])
            ka = np.array([g("K1", k, "cp_cost") for k in common])
            lo, hi = int((ka < fa - 1e-9).sum()), int((ka > fa + 1e-9).sum())
            P(f"  common finishers ({len(common)}): mean gap F {fb.mean():+.3f}, F+CP {fa.mean():+.3f}, K1 {kb.mean():+.3f}, "
              f"K1+CP {ka.mean():+.3f}; K1+CP cheaper than F+CP on {lo}, dearer on {hi} (sign test P = {sign_p(lo, hi):.3f})")
            res[f"common:{split}"] = {"n": len(common), "F": fb.mean(), "F+CP": fa.mean(), "K1": kb.mean(),
                                      "K1+CP": ka.mean(), "k1cp_cheaper": lo, "k1cp_dearer": hi}
        P("")
    P(f"C0 (gate: reruns reproduce the stored clean round and cost): {gate_ok} of {gate_n}")
    d = res.get("F:dev")
    if d:
        m = float(np.median(d["share"]))
        P(f"C1 (development, F: median share of the gap closed at least 0.5): {'held' if m >= 0.5 else 'refuted'} ({m:.2f})")
    c = res.get("common:held")
    if c:
        P(f"C2 (held-out common finishers: K1+CP mean gap at most F's without the phase): "
          f"{'held' if c['K1+CP'] <= c['F'] else 'refuted'} ({c['K1+CP']:+.3f} against {c['F']:+.3f})")
        P(f"C3 (held-out common finishers: K1+CP mean gap within 0.10 points of F+CP): "
          f"{'held' if c['K1+CP'] <= c['F+CP'] + 0.10 else 'refuted'} ({c['K1+CP'] - c['F+CP']:+.3f})")
    pooled = [res[k] for k in res if not k.startswith("common")]
    if pooled:
        n = sum(x["n"] for x in pooled)
        a = sum(x["accepted"] for x in pooled)
        P(f"C4 (an accepted cost step on at least 75 % of finishers, pooled): {'held' if a >= 0.75 * n else 'refuted'} "
          f"({a} of {n})")
        cp = np.median([x["cp_secs"] for x in pooled])
        rp = np.median([x["repair_secs"] for x in pooled])
        P(f"C5 (median over the four arm-splits: cost phase no slower than the repair to its first clean point): "
          f"{'held' if cp <= rp else 'refuted'} ({cp:.1f} s against {rp:.1f} s)")
        w = [x for p in pooled for x in p["worse"]]
        P(f"C6 (check, by construction: no point dearer or dirtier after the phase): {'held' if not w else 'refuted'} {w}")
        both = all(np.mean(res[f'{a}:{s}']['after']) < np.mean(res[f'{a}:{s}']['before'])
                   for a in ARMS for s in ('dev', 'held') if f'{a}:{s}' in res)
        P(f"Adoption (CP joins the method of record if it lowers the mean gap for both starts on both splits): "
          f"{'met' if both else 'not met'}")
    return "\n".join(L) + "\n", res


def main():
    PARTS.mkdir(exist_ok=True)
    R = refs()
    jobs = []
    for split in ("dev", "held"):
        if split in sys.argv:
            for a in ARMS:
                rs = [r for r in R[(a, split)].values() if r.get("clean_at") is not None]
                rs.sort(key=lambda r: -r.get("secs", 0))
                jobs += [(a, split, r["case"], r["kind"]) for r in rs]
    if jobs:
        with Pool(4, maxtasksperchild=1) as pool:
            pool.map(job, jobs, chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
