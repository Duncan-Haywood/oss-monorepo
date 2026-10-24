"""Milestone 5 analysis: predict proof success from cheap features, leave-one-design-out.

Needs numpy and scikit-learn. Writes results.txt. Label thresholds (1, 3, 10 s) are set in the log before the run.
"""
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
PASSES = ["balance", "rewrite", "rewrite -z", "refactor", "refactor -z", "dc2", "dch"]


def load():
    rows = []
    for fn in ("results.jsonl", "results_mult.jsonl"):
        if (HERE / fn).exists():
            rows += [json.loads(l) for l in open(HERE / fn)]
    return [r for r in rows if r["status"] == "ok"]


def feats(r, design_level=True):
    f = [len(r["seq"])] + [r["seq"].count(p) for p in PASSES]
    f += [r["cells"], r["depth"], r["cells"] / r["ref_cells"]]
    if design_level:
        f += [r["ref_cells"], r["input_bits"]]
    return f


def label(r, thr):
    return bool(r["proved"] and r["t_sat"] <= thr)


def auc(y, s):
    return roc_auc_score(y, s) if len(set(y)) == 2 else None


def fit_predict(kind, X, y, Xt):
    if len(set(y)) < 2:
        return np.full(len(Xt), float(y[0]))
    if kind == "logreg":
        sc = StandardScaler().fit(X)
        m = LogisticRegression(C=1.0, max_iter=1000).fit(sc.transform(X), y)
        return m.predict_proba(sc.transform(Xt))[:, 1]
    m = GradientBoostingClassifier(n_estimators=100, max_depth=2, random_state=0).fit(X, y)
    return m.predict_proba(Xt)[:, 1]


def main():
    rows = load()
    designs = sorted({r["design"] for r in rows})
    out = []
    P = lambda *a: (print(*a), out.append(" ".join(str(x) for x in a)))
    P(f"{len(rows)} proofs, {len(designs)} designs; timed out at 10 s: {sum(r['timed_out'] for r in rows)}, counterexample: {sum(r['cex'] for r in rows)}")
    P("design: n, proved<=1s / <=3s / <=10s, median t_sat (s)")
    for d in designs:
        rs = [r for r in rows if r["design"] == d]
        P(f"  {d}: {len(rs)}, " + " / ".join(str(sum(label(r, t) for r in rs)) for t in (1, 3, 10)) + f", {np.median([r['t_sat'] for r in rs]):.2f}")
    for thr in (3, 1, 10):
        P(f"\n== success = proved within {thr} s")
        y = np.array([label(r, thr) for r in rows])
        P(f"base rate {y.mean():.3f}")
        for name, kind, dl in [("logreg, all features", "logreg", True), ("gbt, all features", "gbt", True),
                               ("logreg, rewrite features only", "logreg", False), ("gbt, rewrite features only", "gbt", False)]:
            X = np.array([feats(r, dl) for r in rows], float)
            oof = np.zeros(len(rows))
            per = {}
            for d in designs:
                te = np.array([r["design"] == d for r in rows])
                oof[te] = fit_predict(kind, X[~te], y[~te], X[te])
                per[d] = auc(y[te], oof[te])
            ok = {d: a for d, a in per.items() if a is not None}
            P(f"{name}: pooled out-of-fold AUC {auc(y, oof):.3f}; per held-out design AUC (both classes present, n={len(ok)}): "
              + ", ".join(f"{d} {a:.2f}" for d, a in ok.items()) + (f"; mean {np.mean(list(ok.values())):.3f}" if ok else ""))
        for nm, col in [("sequence length alone", 0), ("cells/ref_cells alone", len(PASSES) + 3)]:
            X = np.array([feats(r) for r in rows], float)
            s = -X[:, col]
            ok = {}
            for d in designs:
                te = np.array([r["design"] == d for r in rows])
                a = auc(y[te], s[te])
                if a is not None:
                    ok[d] = a
            P(f"baseline {nm} (score = minus feature): pooled AUC {auc(y, s):.3f}; within-design mean {np.mean(list(ok.values())) if ok else float('nan'):.3f} over {len(ok)} designs")
        # within-design: 5-fold stratified CV inside each design with both classes (rewrite features only, no design-level ones)
        Xr = np.array([feats(r, False) for r in rows], float)
        for kind in ("logreg", "gbt"):
            res = {}
            for d in designs:
                te = np.array([r["design"] == d for r in rows])
                yd, Xd = y[te], Xr[te]
                if min(yd.sum(), (~yd).sum()) < 5:
                    continue
                aucs = []
                for seed in range(5):
                    oof = np.zeros(len(yd))
                    for tr, va in StratifiedKFold(5, shuffle=True, random_state=seed).split(Xd, yd):
                        oof[va] = fit_predict(kind, Xd[tr], yd[tr], Xd[va])
                    aucs.append(roc_auc_score(yd, oof))
                res[d] = (np.mean(aucs), np.std(aucs))
            P(f"within-design 5-fold CV AUC, {kind}, designs with >=5 of each class ({len(res)}): " + ", ".join(f"{d} {m:.2f}+/-{s:.2f} (n={int(y[[r['design']==d for r in rows]].sum())}/{sum(r['design']==d for r in rows)})" for d, (m, s) in res.items()))
        # oracle design identity: score = the design's own success rate (uses the held-out labels; an upper bound on what
        # design-level information alone gives pooled)
        rate = {d: y[[r["design"] == d for r in rows]].mean() for d in designs}
        P(f"oracle design-rate predictor pooled AUC {auc(y, np.array([rate[r['design']] for r in rows])):.3f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
