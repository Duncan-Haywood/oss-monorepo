"""Independent reference values for engine.mjs, written to eval/reference.json.

    python3 -I eval/reference.py

Computed differently from the engine on purpose:
- AUC from scipy.stats.mannwhitneyu (U / mn), and again from the O(mn) kernel;
- DeLong placements straight from the definition, psi(x, y) = 1, 1/2 or 0
  over every case-control pair (the engine uses midranks, Sun & Xu 2014);
- p-values from scipy.stats.norm and scipy.stats.chi2;
- Wilson intervals from scipy.stats.binomtest(...).proportion_ci("wilson");
- the partial AUC by numpy.trapezoid on a curve built with numpy.unique.
numpy 2.5.3 and scipy 1.18.1 (BSD-3-Clause), used only here.
"""
import csv
import json
from pathlib import Path

import numpy as np
from scipy import stats

HERE = Path(__file__).resolve().parent


def psi_matrix(x, y):
    return (x[:, None] > y[None, :]) + 0.5 * (x[:, None] == y[None, :])


def delong_definition(scores, label):
    X = [s[label == 1] for s in scores]
    Y = [s[label == 0] for s in scores]
    m, n = len(X[0]), len(Y[0])
    V10, V01, auc = [], [], []
    for x, y in zip(X, Y):
        P = psi_matrix(x, y)
        V10.append(P.mean(1))
        V01.append(P.mean(0))
        auc.append(P.mean())
    S = np.cov(np.array(V10)) / m + np.cov(np.array(V01)) / n
    return np.array(auc), np.atleast_2d(S)


def roc_points(score, label):
    t = np.unique(score)[::-1]
    tpr = np.array([0.0] + [np.mean(score[label == 1] >= c) for c in t])
    fpr = np.array([0.0] + [np.mean(score[label == 0] >= c) for c in t])
    return t, tpr, fpr


def partial_auc(score, label, e):
    _, tpr, fpr = roc_points(score, label)
    grid = np.union1d(fpr[fpr <= e], [e])
    # TPR along the polyline at each grid FPR; vertical runs (equal FPR) take
    # the top, so integrate the upper envelope piece by piece instead.
    area = 0.0
    for i in range(1, len(fpr)):
        x0, x1, y0, y1 = fpr[i - 1], fpr[i], tpr[i - 1], tpr[i]
        if x0 >= e:
            break
        if x1 > e:
            y1 = y0 + (y1 - y0) * (e - x0) / (x1 - x0)
            x1 = e
        area += np.trapezoid([y0, y1], [x0, x1])
    return float(area), grid.size


def case(name, scores, label, names, level=0.95, e=0.1, cut=None):
    z = stats.norm.ppf(1 - (1 - level) / 2)
    auc, S = delong_definition(scores, label)
    out = {"name": name, "names": names, "n": int(len(label)), "cases": int(label.sum()), "auc": auc.tolist(), "S": S.tolist()}
    out["auc_mannwhitney"] = [float(stats.mannwhitneyu(s[label == 1], s[label == 0]).statistic / (label.sum() * (len(label) - label.sum()))) for s in scores]
    se = np.sqrt(np.diag(S))
    out["lower"] = np.clip(auc - z * se, 0, 1).tolist()
    out["upper"] = np.clip(auc + z * se, 0, 1).tolist()
    pairs = []
    k = len(scores)
    for a in range(k):
        for b in range(a + 1, k):
            d = auc[a] - auc[b]
            sd = np.sqrt(S[a, a] + S[b, b] - 2 * S[a, b])
            pairs.append({"a": names[a], "b": names[b], "diff": float(d), "se": float(sd), "z": float(d / sd), "p": float(2 * stats.norm.sf(abs(d / sd)))})
    out["pairs"] = pairs
    if k >= 3:
        L = np.array([[1 if i == 0 else (-1 if i == j else 0) for i in range(k)] for j in range(1, k)], float)
        v = L @ auc
        chi2 = float(v @ np.linalg.solve(L @ S @ L.T, v))
        out["overall"] = {"chi2": chi2, "df": k - 1, "p": float(stats.chi2.sf(chi2, k - 1))}
    out["partial"] = []
    for s in scores:
        raw, _ = partial_auc(s, label, e)
        lo = e * e / 2
        out["partial"].append({"raw": raw, "standardised": 0.5 * (1 + (raw - lo) / (e - lo))})
    if cut is not None:
        s = scores[0]
        pos = s >= cut
        tp = int(np.sum(pos & (label == 1)))
        fp = int(np.sum(pos & (label == 0)))
        fn = int(np.sum(~pos & (label == 1)))
        tn = int(np.sum(~pos & (label == 0)))
        sens = stats.binomtest(tp, tp + fn).proportion_ci(level, method="wilson")
        spec = stats.binomtest(tn, tn + fp).proportion_ci(level, method="wilson")
        lrp = (tp / (tp + fn)) / (fp / (fp + tn))
        se_lrp = np.sqrt(1 / tp - 1 / (tp + fn) + 1 / fp - 1 / (fp + tn))
        out["cut"] = {"threshold": cut, "tp": tp, "fp": fp, "fn": fn, "tn": tn,
                      "sens_ci": [sens.low, sens.high], "spec_ci": [spec.low, spec.high],
                      "lr_plus": lrp, "lr_plus_ci": [lrp * np.exp(-z * se_lrp), lrp * np.exp(z * se_lrp)]}
        # Youden from the definition
        t, tpr, fpr = roc_points(s, label)
        j = tpr[1:] - fpr[1:]
        out["youden"] = {"threshold": float(t[np.argmax(j)]), "j": float(j.max())}
    return out


