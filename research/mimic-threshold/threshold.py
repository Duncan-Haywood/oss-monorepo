"""mimic-threshold: does a detector's threshold, set for a 5% false-positive rate, hold on an unseen family?

Leave-one-family-out over the 8 families of the stored mimic-contexts suite. For each held family F:
fit the n-gram detector on the other 7 families, set the threshold as the 95th percentile of human
scores in out-of-fold (3-fold) scores of those 7 families, then score F: false-positive rate (human
text flagged as machine) and true-positive rate. Writes results.json and results.txt.
No network, no model. About 5 minutes on 2 CPUs.
"""
import gzip, json, os, sys
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "..", "mimic-contexts", "data", "suite.jsonl.gz")
FAMILIES = ["abstracts", "books", "news", "poetry", "recipes", "reddit", "reviews", "wiki"]
NOMINAL_FPR = 0.05


def load(path=SUITE):
    items = [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]
    for it in items:
        it["y"] = int(it["label"] == "llm")
    return items


def fit(texts, y):
    vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=3, sublinear_tf=True, max_features=200000)
    vw = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=200000)
    X = hstack([vc.fit_transform(texts), vw.fit_transform(texts)]).tocsr()
    clf = LogisticRegression(C=3.0, max_iter=2000).fit(X, y)
    return lambda t: clf.decision_function(hstack([vc.transform(t), vw.transform(t)]).tocsr())


def oof_scores(texts, y, k=3, seed=0, fitter=fit):
    texts = np.array(texts, dtype=object)
    y = np.array(y)
    s = np.zeros(len(y))
    for a, b in StratifiedKFold(k, shuffle=True, random_state=seed).split(texts, y):
        s[b] = fitter(list(texts[a]), y[a])(list(texts[b]))
    return s


def human_quantile_threshold(scores, y, fpr=NOMINAL_FPR):
    """Threshold above which a fraction `fpr` of human (y == 0) scores lie."""
    return float(np.quantile(np.asarray(scores)[np.asarray(y) == 0], 1 - fpr))


def rates(scores, y, thr):
    scores, y = np.asarray(scores), np.asarray(y)
    return {"fpr": float((scores[y == 0] > thr).mean()), "tpr": float((scores[y == 1] > thr).mean())}


def wilson(k, n, z=1.96):
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return float(c - h), float(c + h)


def run(items, families=FAMILIES, fitter=fit):
    out = {}
    for f in families:
        tr = [it for it in items if it["family"] != f]
        te = [it for it in items if it["family"] == f]
        ttr, ytr = [i["text"] for i in tr], [i["y"] for i in tr]
        thr = human_quantile_threshold(oof_scores(ttr, ytr, fitter=fitter), ytr)
        s = fitter(ttr, ytr)([i["text"] for i in te])
        y = [i["y"] for i in te]
        r = rates(s, y, thr)
        nh = y.count(0)
        r.update({"threshold": thr, "auroc": float(roc_auc_score(y, s)), "n_human": nh, "n_llm": y.count(1),
                  "fpr_ci95": list(wilson(round(r["fpr"] * nh), nh)),
                  "tpr_at_matched_fpr": float((np.asarray(s)[np.array(y) == 1] > np.quantile(np.asarray(s)[np.array(y) == 0], 1 - NOMINAL_FPR)).mean())})
        out[f] = r
        print(f, r, file=sys.stderr, flush=True)
    return out


def main():
    items = load()
    res = run(items)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = [f"{'held family':10} {'AUROC':>6} {'FPR (nominal 5%)':>18} {'95% CI':>14} {'TPR':>6} {'TPR @ own 5% FPR':>17}"]
    for f, r in res.items():
        lines.append(f"{f:10} {r['auroc']:6.3f} {r['fpr']:18.3f} {r['fpr_ci95'][0]:6.3f}-{r['fpr_ci95'][1]:.3f} {r['tpr']:6.3f} {r['tpr_at_matched_fpr']:17.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
