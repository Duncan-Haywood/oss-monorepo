"""Session 105: the per-source cuts each robust rule sets on D = 1 January Y, Y = 2017 to 2022, before any model fit.

For SF, Seattle and Austin, from the same frames rounds.py builds (keep_open, rows of years <= Y-1 completed by the
pull): session 104's cut (cpin_es3_ncr, the 0.99 quantile of builds completed in the 3 years before D), the 0.95
quantile (cpin_es3_ncr95) and the 0.99 quantile after batch close-out days are dropped (cpin_es3_ncrd,
rounds.batch_days), with the number of rows and days dropped as batches in each 3-year window. The fits must
report the same thresholds (tfol_boot.robust_summary, M0).

Run: python3 src/robust_cut.py DATA_DIR  (writes results/robust_cut_i2c.json)
"""
import datetime, json, os, sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rounds, transfer  # noqa: E402

YEARS = (2017, 2018, 2019, 2020, 2021, 2022)


def in_window(d, decision, years=rounds.RECENT_YEARS):
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    y = d.y.to_numpy(float)
    return np.isfinite(y) & (y <= win) & (win - y < 365.25 * years)


def city_year(d, Y):
    D = datetime.date(Y, 1, 1)
    f = d[(d.year <= Y - 1) & np.isfinite(d.y.to_numpy(float))]
    out = {v: rounds.recent_threshold_robust(f, D, v)[0] for v in rounds.RECENT_Q}
    m, w = rounds.batch_days(f), in_window(f, D)
    comp = (pd.to_datetime(f.start) + pd.to_timedelta(f.y.to_numpy(float), unit="D")).dt.date.to_numpy()
    out.update(n_window=int(w.sum()), n_batch_in_window=int((m & w).sum()),
               batch_days_in_window=sorted(str(x) for x in set(comp[m & w])))
    return out


def main(data_dir):
    out = {}
    for c in ("sf", "seattle", "austin"):
        d = transfer.frame(os.path.join(data_dir, f"{c}.csv"), "i2c", "cascade2", keep_open=True)[0]
        out[c] = {str(Y): city_year(d, Y) for Y in YEARS}
        for Y in YEARS:
            r = out[c][str(Y)]
            print(c, Y, {v[8:]: round(r[v]) for v in rounds.RECENT_Q}, "batch rows", r["n_batch_in_window"], "of",
                  r["n_window"], "days", len(r["batch_days_in_window"]), flush=True)
    out["note"] = ("session 105: thresholds in days per variant (rounds.RECENT_Q, rounds.batch_days with BATCH_N = "
                   f"{rounds.BATCH_N}, OLD_DAYS = {rounds.OLD_DAYS}); batch counts within the 3-year window before D")
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results", "robust_cut_i2c.json")
    json.dump(out, open(p, "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
