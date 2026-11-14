"""Session 84: does the per-city class selector of session 83 survive the labels a deployment would see?

Why: session 83 chose the work-type class configuration per target city from the transfer model's loss
on the target's own year Y-1, scored on complete labels from today's pull. A model shipped at the start
of test year Y sees only the Y-1 permits that were already completed by then (administrative
right-truncation, sessions 77 and 78), which drops exactly the long builds that carry Austin's q0.9
advantage for the plain permit type. This script rescores the same selector on six selection sets, all
from rows the transfer model never reads (it trains on the sources' years <= Y-2 and early-stops on
their Y-1):

  full1   year Y-1, every row (session 83's set; an oracle, as no deployment has these labels)
  cc1     year Y-1, rows completed by the decision date D = 1 January Y, unweighted (complete case)
  ipcw1   the cc1 rows weighted by 1/G(y), G(t) = share of the year's permits issued at least t days
          before D (from every row's issue day; floored at 0.05, weight <= 20)
  full2   year Y-2, every row (oracle)
  cc2     year Y-2, rows completed by D (windows of 1 to 2 years)
  ipcw2   the cc2 rows, IPCW-weighted

Each set feeds the same two rules as session 83: argmin (lowest weighted mean loss; ties to the first
candidate) and gated (keep the first candidate unless another beats it with a 95% week-block interval,
weights held fixed, entirely below zero). The test year is scored on all its rows (the reference) and
regret is the picked candidate's test loss minus the best candidate's.

Session 85 adds year Y-3 (full3, cc3, ipcw3: windows of 2 to 3 years, nearly complete at D) and
--es-truncate, which early-stops the transfer model on only the sources' year Y-1 rows completed by D,
as a deployment would; results then go to select_deploy_es_<held>_i2c_<year>.json.

Run (one call per held-out city and test year):
  python3.13 src/select_deploy.py DIR --held austin --test-year 2021
  python3.13 src/select_deploy.py --summarise results/select_deploy_*_i2c_20*.json
  python3.13 src/select_deploy.py --summarise results/select_deploy_es_*.json --summary-name \
      select_deploy_es_summary.json --baseline results/select_deploy_{austin,sf,seattle}_i2c_20*.json
Writes results/select_deploy_<held>_i2c_<year>.json and results/select_deploy_summary.json.
"""
import argparse, datetime, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import censored_eval as ce  # noqa: E402

TAUS = (0.5, 0.9)
SETS = ("full1", "cc1", "ipcw1", "full2", "cc2", "ipcw2", "full3", "cc3", "ipcw3")
FLOOR = 0.05  # censored_eval's default weight floor (weight <= 20), not tuned here


def set_weights(sel, decision, floor=FLOOR):
    """For one selection year's rows (dict with y, start): {'full', 'cc', 'ipcw'} -> per-row weights
    (0 = row not used). cc and ipcw use only rows completed by `decision` (y <= decision - issue day)."""
    y = np.asarray(sel["y"], float)
    c = ce.windows(sel["start"], decision)
    seen = y <= c
    # G(t) = P(window >= t) from every row's issue day: at the decision date the feed lists each permit
    # issued in the selection year, completed or not, so the issue-day distribution is known in full
    # (censored_eval.ipcw_weights estimates it from short rows only, since its pseudo-pull has no feed)
    g = ce.survival(c)(y)
    ipcw = np.where(seen, 1.0 / np.maximum(g, floor), 0.0)
    return dict(full=np.ones(len(y)), cc=seen.astype(float), ipcw=ipcw), \
        dict(n=int(len(y)), n_seen=int(seen.sum()), share_seen=float(seen.mean()),
             window_min=float(c.min()), window_max=float(c.max()),
             q90_full=float(np.quantile(y, .9)), q90_cc=float(np.quantile(y[seen], .9)))


