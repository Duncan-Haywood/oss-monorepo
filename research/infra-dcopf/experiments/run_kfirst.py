"""Rules K1 and Kr: rule K without the unboxed round 1's remainder (research/grid-linopf).

Plan, rules and predictions F0 to F7 in LOG.md (2026-11-22, "Rules K1 and Kr", committed before this ran).

Rule K (run_kmargin.py) lost development case240 SAD because rows armed on round 1, whose P step has no box, carry a
margin at its cap through the boxed rounds after it. Rule K1 (vlin.slp(k_first="skip")) never arms on round 1;
rule Kr (k_first="scale") arms on round 1 with the remainder divided by s^2, s = max |dP| / first P box when s > 1.
Both cap 0.05, otherwise exactly rule K. Development and held-out as run_kmargin.py, against the frozen repair
(results_converge.json, results_heldout_slack.json) and rule K (results_kmargin_parts/K_*).

Usage: OMP_NUM_THREADS=1 run_kfirst.py dev | held | --summary
Writes results_kfirst_parts/<arm>_<split>_<case>_<kind>.json, then results_kfirst.json and .txt.
"""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402

import run_kmargin as rk  # noqa: E402
from run_enlarge_rel import pct, sign_p  # noqa: E402

PARTS = HERE / "results_kfirst_parts"
OUT = HERE / "results_kfirst"
ARMS = {"K1": "skip", "Kr": "scale"}
CAP = 0.05


def _patched(arm):
    """run_kmargin's jobs, with its parts directory and vlin.slp's k_first set for this arm."""
    import infra_dcopf.vlin as vlin
    base = getattr(vlin, "_slp_orig", vlin.slp)
    vlin._slp_orig = base

    def slp(*a, **kw):
        kw.setdefault("k_first", ARMS[arm])
        return base(*a, **kw)
    vlin.slp = slp
    rk.vlin.slp = slp
    rk.PARTS = PARTS
    rk.ARMS = {arm: CAP}


def _run(job):
    arm, split, name, kind = job
    _patched(arm)
    return (rk.dev_job if split == "dev" else rk.held_job)((arm, name, kind))


def load(prefix, parts):
    return {(r["case"], r["kind"]): r for r in
            (json.loads(f.read_text()) for f in sorted(parts.glob(f"{prefix}_*.json")))}


