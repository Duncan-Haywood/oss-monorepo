"""Session 95 (post hoc): is a dead permit's completion date a stamp rather than an event?

While the cpin_es3_nc5_clean runs were going, the rows the rule drops turned out to be 9% of the training set
(166,883 rows with SF held out), not the 1.5% session 94 measured over issue years 2010 to 2022: Austin's permits
issued before 2000 are 16% dead (VOID, Expired) with a completion date. Their median and 90th-percentile build time
were both exactly 180 days. This counts, per city, issue era and status group (status_pull.py's groups), how many
dated completions sit exactly on the modal label and on 180 days, and lists each city's most common labels.

Run: python3 src/stamp_check.py DATA_DIR STATUS_DIR [--out results/stamp_check.json]
(DATA_DIR from permits.py pull, STATUS_DIR from status_pull.py). Writes counts only.
"""
import argparse, json, os

import pandas as pd

ERAS = ((1900, 1999), (2000, 2009), (2010, 2022))
STAMP = 180


def labels(data_csv, status_csv):
    """Dated completions with issue-to-completion days `y`, issue year `yr` and status group `grp`
    (joined on permit id and completion day; '?' when the status pull has no matching row)."""
    st = pd.read_csv(status_csv, dtype=str, keep_default_na=False)
    d = pd.read_csv(data_csv, dtype=str, keep_default_na=False, usecols=["permit_id", "issued", "completed"])
    d = d[(d.completed != "") & (d.issued != "")].copy()
    g = dict(zip(zip(st.permit_id, st.completed), st.group))
    d["grp"] = [g.get((p, c), "?") for p, c in zip(d.permit_id, d.completed)]
    d["y"] = (pd.to_datetime(d.completed, errors="coerce") - pd.to_datetime(d.issued, errors="coerce")).dt.days
    d = d[d.y >= 0].copy()
    d["yr"] = d.issued.str[:4].astype(int)
    return d


def summarise(d, stamp=STAMP):
    out = dict(n=int(len(d)), top_labels={str(int(k)): int(v) for k, v in d.y.value_counts().head(5).items()},
               at_stamp=int((d.y == stamp).sum()), by_era={})
    for lo, hi in ERAS:
        m = (d.yr >= lo) & (d.yr <= hi)
        for grp in ("dead", "done"):
            y = d.y[m & (d.grp == grp)]
            if not len(y):
                continue
            mode = int(y.mode().iat[0])
            out["by_era"][f"{lo}-{hi} {grp}"] = dict(
                n=int(len(y)), at_stamp=int((y == stamp).sum()), share_at_stamp=float((y == stamp).mean()),
                modal_days=mode, share_at_mode=float((y == mode).mean()),
                median_days=float(y.median()), p90_days=float(y.quantile(0.9)))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("status_dir")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                                                  "stamp_check.json"))
    a = ap.parse_args()
    res = dict(note="dated completions (issue to completion >= 0 days) by issue era and status group as on the "
                    "pull day; at_stamp = rows exactly 180 days", stamp_days=STAMP, cities={})
    for c in ("austin", "sf", "seattle"):
        res["cities"][c] = summarise(labels(os.path.join(a.data_dir, f"{c}.csv"),
                                            os.path.join(a.status_dir, f"{c}_status.csv")))
        print(c, json.dumps(res["cities"][c]["by_era"]), flush=True)
    json.dump(res, open(a.out, "w"), indent=1)
