"""Independent reference values for engine.test.mjs.

    PY=$(python3 platform/ci/pyenv.py numpy scipy sklearn)
    $PY -I ventures/probability-calibration/eval/reference.py > ventures/probability-calibration/eval/reference.json

scikit-learn (BSD-3-Clause) gives the isotonic fit, Brier score, log loss,
AUC and the unpenalised logistic regression; numpy and scipy (BSD-3-Clause)
the rest, written here from the formulas, not from engine.mjs. No code from
these projects is in the tool.
"""

import csv
import json
import os
import sys

import numpy as np
import scipy
import sklearn
from scipy.stats import norm
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))


def corp(p, y, score):
    c = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(p, y).predict(p)
    r = np.full_like(p, y.mean())
    if score == "brier":
        S = lambda f: brier_score_loss(y, f)
    else:
        S = lambda f: log_loss(y, np.clip(f, 1e-300, 1 - 1e-16), labels=[0, 1])
    return {"score": S(p), "mcb": S(p) - S(c), "dsc": S(r) - S(c), "unc": S(r), "fit": c}


def binned(p, y, bins, binning):
    if binning == "count":
        s = np.sort(p)
        edges = [0.0] + [s[(b * len(s)) // bins] for b in range(1, bins)] + [1.0]
        edges = sorted(set(edges))
    else:
        edges = [i / bins for i in range(bins + 1)]
    edges = np.array(edges)
    idx = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, len(edges) - 2)
    n = len(p)
    base = y.mean()
    ece = mce = rel = res = 0.0
    for b in range(len(edges) - 1):
        m = idx == b
        if not m.any():
            continue
        mp, my, w = p[m].mean(), y[m].mean(), m.sum() / n
        ece += w * abs(my - mp)
        mce = max(mce, abs(my - mp))
        rel += w * (mp - my) ** 2
        res += w * (my - base) ** 2
    return {"ece": ece, "mce": mce, "reliability": rel, "resolution": res, "uncertainty": base * (1 - base)}


def case(name, p, y):
    p = np.asarray(p, float)
    y = np.asarray(y, float)
    cb = corp(p, y, "brier")
    cl = corp(p, y, "log")
    q = np.clip(p, 1e-6, 1 - 1e-6)
    x = np.log(q / (1 - q))
    lr = LogisticRegression(C=np.inf, tol=1e-12, max_iter=10000).fit(x[:, None], y.astype(int))
    num = np.sum((y - p) * (1 - 2 * p))
    den = np.sqrt(np.sum((1 - 2 * p) ** 2 * p * (1 - p)))
    z = num / den
    zo = (y.sum() - p.sum()) / np.sqrt(np.sum(p * (1 - p)))
    return {
        "name": name,
        "p": p.tolist(),
        "y": y.astype(int).tolist(),
        "brier": {k: cb[k] for k in ("score", "mcb", "dsc", "unc")},
        "log": {k: cl[k] for k in ("score", "mcb", "dsc", "unc")},
        "isotonic": cb["fit"].tolist(),
        "auc": roc_auc_score(y, p),
        "cox": {"intercept": float(lr.intercept_[0]), "slope": float(lr.coef_[0][0])},
        "spiegelhalter": {"z": z, "p": 2 * norm.sf(abs(z))},
        "inTheLarge": {"z": zo, "p": 2 * norm.sf(abs(zo))},
        "binned10width": binned(p, y, 10, "width"),
        "binned10count": binned(p, y, 10, "count"),
    }


def main():
    with open(os.path.join(HERE, "..", "data", "nfl-elo-2010-2020.csv"), newline="") as f:
        rows = list(csv.DictReader(f))
    nfl_p = [float(r["elo_prob_home"]) for r in rows]
    nfl_y = [int(r["home_won"]) for r in rows]
    rng = np.random.default_rng(20261116)
    # Weather-style forecasts on a 0.1 grid (many ties), drawn too extreme:
    # the truth is a squashed version of the forecast.
    pp = rng.integers(1, 10, 600) / 10
    truth = 0.5 + 0.7 * (pp - 0.5)
    py = (rng.uniform(0, 1, 600) < truth).astype(int)
    small_p = [0.1, 0.2, 0.2, 0.35, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.85, 0.9]
    small_y = [0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1]
    out = {
        "versions": {"sklearn": sklearn.__version__, "scipy": scipy.__version__, "numpy": np.__version__, "python": sys.version.split()[0]},
        "cases": [case("nfl-elo-2010-2020", nfl_p, nfl_y), case("grid-overconfident", pp, py), case("small", small_p, small_y)],
    }
    out["cases"][0].pop("p")
    out["cases"][0].pop("y")
    out["cases"][0].pop("isotonic")
    json.dump(out, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