def summary():
    dref, href = rk.refs()
    L = []
    P = L.append
    P("Rules K1 and Kr: rule K without the unboxed round 1's remainder (research/grid-linopf)")
    P("Plan and predictions F0 to F7: LOG.md 2026-11-22 (committed before this ran).")
    P("")
    res, rows = {}, {}
    for split, ref, budget in (("dev", dref, rk.DEV_ROUNDS), ("held", href, 20)):
        kref = load(f"K_{split}", HERE / "results_kmargin_parts")
        res[f"K:{split}"] = rk.tally(split, ref, kref)
        for arm in ARMS:
            got = load(f"{arm}_{split}", PARTS)
            if not got:
                continue
            rows[f"{arm}:{split}"] = got
            P(f"Arm {arm} ({ARMS[arm]}), {'development' if split == 'dev' else 'held-out'}: {len(ref)} cases "
              f"({len(got)} run), {budget}-round budget")
            P(f"  case               kind  frozen@  K@  {arm}@   cost % over AC optimum frozen / K / {arm}")
            for key in sorted(ref, key=lambda k: (k[1], k[0])):
                f, r, kr = ref[key], got.get(key), kref.get(key, ref[key])
                if r is None:
                    continue
                g = lambda x: "-" if x is None else f"{pct(x, f['ac']):+.3f}"  # noqa: E731
                mark = "" if f.get("clean_at") == r.get("clean_at") else "  <-"
                P(f"  {key[0]:18s} {key[1]:4s} {str(f.get('clean_at')):>7} {str(kr.get('clean_at')):>4} "
                  f"{str(r.get('clean_at')):>4}   {g(rk.cost_of(split, f)):>8} / {g(rk.cost_of(split, kr)):>8} / "
                  f"{g(rk.cost_of(split, r)):>8}{mark}")
            # gate F0: where rule K never armed on round 1, the arm runs exactly as rule K
            same = [k for k, r in got.items() if k in kref and not any(x["it"] == 1 for x in kref[k].get("kinfo") or [])]
            bad = [k for k in same if not rk.same_run(split, got[k], kref[k])]
            P(f"  gate F0 (rule K never armed on round 1: equals rule K's run): {len(same) - len(bad)} of {len(same)}"
              + (f"; differ: {bad}" if bad else ""))
            t = rk.tally(split, ref, got)
            dr = t["d_rounds"]
            fa, sl = sum(1 for d in dr if d < 0), sum(1 for d in dr if d > 0)
            P(f"  finishers: frozen {t['frozen']}, rule K {res[f'K:{split}']['K']}, {arm} {t['K']} of {t['n']}; "
              f"against frozen gained {len(t['gained'])} {t['gained']}, lost {len(t['lost'])} {t['lost']} "
              f"(sign test P = {sign_p(len(t['gained']), len(t['lost'])):.3f})")
            if dr:
                cp = t["d_cost_pts"]
                P(f"  both finish ({len(dr)}): rounds {arm} minus frozen median {np.median(dr):+.1f} (faster {fa}, "
                  f"slower {sl}, sign test P = {sign_p(fa, sl):.3f}); cost points mean {np.mean(cp):+.3f}, median "
                  f"{np.median(cp):+.3f}, range {min(cp):+.3f} to {max(cp):+.3f}")
            if split == "held":
                for key in rk.STALLS:
                    r = got.get(key)
                    fin = (r or {}).get("final") or {}
                    P(f"    stall {key[0]} {key[1]}: clean@{(r or {}).get('clean_at')}, best point overloads "
                      f"{fin.get('n_over')}, max load {fin.get('max_load')}")
            res[f"{arm}:{split}"] = t
            P("")
    sad = ("case240_pserc", "sad")
    kheld = res.get("K:held", {})
    for arm in ARMS:
        d, h = res.get(f"{arm}:dev"), res.get(f"{arm}:held")
        if d is None:
            continue
        fin = rows[f"{arm}:dev"].get(sad, {}).get("clean_at")
        P(f"[{arm}] F1 (development case240 SAD finishes): {'held' if fin else 'refuted'} (clean@{fin})")
        P(f"[{arm}] F2 (development finishers at least 32 of 34): {'held' if d['K'] >= 32 else 'refuted'} ({d['K']})")
        P(f"[{arm}] F3 (development: no frozen finisher lost): {'held' if not d['lost'] else 'refuted'} {d['lost']}")
        if h is None:
            continue
        P(f"[{arm}] F4 (held-out finishers at least 10 of 19, none lost): "
          f"{'held' if h['K'] >= 10 and not h['lost'] else 'refuted'} ({h['K']}, lost {h['lost']})")
        m, mk = (np.mean(h["d_cost_pts"]) if h["d_cost_pts"] else float("nan"),
                 np.mean(kheld["d_cost_pts"]) if kheld.get("d_cost_pts") else float("nan"))
        P(f"[{arm}] F6 (held-out, both finish: mean cost change below rule K's): "
          f"{'held' if m < mk else 'refuted'} ({m:+.3f} against {mk:+.3f})")
        P(f"[{arm}] F7 (adoption: development loses none, held-out gains more than it loses): "
          f"{'met' if not d['lost'] and len(h['gained']) > len(h['lost']) else 'not met'}")
    js = {"tally": res, **{a: list(v.values()) for a, v in rows.items()}}
    return "\n".join(L) + "\n", js


def main():
    PARTS.mkdir(exist_ok=True)
    dref, href = rk.refs()
    jobs = []
    for split, ref in (("dev", dref), ("held", href)):
        if split in sys.argv:
            order = sorted(ref.values(), key=lambda r: -r.get("secs", 0))
            jobs += [(a, split, r["case"], r["kind"]) for a in ARMS for r in order]
    if jobs:
        with Pool(4, maxtasksperchild=1) as pool:
            pool.map(_run, jobs, chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
