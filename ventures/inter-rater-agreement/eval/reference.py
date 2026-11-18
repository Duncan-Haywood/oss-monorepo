"""Independent reference values for engine.test.mjs.

Run from the venture directory:
    python3 eval/reference.py > eval/reference.json

The libraries below are used only here, to produce numbers; no code from any
of them is in the engine (several are GPL, which this MIT tree cannot take):
krippendorff (GPL-3.0), pingouin (GPL-3.0), irrCAC (MIT, Gwet's formulas),
scikit-learn (BSD-3-Clause), statsmodels (BSD-3-Clause), numpy, pandas.
The random test sets are generated here with a fixed seed and written into
the JSON, so the JavaScript tests read exactly the same ratings.
"""
import csv
import json
import sys
from importlib.metadata import version

import numpy as np
import pandas as pd
import krippendorff
import pingouin as pg
from scipy import stats
from irrCAC.raw import CAC
from sklearn.metrics import cohen_kappa_score
from statsmodels.stats.inter_rater import cohens_kappa, fleiss_kappa, aggregate_raters

nan = float("nan")


def jnum(x):
    x = float(x)
    return None if np.isnan(x) else x


def wide_from_long(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    items, raters = [], []
    for r in rows:
        if r["comment_id"] not in items:
            items.append(r["comment_id"])
        if r["rater_id"] not in raters:
            raters.append(r["rater_id"])
    m = [[None] * len(raters) for _ in items]
    ii = {k: i for i, k in enumerate(items)}
    jj = {k: j for j, k in enumerate(raters)}
    for r in rows:
        m[ii[r["comment_id"]]][jj[r["rater_id"]]] = r["sentiment"] or None
    return m, raters


def multi_refs(matrix, cats, metrics):
    """matrix: subjects x raters (None = missing), cats: category labels in order."""
    code = {c: i + 1 for i, c in enumerate(cats)}
    num = np.array([[code[v] if v is not None else nan for v in row] for row in matrix], float)
    out = {}
    for m in metrics:
        out[f"alpha_{m}"] = float(krippendorff.alpha(reliability_data=num.T, level_of_measurement=m))
    df = pd.DataFrame(num)
    cac = CAC(df, categories=list(range(1, len(cats) + 1)))
    out["fleiss"] = jnum(cac.fleiss()["est"]["coefficient_value"])
    out["gwet"] = jnum(cac.gwet()["est"]["coefficient_value"])
    out["pa"] = jnum(cac.gwet()["est"]["pa"])
    if "ordinal" in metrics:
        cacq = CAC(df, weights="quadratic", categories=list(range(1, len(cats) + 1)))
        out["fleiss_quadratic"] = jnum(cacq.fleiss()["est"]["coefficient_value"])
        out["gwet_quadratic"] = jnum(cacq.gwet()["est"]["coefficient_value"])
    return out


out = {
    "versions": {k: version(k) for k in ["krippendorff", "pingouin", "irrCAC", "scikit-learn", "statsmodels", "numpy", "pandas", "scipy"]},
    "python": sys.version.split()[0],
}

# 1. The bundled example: GoEmotions sentiment, long layout.
ge, ge_raters = wide_from_long("data/goemotions-sentiment.csv")
ge_cats = []
for row in ge:
    for v in row:
        if v is not None and v not in ge_cats:
            ge_cats.append(v)
out["goemotions"] = {"categories": ge_cats, **multi_refs(ge, ge_cats, ["nominal"])}

# 2. Krippendorff (2011), "Computing Krippendorff's alpha-reliability", section C:
#    4 observers, 12 units, values 1-5, with missing data. Published: nominal 0.743,
#    ordinal 0.815, interval 0.849, ratio 0.797.
k11 = [[1, 2, 3, 3, 2, 1, 4, 1, 2, None, None, None],
       [1, 2, 3, 3, 2, 2, 4, 1, 2, 5, None, 3],
       [None, 3, 3, 3, 2, 3, 4, 2, 2, 5, 1, None],
       [1, 2, 3, 3, 2, 4, 4, 1, 2, 5, 1, None]]
k11_units = [list(col) for col in zip(*k11)]
kn = np.array([[nan if v is None else v for v in r] for r in k11], float)
out["krippendorff2011"] = {
    "ratings": k11_units,
    **{f"alpha_{m}": float(krippendorff.alpha(reliability_data=kn, level_of_measurement=m)) for m in ["nominal", "ordinal", "interval", "ratio"]},
}

# 3. Shrout & Fleiss (1979), Table 2: 6 targets, 4 judges.
sf = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]]


PG_NAMES = {"ICC1": "ICC(1,1)", "ICC2": "ICC(A,1)", "ICC3": "ICC(C,1)", "ICC1k": "ICC(1,k)", "ICC2k": "ICC(A,k)", "ICC3k": "ICC(C,k)"}


