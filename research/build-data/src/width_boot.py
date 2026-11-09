"""Milestone 7i: week-block bootstrap of the 80% interval width, per-type baseline vs three-key table.

Both use the dequantised, nonempty CQR interval of session 58 (calibration year = test-1).
Reports, per city/target, mean width of each, the paired width difference (table - baseline)
with a 95% week-block bootstrap interval, and each model's coverage. Needs pandas, numpy.
  python3 src/width_boot.py DATA_DIR --test-year 2024
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness, conformal  # noqa: E402
from prior_boosted import bucket  # noqa: E402
from prior_table3 import build, predict, FILES  # noqa: E402

LO, HI, ALPHA = 0.1, 0.9, 0.2


def row_intervals(lo_c, hi_c, y_c, lo_t, hi_t, seed=0):
    """Per-row test intervals after dequantised nonempty CQR."""
    sc = conformal.cqr_scores_dequantised(list(map(float, lo_c)), list(map(float, hi_c)), list(map(float, y_c)), seed)
    q = conformal.conformal_quantile(sc, ALPHA)
    lo, hi = conformal.cqr_interval_nonempty(list(map(float, lo_t)), list(map(float, hi_t)), q)
    return np.array(lo), np.array(hi), q


def run(df, test_year, n_boot=2000):
    df = df.assign(bk=bucket(df.log_cost.to_numpy()), wc=df.work_class.fillna("na").astype(str))
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    base = harness.ReferenceClass([dict(type=a, y=b) for a, b in zip(tr.permit_type, tr.y)])
    bq = lambda d: {t: np.array([base.predict(k)[t] for k in d.permit_type]) for t in (LO, HI)}
    glob = {t: float(tr.y.quantile(t)) for t in harness.TAUS}
    cols = ["permit_type", "wc", "bk"]
    ch = [(lambda r: r, build(tr, cols)), (lambda r: (r[0], r[1]), build(tr, cols[:2])),
          (lambda r: (r[0],), build(tr, cols[:1]))]
    rows = lambda d: list(zip(d.permit_type, d.wc, d.bk))
    tab_c, _ = predict(ch, glob, rows(ca))
    tab_t, _ = predict(ch, glob, rows(te))
    bc, bt = bq(ca), bq(te)
    yca, yte = ca.y.to_numpy(float), te.y.to_numpy(float)
    out, widths, covs = {}, {}, {}
    for name, (C, T) in {"baseline": (bc, bt), "table3": (tab_c, tab_t)}.items():
        lo, hi, q = row_intervals(C[LO], C[HI], yca, T[LO], T[HI])
        widths[name] = hi - lo
        covs[name] = float(np.mean((yte >= lo) & (yte <= hi)))
        out[name] = dict(qhat=q, coverage=covs[name], width=float(np.mean(widths[name])))
    weeks = pd.to_datetime(te.start).dt.strftime("%G-%V").to_numpy()
    d, lo_ci, hi_ci = boosted.block_boot(widths["table3"] - widths["baseline"], weeks, n_boot)
    out["width_diff_table_minus_baseline"] = dict(mean=d, ci95=[lo_ci, hi_ci])
    out["n_test"] = len(te)
    out["n_weeks"] = int(len(set(weeks)))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir"); ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    res = []
    for city, targets in FILES.items():
        for tg in targets:
            if a.only and f"{city}:{tg}" not in a.only:
                continue
            p = os.path.join(a.data_dir, f"{city}.csv")
            if not os.path.exists(p):
                print("skip", city); continue
            df, _ = boosted.load_frame(p, tg)
            r = run(df, a.test_year); r.update(city=city, target=tg, test_year=a.test_year); res.append(r)
            print(city, tg, json.dumps({k: r[k] for k in ("baseline", "table3", "width_diff_table_minus_baseline")}), flush=True)
    json.dump(res, open(os.path.join(here, f"width_boot_{a.test_year}.json"), "w"), indent=1)
