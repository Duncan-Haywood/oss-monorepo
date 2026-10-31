"""Descriptive lags per city from the pulled CSVs: `python3 src/describe.py DATA_DIR`.
Writes results/lags.json. Negative lags are counted and dropped from the quantiles."""
import csv, datetime, json, os, sys

def d(s): return datetime.date.fromisoformat(s)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import quantile as q   # one definition (type 7); results/lags.json predates it

out = {}
for city in ["chicago", "sf", "austin"]:
    a2i, i2c = [], []
    with open(os.path.join(sys.argv[1], f"{city}.csv"), newline="") as fh:
        for r in csv.DictReader(fh):
            if r["applied"] and r["issued"]:
                x = (d(r["issued"]) - d(r["applied"])).days
                if x >= 0: a2i.append(x)
            if r["issued"] and r["completed"]:
                x = (d(r["completed"]) - d(r["issued"])).days
                if x >= 0: i2c.append(x)
    f = lambda xs: dict(n=len(xs), **{f"p{int(p*100)}": q(xs, p) for p in (.1, .5, .9)}) if xs else None
    out[city] = dict(applied_to_issued_days=f(a2i), issued_to_completed_days=f(i2c))
    print(city, out[city], flush=True)
json.dump(out, open(os.path.join(os.path.dirname(__file__), "..", "results", "lags.json"), "w"), indent=1)