def icc_refs(m):
    """pingouin's ICC, F and p (full precision; it rounds CI95 to 2 dp), plus the
    McGraw & Wong (1996) intervals written out here with scipy's F quantiles."""
    long = pd.DataFrame([(i, j, v) for i, row in enumerate(m) for j, v in enumerate(row)], columns=["t", "r", "y"])
    t = pg.intraclass_corr(data=long, targets="t", raters="r", ratings="y").set_index("Type")
    x = np.asarray(m, float)
    n, k = x.shape
    gm = x.mean()
    msr = k * ((x.mean(1) - gm) ** 2).sum() / (n - 1)
    msc = n * ((x.mean(0) - gm) ** 2).sum() / (k - 1)
    sst = ((x - gm) ** 2).sum()
    mse = (sst - msr * (n - 1) - msc * (k - 1)) / ((n - 1) * (k - 1))
    msw = (sst - msr * (n - 1)) / (n * (k - 1))
    q = lambda d1, d2: stats.f.ppf(0.975, d1, d2)
    ci = {}
    F1 = msr / msw
    FL, FU = F1 / q(n - 1, n * (k - 1)), F1 * q(n * (k - 1), n - 1)
    ci["ICC1"] = ((FL - 1) / (FL + k - 1), (FU - 1) / (FU + k - 1))
    ci["ICC1k"] = (1 - 1 / FL, 1 - 1 / FU)
    F3 = msr / mse
    FL, FU = F3 / q(n - 1, (n - 1) * (k - 1)), F3 * q((n - 1) * (k - 1), n - 1)
    ci["ICC3"] = ((FL - 1) / (FL + k - 1), (FU - 1) / (FU + k - 1))
    ci["ICC3k"] = (1 - 1 / FL, 1 - 1 / FU)
    r2 = (msr - mse) / (msr + (k - 1) * mse + k * (msc - mse) / n)
    A = k * r2 / (n * (1 - r2))
    B = 1 + k * r2 * (n - 1) / (n * (1 - r2))
    v = (A * msc + B * mse) ** 2 / ((A * msc) ** 2 / (k - 1) + (B * mse) ** 2 / ((n - 1) * (k - 1)))
    f3, f4 = q(n - 1, v), q(v, n - 1)
    L = n * (msr - f3 * mse) / (f3 * (k * msc + (k * n - k - n) * mse) + n * msr)
    U = n * (f4 * msr - mse) / (k * msc + (k * n - k - n) * mse + n * f4 * msr)
    ci["ICC2"] = (L, U)
    ci["ICC2k"] = (L * k / (1 + L * (k - 1)), U * k / (1 + U * (k - 1)))
    out = {}
    for key, name in PG_NAMES.items():
        out[key] = {"icc": float(t.loc[name, "ICC"]), "F": float(t.loc[name, "F"]), "p": float(t.loc[name, "pval"]),
                    "pingouin_ci95": [float(c) for c in t.loc[name, "CI95"]], "low": float(ci[key][0]), "high": float(ci[key][1])}
    return out


out["shroutfleiss"] = {"ratings": sf, "icc": icc_refs(sf)}

rng = np.random.default_rng(20261115)

# 4. Two raters, 5 ordered categories, 120 subjects, correlated.
truth = rng.integers(0, 5, 120)
a = np.clip(truth + rng.integers(-1, 2, 120), 0, 4)
b = np.clip(truth + rng.choice([-2, -1, 0, 0, 0, 1], 120), 0, 4)
two = {"a": a.tolist(), "b": b.tolist()}
for w in [None, "linear", "quadratic"]:
    two[f"sklearn_{w or 'none'}"] = float(cohen_kappa_score(a, b, weights=w))
table = np.zeros((5, 5))
for x, y in zip(a, b):
    table[x, y] += 1
for name, wt in [("none", None), ("linear", "linear"), ("quadratic", "quadratic")]:
    r = cohens_kappa(table, wt=wt) if wt else cohens_kappa(table)
    two[f"statsmodels_{name}"] = {"kappa": float(r.kappa), "se": float(r.std_kappa), "se0": float(r.std_kappa0)}
out["two_raters"] = two

# 5. Five raters, 4 ordered levels, 80 subjects, 15% missing.
truth = rng.integers(0, 4, 80)
mr = []
for t in truth:
    row = []
    for j in range(5):
        if rng.random() < 0.15:
            row.append(None)
        else:
            row.append(int(np.clip(t + rng.choice([-1, 0, 0, 0, 1]) + (1 if j == 4 and rng.random() < 0.4 else 0), 0, 3)) + 1)
    mr.append(row)
out["multi_missing"] = {"ratings": mr, **multi_refs([[None if v is None else str(v) for v in r] for r in mr], ["1", "2", "3", "4"], ["nominal", "ordinal", "interval", "ratio"])}

# 6. Complete nominal data for statsmodels' Fleiss: 60 subjects, 6 raters, 3 categories.
truth = rng.integers(0, 3, 60)
fc = [[int(t if rng.random() < 0.7 else rng.integers(0, 3)) for _ in range(6)] for t in truth]
agg, _ = aggregate_raters(np.array(fc), n_cat=3)
out["fleiss_complete"] = {"ratings": fc, "statsmodels_fleiss": float(fleiss_kappa(agg, method="fleiss")), "statsmodels_randolph": float(fleiss_kappa(agg, method="randolph"))}

# 7. Complete numeric ratings for the ICC: 40 subjects, 3 raters with a bias.
true = rng.normal(50, 10, 40)
num = [[float(round(x + rng.normal(0, 4) + bias, 1)) for bias in (0, 3, -2)] for x in true]
out["icc_numeric"] = {"ratings": num, "icc": icc_refs(num), "alpha_interval": float(krippendorff.alpha(reliability_data=np.array(num).T, level_of_measurement="interval"))}

json.dump(out, sys.stdout, indent=1)
print()
