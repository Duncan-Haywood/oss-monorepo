"""Session 77: is the held-out test year's short completion tail right-truncation?

An issue-to-completion (i2c) test row exists only if the permit was completed before the pull,
so a recent test year's completion times are censored at (pull date - issue date). The held-out
city's history (years <= Y-2) has had years longer to complete. This script censors the history
the same way and compares, per cascade2 class:

  q0.9 of the history as is; q0.9 of the history censored to the test year's window (a history
  row issued on day d of its year is kept only if its lag fits the window a permit issued on day
  d of year Y had before the pull); q0.9 of the test year; and the source/held q0.9 ratio
  (sources' training rows, years <= Y-2, as tailfold_map uses them) against the censored history,
  with a 95% bootstrap interval.

Run: python3 src/truncation_check.py DATA_DIR --pull-date 2026-11-12 [--held seattle] [--test-year 2024]
Writes results/truncation_check_<held>_i2c_<year>.json.
"""
import argparse, datetime, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transfer, tail_check  # noqa: E402


def window(start, test_year, pull_date):
    """Days a permit issued on the same day of year in test_year had before pull_date (array)."""
    s = pd.to_datetime(pd.Series(start))
    doy = s.dt.dayofyear.to_numpy() - 1
    base = (pull_date - datetime.date(test_year, 1, 1)).days
    return base - doy


def censor(d, test_year, pull_date):
    return d[d.y.to_numpy(float) <= window(d.start, test_year, pull_date)]


def check(frames, held, test_year, pull_date, min_n=50, n_boot=1000):
    src = [c for c in transfer.CITIES if c != held and c in frames]
    tr = pd.concat([frames[c][frames[c].year <= test_year - 2] for c in src])
    own = frames[held]
    hist, te = own[own.year <= test_year - 2], own[own.year == test_year]
    hc = censor(hist, test_year, pull_date)
    out = dict(held_out=held, test_year=test_year, pull_date=pull_date.isoformat(), sources=src,
               n_history=len(hist), n_history_censored=len(hc), classes={})
    for c in transfer.CLASSES:
        a = tr.y[tr.cls == c].to_numpy(float)
        h, k, t = (x.y[x.cls == c].to_numpy(float) for x in (hist, hc, te))
        row = dict(n_source=len(a), n_history=len(h), n_history_censored=len(k), n_test=len(t))
        if min(len(a), len(h), len(k), len(t)) >= min_n:
            row.update(q90_source=float(np.quantile(a, .9)), q90_history=float(np.quantile(h, .9)),
                       q90_history_censored=float(np.quantile(k, .9)), q90_test=float(np.quantile(t, .9)))
            row["ratio_vs_censored"] = tail_check.quantile_ratio(a, k, n_boot=n_boot)
        out["classes"][c] = row
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--pull-date", required=True, type=datetime.date.fromisoformat)
    ap.add_argument("--held", default="seattle")
    ap.add_argument("--test-year", type=int, default=2024)
    a = ap.parse_args()
    cities = [c for c in transfer.CITIES if c != "chicago"
              and os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    frames = {c: transfer.frame(os.path.join(a.data_dir, f"{c}.csv"), "i2c", "cascade2")[0] for c in cities}
    res = check(frames, a.held, a.test_year, a.pull_date)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"truncation_check_{a.held}_i2c_{a.test_year}.json")
    json.dump(res, open(out, "w"), indent=1)
    for c, r in res["classes"].items():
        print(c, json.dumps(r))
