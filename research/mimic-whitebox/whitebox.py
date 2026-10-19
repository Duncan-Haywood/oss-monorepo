"""White-box evasion of a linear word n-gram human-vs-machine detector, AUROC against edit budget.

The imitator knows the detector's weights. For each held-out machine text it edits the k word types with the
largest machine-ward contribution (weight x tf-idf value): either deletes them ("delete") or swaps each for a
fixed human-ward filler word ("swap"). It controls only its own text. We report held-out AUROC against k for
the original detector and for an adaptive detector refit on training machine texts attacked the same way
(k = the same budget, against the original detector). Writes results.json and results.txt.
"""
import json, os, re, sys
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
CTX = os.path.join(HERE, "..", "mimic-contexts")
sys.path.insert(0, CTX)
BUDGETS = [0, 1, 2, 5, 10, 20, 40]
TOK = re.compile(r"\w+|\W+")


def fit(texts, y):
    vec = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=200000)
    X = vec.fit_transform(texts)
    clf = LogisticRegression(C=3.0, max_iter=2000).fit(X, y)
    return vec, clf


def score(det, texts):
    vec, clf = det
    return clf.decision_function(vec.transform(texts))


def attack(det, text, k, mode, filler):
    """Edit up to k distinct word types, picked by unigram contribution to the machine score."""
    if k == 0:
        return text
    vec, clf = det
    voc, w = vec.vocabulary_, clf.coef_[0]
    x = vec.transform([text])
    contrib = {}
    for j, v in zip(x.indices, x.data):
        contrib[j] = w[j] * v
    uni = {}
    for tok in set(t.lower() for t in TOK.findall(text) if t.strip() and t[0].isalnum()):
        j = voc.get(tok)
        if j is not None and contrib.get(j, 0) > 0:
            uni[tok] = contrib[j]
    pick = set(sorted(uni, key=uni.get, reverse=True)[:k])
    out = []
    for t in TOK.findall(text):
        if t.lower() in pick:
            if mode == "swap":
                out.append(filler)
            elif out and out[-1].isspace() is False and not out[-1].strip():
                continue
        else:
            out.append(t)
    return "".join(out) if mode == "swap" else re.sub(r"[ \t]{2,}", " ", "".join(out))


def human_filler(det):
    vec, clf = det
    inv = {j: t for t, j in vec.vocabulary_.items() if " " not in t}
    j = min(inv, key=lambda j: clf.coef_[0][j])
    return inv[j]


def main():
    import evaluate as E
    os.chdir(CTX)
    items = E.load()
    tr = [it for it in items if it["family"] in E.TRAIN]
    held = [it for it in items if it["family"] in E.HELD]
    y = [it["y"] for it in held]
    det = fit([it["text"] for it in tr], [it["y"] for it in tr])
    filler = human_filler(det)
    out = {"filler": filler, "n_held": len(held), "n_machine": int(sum(y)), "modes": {}}
    for mode in ("delete", "swap"):
        rows = []
        for k in BUDGETS:
            h = [attack(det, it["text"], k, mode, filler) if it["y"] else it["text"] for it in held]
            a1 = float(roc_auc_score(y, score(det, h)))
            t2 = [attack(det, it["text"], k, mode, filler) if it["y"] else it["text"] for it in tr]
            ad = fit(t2, [it["y"] for it in tr])
            a2 = float(roc_auc_score(y, score(ad, h)))
            rows.append({"k": k, "auroc_fixed": a1, "auroc_adaptive": a2})
        out["modes"][mode] = rows
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = [f"held-out machine texts {out['n_machine']} of {out['n_held']}; swap filler word: {filler!r}",
         f"{'mode':8s} {'k':>3s} {'fixed detector':>15s} {'adaptive':>9s}"]
    for mode, rows in out["modes"].items():
        for r in rows:
            L.append(f"{mode:8s} {r['k']:3d} {r['auroc_fixed']:15.3f} {r['auroc_adaptive']:9.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
