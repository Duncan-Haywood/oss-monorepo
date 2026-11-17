"""Reference numbers for reference.test.mjs, from rdrobust 2.1.1 (Python).

rdrobust is GPL-3.0; it is used here only as an external program whose
outputs are recorded. None of its code is in this directory, and the engine
was written from the papers without reading its source.

    python3 -m venv /tmp/rdenv && /tmp/rdenv/bin/pip install rdrobust==2.1.1
    /tmp/rdenv/bin/python eval/reference.py > eval/reference.json
"""
import json, pathlib, warnings
import pandas as pd
from rdrobust import rdrobust, rdbwselect

warnings.filterwarnings("ignore")
here = pathlib.Path(__file__).parent
lee = pd.read_csv(here / "../data/lee-simulated.csv")
fz = pd.read_csv(here / "fuzzy.csv")
ties = pd.read_csv(here / "ties.csv")
DATA = {
    "lee": (lee.vote_margin, lee.next_vote_share, None, 0),
    "lee-placebo": (lee.vote_margin, lee.prior_share, None, 0),
    "fuzzy": (fz.score, fz.outcome, fz.treated, 0),
    "ties": (ties.score, ties.outcome, None, 50),
}
FIXED = [
    ("lee", dict(h=0.3, b=0.5)),
    ("lee", dict(h=0.3, b=0.5, vce="hc0")),
    ("lee", dict(h=0.3, b=0.5, vce="hc1")),
    ("lee", dict(h=0.3, b=0.5, vce="hc2")),
    ("lee", dict(h=0.3, b=0.5, vce="hc3")),
    ("lee", dict(h=0.2, b=0.4, p=2, kernel="uniform")),
    ("lee", dict(h=0.25, b=0.25, kernel="epanechnikov")),
    ("lee", dict(h=0.15, b=0.3, p=0)),
    ("lee", dict(h=0.4, b=0.6, p=3)),
    ("lee-placebo", dict(h=0.3, b=0.45)),
    ("fuzzy", dict(h=0.4, b=0.6)),
    ("fuzzy", dict(h=0.3, b=0.5, vce="hc1")),
    ("ties", dict(h=10, b=15)),
    ("ties", dict(h=12, b=20, vce="hc2")),
]
out = {"package": "rdrobust 2.1.1 (Python)", "fixed": [], "bandwidths": []}
for name, kw in FIXED:
    x, y, d, c = DATA[name]
    extra = {"masspoints": "off"} if name == "ties" else {}
    r = rdrobust(y, x, c=c, fuzzy=d, **kw, **extra)
    out["fixed"].append({
        "data": name, "cutoff": c, "options": kw,
        "estimate": [float(v) for v in r.coef.values.ravel()],
        "se": [float(v) for v in r.se.values.ravel()],
        "n_h": [int(v) for v in r.N_h],
    })
for name, kw in [("lee", {}), ("lee", dict(p=2)), ("lee", dict(kernel="uniform")), ("lee-placebo", {}), ("fuzzy", {}), ("ties", {})]:
    x, y, d, c = DATA[name]
    extra = {"masspoints": "off"} if name == "ties" else {}
    r = rdbwselect(y, x, c=c, **kw, **extra)
    v = r.bws.values.ravel()
    out["bandwidths"].append({"data": name, "cutoff": c, "options": kw, "h": float(v[0]), "b": float(v[2])})
print(json.dumps(out, indent=1))