def choose(loss, weeks, w, classes, tau):
    """loss: {k: {tau: per-row}}; w: per-row weights (0 drops a row). Returns (argmin, gated, table)."""
    a, m = classes[0], w > 0
    mean = {k: ce.wmean(loss[k][tau][m], w[m]) for k in classes}
    vs = {}
    for k in classes[1:]:
        d, lo, hi = ce.wblock_boot(loss[k][tau][m] - loss[a][tau][m], w[m], weeks[m])
        vs[k] = dict(diff=d, lo=lo, hi=hi)
    argmin = min(classes, key=lambda k: (mean[k], classes.index(k)))
    sig = [k for k in classes[1:] if vs[k]["hi"] < 0]
    gated = min(sig, key=lambda k: (mean[k], classes.index(k))) if sig else a
    return argmin, gated, dict(mean=mean, minus_first=vs)


def evaluate(R, classes, test_year, taus=TAUS, floor=FLOOR):
    """R: censored_eval.fit(..., select=True) output carrying _select (year Y-1) and _select2 (Y-2)."""
    a = classes[0]
    keys = [(k, t) for k, t in (("_select", "1"), ("_select2", "2"), ("_select3", "3")) if k in R[a]]
    for key, _ in keys:
        for k in classes[1:]:
            if not np.array_equal(R[k][key]["permit_id"], R[a][key]["permit_id"]):
                raise SystemExit(f"configurations have different {key} rows")
    decision = datetime.date(test_year, 1, 1)
    sets, labels = {}, {}
    for key, tag in keys:
        ws, labels["Y-" + tag] = set_weights(R[a][key], decision, floor)
        for name, w in ws.items():
            sets[name + tag] = (key, w)
    out = {}
    for t in taus:
        test = {k: float(R[k]["loss"]["transfer"][t].mean()) for k in classes}
        best = min(classes, key=lambda k: (test[k], classes.index(k)))
        reg = {f"always_{k}": test[k] - test[best] for k in classes}
        by_set = {}
        for s in [x for x in SETS if x in sets]:
            key, w = sets[s]
            loss = {k: R[k][key]["loss"] for k in classes}
            argmin, gated, table = choose(loss, R[a][key]["weeks"], w, classes, t)
            reg[f"{s}:argmin"] = test[argmin] - test[best]
            reg[f"{s}:gated"] = test[gated] - test[best]
            by_set[s] = dict(picks=dict(argmin=argmin, gated=gated), **table)
        out[str(t)] = dict(test_loss=test, test_best=best, regret=reg, sets=by_set)
    return out, labels


def summarise(paths):
    rows = [json.load(open(p)) for p in paths]
    pols = sorted({p for r in rows for t in r["by_tau"].values() for p in t["regret"]})
    out = dict(n_cells=sum(len(r["by_tau"]) for r in rows), policies={})
    for p in pols:
        reg = [t["regret"][p] for r in rows for t in r["by_tau"].values()]
        out["policies"][p] = dict(mean_regret=float(np.mean(reg)), max_regret=float(np.max(reg)),
                                  cells_within_1day=int(sum(x <= 1 for x in reg)),
                                  cells_within_0_2day=int(sum(x <= .2 for x in reg)))
    out["agree_with_full1_argmin"] = {
        s: int(sum(t["sets"][s]["picks"]["argmin"] == t["sets"]["full1"]["picks"]["argmin"]
                   for r in rows for t in r["by_tau"].values())) for s in SETS if s in rows[0]["by_tau"]["0.5"]["sets"]}
    out["cells"] = [dict(held=r["held_out"], year=r["test_year"], tau=t, best=v["test_best"],
                         argmin={s: v["sets"][s]["picks"]["argmin"] for s in v["sets"]},
                         gated={s: v["sets"][s]["picks"]["gated"] for s in v["sets"]})
                    for r in rows for t, v in r["by_tau"].items()]
    out["labels"] = {f'{r["held_out"]} {r["test_year"]}': r["labels"] for r in rows}
    return out


