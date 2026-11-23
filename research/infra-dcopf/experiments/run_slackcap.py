"""Rule CS: the cost phase with each bound's margin capped at its own slack at the point (research/grid-linopf).

Plan, rule CS and predictions S0 to S6 in LOG.md (2026-11-23, "Rule CS", committed before this ran).

Rule CP (run_costphase.py) solves hard cost QPs with the frozen margins; on 27 of 83 finishers it took no step,
and 185 of its 803 rounds had an empty QP, because the clean point sits between 1 - margin and 1 on some rating
(or inside another bound's margin band) and so is outside the margined QP. Rule CS is rule CP with
margin = {**vlin.MARGIN, "cap": True}: every bound (thermal, angle, PQ voltage, reactive, slack P and the voltage
setpoint box) is pulled in by min(frozen margin, that row's own slack at the linearisation point), so the point
is always inside the QP. Everything else (starts, cases, protocol, rounds, boxes, acceptance) is rule CP's: the
jobs are run_costphase.job with that one margin change, written to results_slackcap_parts/.

Usage: OMP_NUM_THREADS=1 run_slackcap.py dev | held | --summary
Writes results_slackcap_parts/<arm>_<split>_<case>_<kind>.json, then results_slackcap.json and .txt.
"""
import json
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
import run_costphase as rc  # noqa: E402
from run_enlarge_rel import pct, sign_p  # noqa: E402

PARTS = HERE / "results_slackcap_parts"
OUT = HERE / "results_slackcap"
CP_PARTS = HERE / "results_costphase_parts"
ARMS = rc.ARMS


def configure():
    rc.PARTS = PARTS
    rc.CP_MARGIN = {**vlin.MARGIN, "cap": True}


def load(parts, arm, split):
    return {(r["case"], r["kind"]): r for r in (json.loads(f.read_text())
                                                for f in sorted(parts.glob(f"{arm}_{split}_*.json")))}


def statuses(recs):
    return Counter(r["status"] for rr in recs for r in rr.get("cp_rounds", []))