def net_benefit(prob, label, pts):
    N = len(label)
    prev = label.mean()
    rows = []
    for pt in pts:
        tp = np.sum((prob >= pt) & (label == 1))
        fp = np.sum((prob >= pt) & (label == 0))
        w = pt / (1 - pt)
        rows.append({"pt": pt, "model": float(tp / N - fp / N * w), "all": float(prev - (1 - prev) * w)})
    return rows


def main():
    rows = list(csv.DictReader(open(HERE.parent / "data" / "wdbc-markers.csv")))
    label = np.array([1 if r["diagnosis"] == "malignant" else 0 for r in rows])
    names = ["worst_concave_points", "worst_perimeter", "mean_texture", "mean_smoothness", "cv_probability"]
    scores = [np.array([float(r[c]) for r in rows]) for c in names]
    cases = [case("wdbc", scores, label, names, cut=0.1359)]

    # Hanley & McNeil (1982), Table 1: 109 CT images rated 1 (definitely
    # normal) to 5 (definitely abnormal); the paper reports AUC 0.893.
    normal = [33, 6, 6, 11, 2]
    abnormal = [3, 2, 2, 11, 33]
    rating = np.array([k + 1 for k, c in enumerate(normal) for _ in range(c)] + [k + 1 for k, c in enumerate(abnormal) for _ in range(c)], float)
    lab = np.array([0] * sum(normal) + [1] * sum(abnormal))
    cases.append(case("hanley-mcneil-1982", [rating], lab, ["rating"], cut=4))

    # Simulated, heavy ties, three correlated scores, one where lower = case.
    rng = np.random.default_rng(20261119)
    n = 300
    lab = (rng.random(n) < 0.3).astype(int)
    latent = rng.normal(size=n) + 1.0 * lab
    a = np.round(latent + rng.normal(scale=0.8, size=n), 1)
    b = np.round(latent + rng.normal(scale=1.2, size=n))
    c = -np.round(latent * 2 + rng.normal(scale=1.5, size=n), 1)  # lower = case
    cases.append(case("simulated", [a, b, -c], lab, ["a", "b", "c"], e=0.2, cut=0.5))
    sim = {"y": lab.tolist(), "a": a.tolist(), "b": b.tolist(), "c": c.tolist()}

    pts = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]
    dca = net_benefit(scores[4], label, pts)
    out = {"numpy": np.__version__, "scipy": __import__("scipy").__version__, "cases": cases, "simulated_data": sim, "decision_wdbc_cv_probability": dca}
    (HERE / "reference.json").write_text(json.dumps(out, indent=1) + "\n")
    for c in cases:
        print(c["name"], [round(x, 6) for x in c["auc"]])


if __name__ == "__main__":
    main()
