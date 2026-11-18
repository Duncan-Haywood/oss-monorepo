"""Independent reference for engine.mjs: statsmodels ConditionalLogit on the
same CSVs, with its own dummy coding, plus a numpy cluster-robust sandwich
and the derived importance and willingness to pay.

    python3 eval/reference.py > eval/reference.json
"""
import json
import pathlib

import numpy as np
import pandas as pd
import scipy
import statsmodels
from statsmodels.discrete.conditional_models import ConditionalLogit

HERE = pathlib.Path(__file__).parent


def parse_levels(text):
    out = []
    for line in text.strip().splitlines():
        name, levels = line.split(":", 1)
        name = name.strip()
        numeric = name.endswith("#")
        out.append((name.rstrip("#").strip(), numeric, [s.strip() for s in levels.split(",")]))
    return out


def fit(csv, levels, price):
    df = pd.read_csv(csv, dtype=str, keep_default_na=False)
    attrs = parse_levels(levels)
    none = (df[[a for a, _, _ in attrs]] == "None").all(axis=1)
    cols, names = [], []
    for name, numeric, lv in attrs:
        if numeric:
            vals = np.array([float(x) for x in lv])
            x = np.where(none, 0.0, pd.to_numeric(df[name].where(~none, "0")) - vals.mean())
            cols.append(x)
            names.append(f"{name} (per unit)")
        else:
            for level in lv[1:]:
                cols.append(((df[name] == level) & ~none).astype(float).to_numpy())
                names.append(f"{name}: {level}")
    has_none = bool(none.any())
    if has_none:
        cols.append(none.astype(float).to_numpy())
        names.append("None (no-choice constant)")
    X = np.column_stack(cols)
    y = df["chosen"].astype(int).to_numpy()
    groups = (df["respondent"] + "|" + df["task"]).to_numpy()
    res = ConditionalLogit(y, X, groups=groups).fit(method="newton", disp=False, maxiter=200, gtol=1e-12)
    beta = res.params
    # Cluster-robust sandwich by respondent, with G/(G-1).
    H = np.zeros((len(beta), len(beta)))
    scores = {}
    for g, idx in pd.Series(np.arange(len(df))).groupby(groups):
        Xi = X[idx.to_numpy()]
        u = Xi @ beta
        p = np.exp(u - u.max())
        p /= p.sum()
        xbar = p @ Xi
        d = Xi - xbar
        H += (d * p[:, None]).T @ d
        r = df["respondent"].iloc[idx.to_numpy()[0]]
        scores[r] = scores.get(r, 0) + (Xi[y[idx.to_numpy()] == 1][0] - xbar)
    Hinv = np.linalg.inv(H)
    S = np.array(list(scores.values()))
    G = len(S)
    Vr = G / (G - 1) * Hinv @ (S.T @ S) @ Hinv
    # Importance and WTP from the coefficients.
    k, ranges, wtp = 0, {}, {}
    slope = None
    for name, numeric, lv in attrs:
        if numeric:
            vals = np.array([float(x) for x in lv])
            ranges[name] = abs(beta[k]) * (vals.max() - vals.min())
            if name == price:
                slope = beta[k]
            k += 1
        else:
            raw = np.concatenate([[0.0], beta[k:k + len(lv) - 1]])
            ranges[name] = raw.max() - raw.min()
            k += len(lv) - 1
    total = sum(ranges.values())
    if slope is not None:
        for i, n in enumerate(names):
            if not n.startswith(price + " "):
                wtp[n] = -beta[i] / slope
    return {
        "names": names,
        "beta": beta.tolist(),
        "se": res.bse.tolist(),
        "se_robust": np.sqrt(np.diag(Vr)).tolist(),
        "llf": float(res.llf),
        "importance": {a: 100 * r / total for a, r in ranges.items()},
        "wtp": wtp,
    }


cases = json.loads((HERE / "cases" / "cases.json").read_text())
cases.insert(0, {"name": "meal-kit", "file": "../data/meal-kit-simulated.csv",
                 "levels": (HERE.parent / "data" / "meal-kit-levels.txt").read_text(),
                 "numeric": ["Price per serving"], "price": "Price per serving"})
out = {"versions": {"numpy": np.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__, "pandas": pd.__version__}, "cases": []}
for c in cases:
    path = HERE / (c.get("file") or f"cases/{c['name']}.csv")
    out["cases"].append({**c, "file": str(path.resolve().relative_to(HERE.parent.resolve())), **fit(path, c["levels"], c["price"])})
print(json.dumps(out, indent=1))
