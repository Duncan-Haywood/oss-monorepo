"""Session 83: choose the work-type class configuration per target city from its own history.

Why: sessions 79 to 82 found that no rule read from source counts alone picks the class that transfers:
the plain permit-type class wins in Austin, the cascade2 work-type class (or a fold of it) wins in SF and
Seattle. Session 82's "Next" asked whether the choice can be made per target city from data that exist
before the test year.

Selector. The transfer model for test year Y trains on the source cities' years <= Y-2 and early-stops on
their year Y-1; it never reads the held-out city. The held-out city's own year Y-1 is therefore a clean
selection set: the same rows the own-boosted model early-stops on, so the selector uses no information
the programme's own-city ceiling does not already use. For each candidate configuration the transfer
model's seed-mean pinball loss on those rows is computed per quantile, and:
  argmin   picks the candidate with the lowest selection-year loss (ties: the first candidate);
  gated    keeps the first candidate (cascade2, the programme's default) unless another candidate beats it
           on the selection year with a 95% week-block interval entirely below zero, then picks the best
           such candidate.
The test year is scored on all its rows (the reference, as sessions 81 and 82) and the regret is the
picked candidate's test loss minus the best candidate's. Fixed policies (always one candidate) are
reported beside it.

Limits that hold by design: labels come from the current pull, so the selection year is scored on its
complete outcomes, the same information own_boosted's early stopping already uses (a deployed selector
would see Y-1 right-truncated); one choice per quantile, since each quantile is a separate model.

Run (one call per held-out city and test year; the pull as sessions 78 to 82):
  python3.13 src/select_class.py DIR --held austin --test-year 2021 --classes cascade2 type cascade2_minsupdrop1000
Writes results/select_class_<held>_i2c_<year>.json.
"""
import argparse, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import censored_eval as ce  # noqa: E402

TAUS = (0.5, 0.9)  # the two quantiles sessions 79 to 82 report


def interval(d, weeks):
    m, lo, hi = ce.wblock_boot(d, np.ones(len(d)), weeks)
    return dict(diff=m, lo=lo, hi=hi)


def choose(sel, classes, tau):
    """sel: {k: dict(loss={tau: per-row}, weeks=...)} on the selection year. Returns (argmin, gated, table)."""
    a = classes[0]
    mean = {k: float(sel[k]["loss"][tau].mean()) for k in classes}
    vs = {k: interval(sel[k]["loss"][tau] - sel[a]["loss"][tau], sel[a]["weeks"]) for k in classes[1:]}
    argmin = min(classes, key=lambda k: (mean[k], classes.index(k)))
    sig = [k for k in classes[1:] if vs[k]["hi"] < 0]
    gated = min(sig, key=lambda k: (mean[k], classes.index(k))) if sig else a
    return argmin, gated, dict(mean=mean, minus_first=vs)


def evaluate(R, classes, taus=TAUS):
    """R: censored_eval.fit(..., select=True) output. Per quantile: the selection-year table, the picks,
    each candidate's test loss, the regret of every policy and the picks' paired test contrasts."""
    a = classes[0]
    for k in classes[1:]:
        if not np.array_equal(R[k]["_select"]["permit_id"], R[a]["_select"]["permit_id"]):
            raise SystemExit("configurations have different selection rows")
    sel = {k: R[k]["_select"] for k in classes}
    weeks = R[a]["weeks"]
    out = {}
    for t in taus:
        argmin, gated, table = choose(sel, classes, t)
        test = {k: float(R[k]["loss"]["transfer"][t].mean()) for k in classes}
        best = min(classes, key=lambda k: (test[k], classes.index(k)))
        pol = {"argmin": argmin, "gated": gated, **{f"always_{k}": k for k in classes}}
        out[str(t)] = dict(
            selection=table, picks=dict(argmin=argmin, gated=gated), test_loss=test, test_best=best,
            regret={p: test[k] - test[best] for p, k in pol.items()},
            test_minus_first={k: interval(R[k]["loss"]["transfer"][t] - R[a]["loss"]["transfer"][t], weeks)
                              for k in classes[1:]})
    return out


def summarise(paths):
    """Across result files: mean regret per policy and quantile, and cells with regret <= 1 day."""
    rows = [json.load(open(p)) for p in paths]
    pols = sorted({p for r in rows for t in r["by_tau"].values() for p in t["regret"]})
    out = dict(n_cells=sum(len(r["by_tau"]) for r in rows), policies={})
    for p in pols:
        reg = [t["regret"][p] for r in rows for t in r["by_tau"].values()]
        out["policies"][p] = dict(mean_regret=float(np.mean(reg)), max_regret=float(np.max(reg)),
                                  cells_within_1day=int(sum(x <= 1 for x in reg)))
    out["cells"] = [dict(held=r["held_out"], year=r["test_year"], tau=t, **v["picks"], best=v["test_best"],
                         regret_argmin=v["regret"]["argmin"], regret_gated=v["regret"]["gated"])
                    for r in rows for t, v in r["by_tau"].items()]
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir", nargs="?")
    ap.add_argument("--held", default="austin")
    ap.add_argument("--test-year", type=int)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--classes", nargs="+", default=["cascade2", "type", "cascade2_minsupdrop1000"], type=ce.class_arg)
    ap.add_argument("--summarise", nargs="+", help="result files to pool instead of fitting")
    a = ap.parse_args()
    res_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    if a.summarise:
        s = summarise(a.summarise)
        json.dump(s, open(os.path.join(res_dir, "select_class_summary.json"), "w"), indent=1)
        print(json.dumps(s["policies"], indent=1))
        for c in s["cells"]:
            print(c)
        sys.exit()
    R = ce.fit(a.data_dir, a.held, a.test_year, a.seeds, a.classes, select=True)
    x = R[a.classes[0]]
    res = dict(held_out=a.held, target="i2c", test_year=a.test_year, selection_year=a.test_year - 1,
               seeds=a.seeds, classes=a.classes, n_test=int(len(x["y"])), n_selection=int(len(x["_select"]["permit_id"])),
               note="selection = transfer loss on the held-out city's year Y-1 (never read by the transfer model); "
                    "test = all rows of year Y; days of mean pinball loss; minus_first < 0 = better than cascade2",
               minsup=getattr(ce.fit, "folds", {}), by_tau=evaluate(R, a.classes))
    out = os.path.join(res_dir, f"select_class_{a.held}_i2c_{a.test_year}.json")
    json.dump(res, open(out, "w"), indent=1)
    for t, v in res["by_tau"].items():
        print(a.held, a.test_year, t, "picks", v["picks"], "best", v["test_best"],
              "regret", {p: round(r, 2) for p, r in v["regret"].items()},
              "sel", {k: round(m, 2) for k, m in v["selection"]["mean"].items()}, flush=True)
