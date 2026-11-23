"""Rule CF: the cost phase with the frozen margins, falling back to the slack cap only on an empty QP
(research/grid-linopf).

Plan, rule CF and predictions T0 to T7 in LOG.md (2026-11-23, "Rule CF", committed before this ran).

Rule CP (run_costphase.py) solves hard cost QPs with the frozen margins; 185 of its 803 rounds had an empty QP.
Rule CS (run_slackcap.py) capped every margin at the point's own slack on every round: empty QPs fell to 10, but
not-clean trials rose from 88 to 275 and the held-out mean gap rose. Rule CF keeps CP's margins and calls the
capped QP only on a round whose margined QP is empty (vlin.cost_phase(fallback=...)), at the same boxes; that trial
is scored like any other. Starts, cases, protocol, rounds, boxes and acceptance are rule CP's: the jobs are
run_costphase.job with CP_FALLBACK set, written to results_fallback_parts/.

Usage: OMP_NUM_THREADS=1 run_fallback.py dev | held | --summary
Writes results_fallback_parts/<arm>_<split>_<case>_<kind>.json, then results_fallback.json and .txt.
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

PARTS = HERE / "results_fallback_parts"
OUT = HERE / "results_fallback"
CP_PARTS = HERE / "results_costphase_parts"
CS_PARTS = HERE / "results_slackcap_parts"
ARMS = rc.ARMS


def configure():
    rc.PARTS = PARTS
    rc.CP_MARGIN = vlin.MARGIN
    rc.CP_FALLBACK = {**vlin.MARGIN, "cap": True}


def load(parts, arm, split):
    return {(r["case"], r["kind"]): r for r in (json.loads(f.read_text())
                                                for f in sorted(parts.glob(f"{arm}_{split}_*.json")))}


def statuses(recs, fallback_only=False):
    return Counter(r["status"] for rr in recs for r in rr.get("cp_rounds", [])
                   if not fallback_only or r.get("fallback"))


def had_empty(rec):
    return any(r["status"] == "QP infeasible" for r in rec.get("cp_rounds", []))


def summary():
    R = rc.refs()
    L = []
    P = L.append
    P("Rule CF: the cost phase with the frozen margins, the slack cap only on an empty QP (research/grid-linopf)")
    P("Plan and predictions T0 to T7: LOG.md 2026-11-23 'Rule CF' (committed before this ran). Rule CP's rounds, boxes "
      f"and acceptance (CP_ROUNDS {vlin.CP_ROUNDS}, P box {vlin.CP_PBOX} of range, V box {vlin.CP_VBOX} pu); "
      "margin = frozen MARGIN, fallback = MARGIN with cap=True on an empty margined QP only.")
    P("")
    res = {}
    gate_n = gate_ok = 0
    ident_n = ident_ok = 0
    tally = {"CP": Counter(), "CS": Counter(), "CF": Counter()}
    fb_tally = Counter()
    for split in ("dev", "held"):
        got = {a: load(PARTS, a, split) for a in ARMS}
        cp = {a: load(CP_PARTS, a, split) for a in ARMS}
        cs = {a: load(CS_PARTS, a, split) for a in ARMS}
        P(f"{'Development' if split == 'dev' else 'Held-out'}: % over PGLib's AC optimum at the clean point and after "
          "rules CP, CS and CF (accepted steps; e = CP had an empty round)")
        P("  case               kind      F clean     +CP     +CS     +CF  cp cs cf e    K1 clean     +CP     +CS"
          "     +CF  cp cs cf e")
        keys = sorted(set(got["F"]) | set(got["K1"]), key=lambda k: (k[1], k[0]))
        for k in keys:
            cells = []
            for a in ARMS:
                r, q, s = got[a].get(k), cp[a].get(k), cs[a].get(k)
                if not r or r.get("rerun_clean_at") is None or not q or not s:
                    cells.append(f"{'-':>12} {'-':>7} {'-':>7} {'-':>7} {'-':>3} {'-':>2} {'-':>2} -")
                    continue
                cells.append(f"{pct(r['rerun_cost'], r['ac']):+12.3f} {pct(q['cp_cost'], q['ac']):+7.3f} "
                             f"{pct(s['cp_cost'], s['ac']):+7.3f} {pct(r['cp_cost'], r['ac']):+7.3f} "
                             f"{q['cp_accepted']:>3} {s['cp_accepted']:>2} {r['cp_accepted']:>2} "
                             f"{'e' if had_empty(q) else '.'}")
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
            rows = [k for k, r in got[a].items() if r.get("rerun_clean_at") is not None and k in cp[a] and k in cs[a]]
            if not rows:
                continue
            for k in rows:
                if not had_empty(cp[a][k]):
                    ident_n += 1
                    ident_ok += abs(got[a][k]["cp_cost"] - cp[a][k]["cp_cost"]) <= 1e-9 * abs(cp[a][k]["cp_cost"])
            tally["CP"] += statuses([cp[a][k] for k in rows])
            tally["CS"] += statuses([cs[a][k] for k in rows])
            tally["CF"] += statuses([got[a][k] for k in rows])
            fb_tally += statuses([got[a][k] for k in rows], fallback_only=True)
            before = np.array([pct(got[a][k]["rerun_cost"], got[a][k]["ac"]) for k in rows])
            acp = np.array([pct(cp[a][k]["cp_cost"], cp[a][k]["ac"]) for k in rows])
            acs = np.array([pct(cs[a][k]["cp_cost"], cs[a][k]["ac"]) for k in rows])
            acf = np.array([pct(got[a][k]["cp_cost"], got[a][k]["ac"]) for k in rows])
            n_cf = sum(got[a][k]["cp_accepted"] > 0 for k in rows)
            n_cp = sum(cp[a][k]["cp_accepted"] > 0 for k in rows)
            n_cs = sum(cs[a][k]["cp_accepted"] > 0 for k in rows)
            lo, hi = int((acf < acp - 1e-9).sum()), int((acf > acp + 1e-9).sum())
            slo, shi = int((acf < acs - 1e-9).sum()), int((acf > acs + 1e-9).sum())
            worse = [f"{k[0]} {k[1]}" for k in rows
                     if got[a][k]["cp_cost"] > got[a][k]["rerun_cost"] or not got[a][k]["cp_clean"]]
            secs = float(np.median([got[a][k]["cp_secs"] for k in rows]))
            P(f"  [{a}] {len(rows)} finishers; reproduce stored run (T0): {len(got[a]) - len(bad)} of {len(got[a])}"
              + (f", differ {bad}" if bad else ""))
            P(f"  [{a}] mean gap: clean {before.mean():+.3f}, CP {acp.mean():+.3f}, CS {acs.mean():+.3f}, CF "
              f"{acf.mean():+.3f} points; median CF {np.median(acf):+.3f}")
            P(f"  [{a}] CF against CP: cheaper on {lo}, dearer on {hi} (sign test P = {sign_p(lo, hi):.3f}); against CS: "
              f"cheaper on {slo}, dearer on {shi} (P = {sign_p(slo, shi):.3f}); cases with an accepted step CP {n_cp}, "
              f"CS {n_cs}, CF {n_cf} of {len(rows)}; median CF seconds {secs:.1f}; dearer or dirtier after CF: "
              f"{worse or 'none'}")
            res[f"{a}:{split}"] = {"n": len(rows), "keys": [f"{k[0]} {k[1]}" for k in rows], "clean": before.tolist(),
                                   "cp": acp.tolist(), "cs": acs.tolist(), "cf": acf.tolist(),
                                   "cf_cheaper_cp": lo, "cf_dearer_cp": hi, "cf_cheaper_cs": slo, "cf_dearer_cs": shi,
                                   "acc_cp": n_cp, "acc_cs": n_cs, "acc_cf": n_cf, "worse": worse, "gate_bad": bad,
                                   "cf_secs": secs}
        common = [k for k in keys if all(got[a].get(k, {}).get("rerun_clean_at") is not None for a in ARMS)]
        if common:
            fa = np.array([pct(got["F"][k]["cp_cost"], got["F"][k]["ac"]) for k in common])
            ka = np.array([pct(got["K1"][k]["cp_cost"], got["K1"][k]["ac"]) for k in common])
            lo, hi = int((ka < fa - 1e-9).sum()), int((ka > fa + 1e-9).sum())
            P(f"  common finishers ({len(common)}): mean gap F+CF {fa.mean():+.3f}, K1+CF {ka.mean():+.3f}; K1+CF "
              f"cheaper on {lo}, dearer on {hi} (sign test P = {sign_p(lo, hi):.3f})")
            res[f"common:{split}"] = {"n": len(common), "F+CF": fa.mean(), "K1+CF": ka.mean(), "k1_cheaper": lo,
                                      "k1_dearer": hi}
        P("")
    for name, t in tally.items():
        P(f"round outcomes, {name} (all finishers): {sum(t.values())} rounds, " + ", ".join(
            f"{v} {k}" for k, v in t.most_common()))
    P(f"CF fallback trials (rounds whose margined QP was empty): {sum(fb_tally.values())}, " + ", ".join(
        f"{v} {k}" for k, v in fb_tally.most_common()))
    res["tally"] = {k: dict(v) for k, v in tally.items()}
    res["fallback"] = dict(fb_tally)
    P("")
    P(f"T0 (gate: reruns reproduce the stored clean round and cost): {gate_ok} of {gate_n}")
    P(f"T1 (check: CF's final cost equals CP's on every finisher where CP met no empty QP): "
      f"{'held' if ident_ok == ident_n else 'refuted'} ({ident_ok} of {ident_n})")
    for tag, key, other in (("T2", "F:dev", "cp"), ("T3", "F:held", "cp"), ("T4", "F:held", "cs")):
        d = res.get(key)
        if d:
            P(f"{tag} ({key}: mean gap after CF below {other.upper()}'s): "
              f"{'held' if np.mean(d['cf']) < np.mean(d[other]) else 'refuted'}"
              f" ({np.mean(d['cf']):+.3f} against {np.mean(d[other]):+.3f})")
    nfb = sum(fb_tally.values())
    if nfb:
        acc = fb_tally.get("accepted", 0)
        P(f"T5 (at least 40 % of fallback trials accepted): {'held' if acc >= 0.4 * nfb else 'refuted'} "
          f"({acc} of {nfb}, {acc / nfb:.0%})")
    pooled = [res[k] for k in res if ":" in k and not k.startswith("common")]
    if pooled:
        n = sum(x["n"] for x in pooled)
        a = sum(x["acc_cf"] for x in pooled)
        P(f"T6 (an accepted CF step on at least 70 of the pooled finishers): {'held' if a >= 70 else 'refuted'} "
          f"({a} of {n}; CP {sum(x['acc_cp'] for x in pooled)}, CS {sum(x['acc_cs'] for x in pooled)})")
        w = [x for p in pooled for x in p["worse"]]
        P(f"T7 (check, by construction: no point dearer or dirtier after CF): {'held' if not w else 'refuted'} {w}")
    ad = all(np.mean(res[k]["cf"]) <= np.mean(res[k]["cp"]) for k in ("F:dev", "F:held") if k in res)
    P(f"Adoption (CF replaces CP in the method of record if, from the frozen start, its mean gap is no higher than "
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
