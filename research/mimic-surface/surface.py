"""mimic-surface: what does the prompt-free n-gram detector key on?

Re-fits the mimic-contexts n-gram detector on views of the stored suite (prefix of N characters,
lowercased, punctuation removed, whitespace flattened, words shuffled) and scores held-out families.
Two protocols: "matched" (fit and score on the same view) and "clean-fit" (fit on raw text, score on the view).
Writes results.json and results.txt. No network, no model, about 2 minutes.
"""
import gzip, json, os, random, re, sys
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "..", "mimic-contexts", "data", "suite.jsonl.gz")
TRAIN = ["abstracts", "books", "news", "recipes", "reddit"]
HELD = ["poetry", "reviews", "wiki"]
PREFIXES = [50, 100, 200, 400, 800, 1500]


def load(path=SUITE):
    items = [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]
    for it in items:
        it["y"] = int(it["label"] == "llm")
    return items


def v_prefix(n):
    return lambda t: t[:n]


def v_lower(t):
    return t.lower()


def v_nopunct(t):
    return re.sub(r"[^\w\s]", "", t)


def v_flat(t):
    return " ".join(t.split())


def v_shuffle(t, seed=0):
    w = t.split()
    random.Random(hash_seed(t, seed)).shuffle(w)
    return " ".join(w)


def hash_seed(t, seed):
    return (sum(map(ord, t[:40])) * 1000003 + seed + len(t)) % (2 ** 31)


def v_both(t):
    return v_flat(v_nopunct(v_lower(t)))


VIEWS = {"raw": lambda t: t, "lowercase": v_lower, "no punctuation": v_nopunct,
         "whitespace flattened": v_flat, "lower+nopunct+flat": v_both, "shuffled words": v_shuffle}


def fit(texts, y):
    vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=3, sublinear_tf=True, max_features=200000)
    vw = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=200000)
    X = hstack([vc.fit_transform(texts), vw.fit_transform(texts)]).tocsr()
    clf = LogisticRegression(C=3.0, max_iter=2000).fit(X, y)
    return lambda t: clf.decision_function(hstack([vc.transform(t), vw.transform(t)]).tocsr())


def boot(y, s, B=200, seed=0):
    rng = np.random.RandomState(seed)
    y, s = np.asarray(y), np.asarray(s)
    v = []
    for _ in range(B):
        i = rng.randint(0, len(y), len(y))
        if len(set(y[i])) == 2:
            v.append(roc_auc_score(y[i], s[i]))
    return [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]


def evaluate(items, view_fit, view_test):
    """AUROC on HELD families; weights fit on TRAIN families under view_fit, scored under view_test."""
    tr = [it for it in items if it["family"] in TRAIN]
    te = [it for it in items if it["family"] in HELD]
    f = fit([view_fit(it["text"]) for it in tr], [it["y"] for it in tr])
    s = f([view_test(it["text"]) for it in te])
    y = [it["y"] for it in te]
    by = {}
    for fam in HELD:
        idx = [i for i, it in enumerate(te) if it["family"] == fam]
        by[fam] = float(roc_auc_score([y[i] for i in idx], [s[i] for i in idx]))
    return {"auroc": float(roc_auc_score(y, s)), "ci95": boot(y, s), "by_family": by}


def main():
    items = load()
    out = {"prefix": {}, "views": {}}
    for n in PREFIXES:
        out["prefix"][str(n)] = {"matched": evaluate(items, v_prefix(n), v_prefix(n)),
                                 "clean_fit": evaluate(items, lambda t: t, v_prefix(n))}
    for name, v in VIEWS.items():
        out["views"][name] = {"matched": evaluate(items, v, v), "clean_fit": evaluate(items, lambda t: t, v)}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = ["mimic-surface: held-out-family AUROC of the n-gram detector (poetry, reviews, wiki)", "",
         f"{'prefix chars':14s} {'matched fit':>26s} {'fit on raw full text':>26s}"]
    for n, r in out["prefix"].items():
        m, c = r["matched"], r["clean_fit"]
        L.append(f"{n:14s} {m['auroc']:.3f} [{m['ci95'][0]:.3f},{m['ci95'][1]:.3f}]   {c['auroc']:.3f} [{c['ci95'][0]:.3f},{c['ci95'][1]:.3f}]")
    L += ["", f"{'view':22s} {'matched fit':>26s} {'fit on raw full text':>26s}"]
    for n, r in out["views"].items():
        m, c = r["matched"], r["clean_fit"]
        L.append(f"{n:22s} {m['auroc']:.3f} [{m['ci95'][0]:.3f},{m['ci95'][1]:.3f}]   {c['auroc']:.3f} [{c['ci95'][0]:.3f},{c['ci95'][1]:.3f}]")
    L += ["", "by held-out family (matched):"]
    for n, r in out["views"].items():
        L.append(f"  {n:22s} " + "  ".join(f"{f}={v:.2f}" for f, v in r["matched"]["by_family"].items()))
    for n, r in out["prefix"].items():
        L.append(f"  prefix {n:15s} " + "  ".join(f"{f}={v:.2f}" for f, v in r["matched"]["by_family"].items()))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