def compare(paths, base_paths):
    """Session 85: each candidate's test-year loss and the test-year best, under this run's model
    against a baseline run (session 84's select_deploy_<held>_i2c_<year>.json) for the same cells."""
    base = {(r["held_out"], r["test_year"]): r for r in map(lambda p: json.load(open(p)), base_paths)}
    cells, rel = [], []
    for r in map(lambda p: json.load(open(p)), paths):
        b = base[(r["held_out"], r["test_year"])]
        for t, v in r["by_tau"].items():
            bv = b["by_tau"][t]
            d = {k: (v["test_loss"][k] - bv["test_loss"][k]) / bv["test_loss"][k] for k in v["test_loss"]}
            rel += list(d.values())
            ab = min(v["test_loss"].values()) - min(bv["test_loss"].values())  # session 86, days
            cells.append(dict(held=r["held_out"], year=r["test_year"], tau=t, best=v["test_best"],
                              best_baseline=bv["test_best"], rel_change=d, best_loss_change=ab))
    return dict(n_cells=len(cells), same_best=sum(c["best"] == c["best_baseline"] for c in cells),
                n_candidate_cells=len(rel), within_2pct=int(sum(abs(x) < .02 for x in rel)),
                max_abs_rel_change=float(max(map(abs, rel))),
                best_loss_change_mean=float(np.mean([c["best_loss_change"] for c in cells])),
                best_within_0_3day=int(sum(abs(c["best_loss_change"]) <= .3 for c in cells)), cells=cells)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir", nargs="?")
    ap.add_argument("--held", default="austin")
    ap.add_argument("--test-year", type=int)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--classes", nargs="+", default=["cascade2", "type", "cascade2_minsupdrop1000"], type=ce.class_arg)
    ap.add_argument("--summarise", nargs="+", help="result files to pool instead of fitting")
    ap.add_argument("--es-truncate", action="store_true", help="session 85: early-stop on the sources' Y-1 rows completed by D")
    ap.add_argument("--deploy", action="store_true", help="session 86: train on source rows completed by D, rounds "
                    "fixed from years <= Y-4 early-stopped on Y-3; results to select_deploy_dep_<held>_i2c_<year>.json")
    ap.add_argument("--summary-name", default="select_deploy_summary.json")
    ap.add_argument("--baseline", nargs="+", help="with --summarise: session 84 result files to compare test losses with")
    a = ap.parse_args()
    res_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    if a.summarise:
        s = summarise(a.summarise)
        if a.baseline:
            s["vs_baseline"] = compare(a.summarise, a.baseline)
            print(json.dumps({k: v for k, v in s["vs_baseline"].items() if k != "cells"}))
        json.dump(s, open(os.path.join(res_dir, a.summary_name), "w"), indent=1)
        print(json.dumps(s["policies"], indent=1))
        print(json.dumps(s["agree_with_full1_argmin"]))
        for c in s["cells"]:
            print(c)
        sys.exit()
    R = ce.fit(a.data_dir, a.held, a.test_year, a.seeds, a.classes, select=True, es_truncate=a.es_truncate,
               deploy=a.deploy)
    by_tau, labels = evaluate(R, a.classes, a.test_year)
    res = dict(held_out=a.held, target="i2c", test_year=a.test_year, decision_date=f"{a.test_year}-01-01",
               seeds=a.seeds, classes=a.classes, n_test=int(len(R[a.classes[0]]["y"])), labels=labels,
               note="selection sets from the held-out city's years Y-1 and Y-2 (never read by the transfer "
                    "model); cc/ipcw keep rows completed by the decision date; test = all rows of year Y; "
                    "days of mean pinball loss; regret = picked minus best candidate's test loss",
               minsup=getattr(ce.fit, "folds", {}), es_truncate=a.es_truncate,
               source_es_rows={k: R[k].get("_es") for k in a.classes}, deploy=a.deploy,
               deploy_detail={k: R[k].get("_deploy") for k in a.classes}, by_tau=by_tau)
    tag = "_dep" if a.deploy else "_es" if a.es_truncate else ""
    out = os.path.join(res_dir, f"select_deploy{tag}_{a.held}_i2c_{a.test_year}.json")
    json.dump(res, open(out, "w"), indent=1, default=lambda o: sorted(o) if isinstance(o, set) else str(o))
    print(json.dumps(labels))
    for t, v in by_tau.items():
        print(a.held, a.test_year, t, "best", v["test_best"], "test", {k: round(x, 2) for k, x in v["test_loss"].items()})
        for s in v["sets"]:
            print("  ", s, v["sets"][s]["picks"], {k: round(x, 2) for k, x in v["sets"][s]["mean"].items()}, flush=True)