def summary():
    R = rc.refs()
    L = []
    P = L.append
    P("Rule CS: the cost phase with each bound's margin capped at its own slack at the point (research/grid-linopf)")
    P("Plan and predictions S0 to S6: LOG.md 2026-11-23 'Rule CS' (committed before this ran). Rule CP's rounds, boxes "
      f"and acceptance (CP_ROUNDS {vlin.CP_ROUNDS}, P box {vlin.CP_PBOX} of range, V box {vlin.CP_VBOX} pu); "
      "margin = frozen MARGIN with cap=True.")
    P("")
    res = {}
    gate_n = gate_ok = 0
    tally = {"CP": Counter(), "CS": Counter()}
    for split in ("dev", "held"):
        got = {a: load(PARTS, a, split) for a in ARMS}
        cp = {a: load(CP_PARTS, a, split) for a in ARMS}
        P(f"{'Development' if split == 'dev' else 'Held-out'}: % over PGLib's AC optimum at the clean point, after "
          "rule CP and after rule CS (accepted steps)")
        P("  case               kind     F clean      F+CP      F+CS  cp cs    K1 clean     K1+CP     K1+CS  cp cs")
        keys = sorted(set(got["F"]) | set(got["K1"]), key=lambda k: (k[1], k[0]))
        for k in keys:
            cells = []
            for a in ARMS:
                r, q = got[a].get(k), cp[a].get(k)
                if not r or r.get("rerun_clean_at") is None or not q:
                    cells.append(f"{'-':>10} {'-':>9} {'-':>9} {'-':>3} {'-':>2}")
                    continue
                cells.append(f"{pct(r['rerun_cost'], r['ac']):+10.3f} {pct(q['cp_cost'], q['ac']):+9.3f} "
                             f"{pct(r['cp_cost'], r['ac']):+9.3f} {q['cp_accepted']:>3} {r['cp_accepted']:>2}")
            P(f"  {k[0]:18s} {k[1]:4s} {cells[0]}  {cells[1]}")
        for a in ARMS:
            ref = R[(a, split)]
            bad = []
            for r in got[a].values():
                s = ref.get((r["case"], r["kind"]))
                sc = rc.stored_cost(split, s) if s else None
                ok = (s is not None and s.get("clean_at") == r.get("rerun_clean_at")
                      and (sc is None) == (r.get("rerun_cost") is None)
                      and (sc is None or abs(r["rerun_cost"] - sc) <= 1e-6 * abs(sc)))
                gate_n += 1
                gate_ok += ok
                if not ok:
                    bad.append(f"{r['case']} {r['kind']}")
            rows = [k for k, r in got[a].items() if r.get("rerun_clean_at") is not None and k in cp[a]]
            if not rows:
                continue
            tally["CP"] += statuses([cp[a][k] for k in rows])
            tally["CS"] += statuses([got[a][k] for k in rows])
            before = np.array([pct(got[a][k]["rerun_cost"], got[a][k]["ac"]) for k in rows])
            acp = np.array([pct(cp[a][k]["cp_cost"], cp[a][k]["ac"]) for k in rows])
            acs = np.array([pct(got[a][k]["cp_cost"], got[a][k]["ac"]) for k in rows])
            n_cs = sum(got[a][k]["cp_accepted"] > 0 for k in rows)
            n_cp = sum(cp[a][k]["cp_accepted"] > 0 for k in rows)
            lo, hi = int((acs < acp - 1e-9).sum()), int((acs > acp + 1e-9).sum())
            share = np.array([(b - x) / b if b > 1e-9 else 0.0 for b, x in zip(before, acs)])
            worse = [f"{k[0]} {k[1]}" for k in rows
                     if got[a][k]["cp_cost"] > got[a][k]["rerun_cost"] or not got[a][k]["cp_clean"]]
            secs = float(np.median([got[a][k]["cp_secs"] for k in rows]))
            P(f"  [{a}] {len(rows)} finishers; reproduce stored run (S0): {len(got[a]) - len(bad)} of {len(got[a])}"
              + (f", differ {bad}" if bad else ""))
            P(f"  [{a}] mean gap: clean {before.mean():+.3f}, CP {acp.mean():+.3f}, CS {acs.mean():+.3f} points; "
              f"median CS {np.median(acs):+.3f}; share of gap closed by CS median {np.median(share):.2f}, mean "
              f"{share.mean():.2f}")
            P(f"  [{a}] CS cheaper than CP on {lo}, dearer on {hi} (sign test P = {sign_p(lo, hi):.3f}); cases with an "
              f"accepted step CP {n_cp}, CS {n_cs} of {len(rows)}; median CS seconds {secs:.1f}; dearer or dirtier "
              f"after CS: {worse or 'none'}")
            res[f"{a}:{split}"] = {"n": len(rows), "keys": [f"{k[0]} {k[1]}" for k in rows], "clean": before.tolist(),
                                   "cp": acp.tolist(), "cs": acs.tolist(), "cs_cheaper": lo, "cs_dearer": hi,
                                   "acc_cp": n_cp, "acc_cs": n_cs, "worse": worse, "gate_bad": bad,
                                   "cs_secs": secs}
        common = [k for k in keys if all(got[a].get(k, {}).get("rerun_clean_at") is not None for a in ARMS)]
        if common:
            fa = np.array([pct(got["F"][k]["cp_cost"], got["F"][k]["ac"]) for k in common])
            ka = np.array([pct(got["K1"][k]["cp_cost"], got["K1"][k]["ac"]) for k in common])
            lo, hi = int((ka < fa - 1e-9).sum()), int((ka > fa + 1e-9).sum())
            P(f"  common finishers ({len(common)}): mean gap F+CS {fa.mean():+.3f}, K1+CS {ka.mean():+.3f}; K1+CS "
              f"cheaper on {lo}, dearer on {hi} (sign test P = {sign_p(lo, hi):.3f})")
            res[f"common:{split}"] = {"n": len(common), "F+CS": fa.mean(), "K1+CS": ka.mean(), "k1_cheaper": lo,
                                      "k1_dearer": hi}
        P("")
    for name, t in tally.items():
        P(f"round outcomes, {name} (all finishers): {sum(t.values())} rounds, " + ", ".join(
            f"{v} {k}" for k, v in t.most_common()))
    res["tally"] = {k: dict(v) for k, v in tally.items()}
    P("")
    P(f"S0 (gate: reruns reproduce the stored clean round and cost): {gate_ok} of {gate_n}")
    n_cs = sum(tally["CS"].values())
    e_cs = tally["CS"].get("QP infeasible", 0)
    P(f"S1 (empty-QP rounds at most 5 % of CS rounds): {'held' if e_cs <= 0.05 * n_cs else 'refuted'} "
      f"({e_cs} of {n_cs}; CP {tally['CP'].get('QP infeasible', 0)} of {sum(tally['CP'].values())})")
    for tag, key in (("S2", "F:dev"), ("S3", "F:held")):
        d = res.get(key)
        if d:
            P(f"{tag} ({key}: mean gap after CS below CP's): {'held' if np.mean(d['cs']) < np.mean(d['cp']) else 'refuted'}"
              f" ({np.mean(d['cs']):+.3f} against {np.mean(d['cp']):+.3f})")
    pooled = [res[k] for k in res if ":" in k and not k.startswith("common")]
    if pooled:
        n = sum(x["n"] for x in pooled)
        a = sum(x["acc_cs"] for x in pooled)
        P(f"S4 (an accepted CS step on at least 75 % of finishers, pooled): {'held' if a >= 0.75 * n else 'refuted'} "
          f"({a} of {n}; CP {sum(x['acc_cp'] for x in pooled)})")
        w = [x for p in pooled for x in p["worse"]]
        P(f"S5 (check, by construction: no point dearer or dirtier after CS): {'held' if not w else 'refuted'} {w}")
    c = res.get("common:held")
    if c:
        P(f"S6 (held-out common finishers: K1+CS mean gap within 0.10 points of F+CS): "
          f"{'held' if c['K1+CS'] <= c['F+CS'] + 0.10 else 'refuted'} ({c['K1+CS'] - c['F+CS']:+.3f})")
    ad = all(np.mean(res[k]["cs"]) <= np.mean(res[k]["cp"]) for k in ("F:dev", "F:held") if k in res)
    P(f"Adoption (CS replaces CP in the method of record if, from the frozen start, its mean gap is no higher than "
      f"CP's on both splits): {'met' if ad else 'not met'}")
    return "\n".join(L) + "\n", res


def main():
    configure()
    PARTS.mkdir(exist_ok=True)
    R = rc.refs()
    jobs = []
    for split in ("dev", "held"):
        if split in sys.argv:
            for a in ARMS:
                rs = [r for r in R[(a, split)].values() if r.get("clean_at") is not None]
                rs.sort(key=lambda r: -r.get("secs", 0))
                jobs += [(a, split, r["case"], r["kind"]) for r in rs]
    if jobs:
        with Pool(4, maxtasksperchild=1) as pool:
            pool.map(rc.job, jobs, chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
