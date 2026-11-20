"""Why does every widening variant lose held-out case1888 API? (research/grid-linopf)

Plan and predictions K0 to K5 in LOG.md (2026-11-20, "case1888 API", committed before this ran).

Rule C (run_enlarge_rel.py) loses case1888_rte API, which the frozen repair finishes at round 13: rule C fires on
rounds 1, 2 and 5 and then ends 20 rounds at one branch end 0.03 % over its rating. This script reruns the case
under run_heldout_slack.phase_j's protocol (as run_enlarge_rel.held_job) with vlin.slp's per-round trace, in five
arms: the frozen repair, rule C, and rule C with the enlarged step withheld on round 1, 2 or 5 (one at a time;
withholding a firing changes the path, so later firings may move).

Usage: OMP_NUM_THREADS=1 diag_case1888.py run | --summary
Writes diag_case1888_parts/<arm>.json, then diag_case1888.json and .txt.
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

CASE = ("case1888_rte", "api")
PARTS = HERE / "diag_case1888_parts"
OUT = HERE / "diag_case1888"
HELD_REF = HERE / "results_heldout_slack.json"
C_REF = HERE / "results_enlarge_rel_parts" / "held_case1888_rte_api.json"
ARMS = {"frozen": dict(enlarge=None), "C": dict(enlarge=2.0, enlarge_rel=True)}
ARMS.update({f"C-skip{k}": dict(enlarge=2.0, enlarge_rel=True, enlarge_skip=(k,)) for k in (1, 2, 5)})


def job(arm):
    from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
    from infra_dcopf.vsched import file_schedule
    from diag_slack_move import big_slack
    from run_fold import FINAL_ROUNDS, path
    from run_heldout_slack import jsonable
    from run_homotopy import dc_start
    from run_perturb import strip
    f = PARTS / f"{arm}.json"
    if f.exists():
        return json.loads(f.read_text())
    name, kind = CASE
    t0 = time.time()
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, _b, _k = big_slack(ppc)
    out = {"arm": arm, "case": name, "kind": kind, "ac": float(baseline()[(name, kind)][1])}
    pg, _rule = dc_start(p)
    vf = file_schedule(p)
    pts, _ = path(p, lambda m: m * pg, vf)
    info, trace = [], []
    hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                    screen=True, warm=pts[-1][1], warm_check=True, info=info, trace=trace, **ARMS[arm])
    best = vlin.best_of(hist, p["baseMVA"])
    out.update(status=[x["status"] for x in hist], qp=[x.get("qp") for x in hist],
               clean_at=next((x["it"] for x in hist if x.get("clean")), None),
               final=strip(best) if best else None, enlarge=info, trace=trace,
               rated=int(((p["branch"][:, 10] > 0) & (p["branch"][:, 5] > 0)).sum()),
               secs=time.time() - t0)
    out = jsonable(out)
    PARTS.mkdir(exist_ok=True)
    f.write_text(json.dumps(out, default=float))
    return out


def pct(c, ref):
    return None if c is None else 100.0 * (c / ref - 1.0)


def summary():
    rows = {a: json.loads((PARTS / f"{a}.json").read_text()) for a in ARMS if (PARTS / f"{a}.json").exists()}
    href = next(r for r in json.loads(HELD_REF.read_text()) if (r["case"], r["kind"]) == CASE)
    cref = json.loads(C_REF.read_text())
    L = []
    P = L.append
    P("case1888_rte API under the frozen repair, rule C and three rule-C ablations (research/grid-linopf)")
    P("Plan and predictions K0 to K5: LOG.md 2026-11-20 (committed before this ran).")
    P("")
    for a, ref in (("frozen", href), ("C", cref)):
        if a in rows:
            same = rows[a]["status"] == ref["status"] and rows[a]["qp"] == ref["qp"]
            P(f"K0 gate, {a}: statuses and QP kinds equal the stored run: {same}")
    P("")
    P("arm        clean@  final cost% over AC opt  max_load  firings (round:t_used)  skipped")
    for a, r in rows.items():
        fin = r.get("final") or {}
        fires = " ".join(f"{e['it']}:{e['t_used']:.2f}" for e in r["enlarge"] if e.get("fired"))
        sk = " ".join(str(e["it"]) for e in r["enlarge"] if e.get("skipped"))
        P(f"{a:10s} {str(r['clean_at']):>6}  {pct(fin.get('cost'), r['ac']):+10.3f}            "
          f"{fin.get('max_load', float('nan')):.5f}   {fires or '-':22s}  {sk or '-'}")
    for a in ("frozen", "C"):
        if a not in rows:
            continue
        P("")
        P(f"Per round, {a}: it qp halvings accepted phi_base phi_trial max_load n_over worst_br "
          f"worst_base worst_pred pred_max dP_max(MW) dV_max(pu) vviol qviol")
        for t in rows[a]["trace"]:
            if "phi_trial" not in t:
                P(f"  {t['it']:2d} {t['status']}  halvings {t['halvings']}")
                continue
            pb = "-" if t["phi_base"] is None else f"{t['phi_base']:.2e}"
            P(f"  {t['it']:2d} {t['qp']:9s} {t['halvings']:2d} {str(t['accepted']):5s} {pb:>9} {t['phi_trial']:.2e} "
              f"{t['max_load']:.5f} {t['n_over']:3d} {t['worst_br']:5d} {t['worst_base']:.5f} {t['worst_pred']:.5f} "
              f"{t['pred_max']:.5f} {t['dp_max_mw']:9.3f} {t['dv_max_pu']:.5f} {t['vviol']:3d} {t['qviol']:3d}")
    OUT.with_suffix(".txt").write_text("\n".join(L) + "\n")
    OUT.with_suffix(".json").write_text(json.dumps(rows, default=float))
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1:] == ["run"]:
        with Pool(4) as pool:
            for r in pool.imap_unordered(job, list(ARMS)):
                print(r["arm"], r["clean_at"], round(r["secs"]), flush=True)
    summary()
