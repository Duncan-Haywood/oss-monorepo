"""Session 104: what each city's records say on D = 1 January Y, Y = 2017 to 2022, before any model is fitted.

For SF, Seattle and Austin: the session-104 cut (rounds.recent_threshold, the 0.99 quantile of builds completed in
the 3 years before D, over permits issued before D) beside session 93's (rounds.q_threshold over years <= Y-2), and
session 103's next step (2): of the permits issued before D and still open on D, the share open for more than 3, 4
and 5 years. Permits never completed by the pull count as open (keep_open, as the cpin_es3_nc* variants see them).

Post hoc (after the session-104 fits): per city, the completions each calendar year of permits issued over 8 years
earlier, and the share of each 3-year window's completions that took over 8 years.

Run: python3 src/open_share.py DATA_DIR  (writes results/open_share_i2c.json)
"""
import datetime, json, os, sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rounds, transfer  # noqa: E402

YEARS = (2017, 2018, 2019, 2020, 2021, 2022)
CUTS = {"3y": 1095, "4y": 1461, "5y": 1826}


def open_shares(d, decision, cuts=CUTS):
    """Of d's rows issued before `decision` and open on it (completion after it, or never), the count and the share
    whose window on `decision` exceeds each cut."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    y = d.y.to_numpy(float)
    op = (win > 0) & (y > win)
    n = int(op.sum())
    return dict(n_open=n, **{f"share_open_over_{k}": (float((win[op] > v).mean()) if n else None)
                             for k, v in cuts.items()})


def old_completions(d, years=range(2010, 2023), old_days=2922):
    """Session 104, post hoc: per calendar year, how many of d's completions close a permit issued more than
    `old_days` (8 years) earlier: batch close-outs of old permits move a tail quantile of recent builds."""
    s = pd.to_datetime(d.start)
    y = d.y.to_numpy(float)
    fin = np.isfinite(y) & (y > old_days)
    cy = (s[fin] + pd.to_timedelta(y[fin], unit="D")).dt.year.value_counts()
    return {str(Y): int(cy.get(Y, 0)) for Y in years}


def recent_old_share(d, decision, old_days=2922, years=3):
    """Session 104, post hoc: the share of d's builds completed in the `years` years before `decision` (issued
    before it) that took more than `old_days`."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    y = d.y.to_numpy(float)
    m = np.isfinite(y) & (win > 0) & (y <= win) & (win - y < 365.25 * years)
    return float((y[m] > old_days).mean()) if m.any() else None


def city_year(d, Y):
    D = datetime.date(Y, 1, 1)
    fin = np.isfinite(d.y.to_numpy(float))
    return dict(recent_threshold=rounds.recent_threshold(d[(d.year <= Y - 1) & fin], D),
                all_years_threshold=rounds.q_threshold(d[(d.year <= Y - 2) & fin], D),
                recent_share_over_8y=recent_old_share(d, D), **open_shares(d[d.year <= Y - 1], D))


def main(data_dir):
    out = {}
    for c in ("sf", "seattle", "austin"):
        d = transfer.frame(os.path.join(data_dir, f"{c}.csv"), "i2c", "cascade2", keep_open=True)[0]
        out[c] = {str(Y): city_year(d, Y) for Y in YEARS}
        out[c]["old_completions_by_year"] = old_completions(d)
        print(c, "completions of permits issued over 8 years earlier, by year:", out[c]["old_completions_by_year"])
        for Y in YEARS:
            r = out[c][str(Y)]
            print(c, Y, round(r["recent_threshold"]), round(r["all_years_threshold"]), r["n_open"],
                  *(round(r[f"share_open_over_{k}"], 3) for k in CUTS), flush=True)
    out["note"] = ("session 104: thresholds in days (0.99 quantile of issue-to-completion days); shares among permits "
                   "issued before D = 1 January Y and open on D, never-completed permits counted open")
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results", "open_share_i2c.json")
    json.dump(out, open(p, "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
