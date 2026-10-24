"""Which kind of feature lets a human-vs-machine text detector carry over to a context family it never saw?

Leave-one-family-out on the mimic-contexts suite. Every vectoriser is fitted on the training families only
(the earlier mimic-anycontext-detect fitted it on all text). Feature sets:
  char     TF-IDF character 1-4 grams (char_wb)
  word     TF-IDF word 1-2 grams
  func     counts of scikit-learn's English stop words, as relative frequencies (no content words)
  format   hand-made surface statistics: length, line breaks, punctuation rates, capital and digit rates
  length   log character length alone
Scored by AUROC on the held-out family, with a 95% bootstrap interval over its test items.
"""
import gzip, json, os, re, sys
import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "..", "mimic-contexts", "data", "suite.jsonl.gz")
FAMILIES = ["abstracts", "books", "news", "recipes", "reddit", "poetry", "reviews", "wiki"]
SETS = ["char", "word", "func", "format", "length", "char+word"]
BOOT = 500


def load(path=SUITE):
    its = [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]
    for it in its: it["y"] = int(it["label"] == "llm")
    return its


def format_stats(t):
    n = max(len(t), 1); w = max(len(t.split()), 1)
    f = [np.log1p(len(t)), np.log1p(w), t.count("\n") / n * 100, len(re.findall(r"[.!?]", t)) / w,
         t.count(",") / w, t.count("'") / w, t.count('"') / w, t.count("-") / w, t.count(":") / w,
         t.count("(") / w, sum(c.isupper() for c in t) / n, sum(c.isdigit() for c in t) / n,
         len(re.findall(r"[^\x00-\x7f]", t)) / n, sum(len(x) for x in t.split()) / w]
    return f


def featurize(name, train, test):
    """Return (Xtr, Xte); every fitted transformer sees only `train`."""
    tr = [i["text"] for i in train]; te = [i["text"] for i in test]
    if name in ("char", "word", "char+word"):
        vs = []
        if name != "word": vs.append(TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=3, sublinear_tf=True, max_features=100000))
        if name != "char": vs.append(TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=100000))
        return hstack([v.fit_transform(tr) for v in vs]).tocsr(), hstack([v.transform(te) for v in vs]).tocsr()
    if name == "func":
        v = CountVectorizer(vocabulary=sorted(ENGLISH_STOP_WORDS), lowercase=True)
        f = lambda x: (lambda m: m.multiply(1.0 / np.maximum(m.sum(1), 1)).tocsr())(v.transform(x))
        sc = StandardScaler(with_mean=False).fit(f(tr))
        return sc.transform(f(tr)), sc.transform(f(te))
    if name == "format":
        a = np.array([format_stats(t) for t in tr]); b = np.array([format_stats(t) for t in te])
        sc = StandardScaler().fit(a)
        return csr_matrix(sc.transform(a)), csr_matrix(sc.transform(b))
    if name == "length":
        a = np.array([[np.log1p(len(t))] for t in tr]); b = np.array([[np.log1p(len(t))] for t in te])
        sc = StandardScaler().fit(a)
        return csr_matrix(sc.transform(a)), csr_matrix(sc.transform(b))
    raise ValueError(name)


def auc(y, s): return float(roc_auc_score(y, s)) if len(set(y)) == 2 else float("nan")


def boot_ci(y, s, n=BOOT, seed=0):
    y = np.asarray(y); s = np.asarray(s); rng = np.random.RandomState(seed); out = []
    for _ in range(n):
        i = rng.randint(0, len(y), len(y))
        if len(set(y[i])) == 2: out.append(roc_auc_score(y[i], s[i]))
    return [float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))]


def score(name, train, test, C=3.0):
    Xtr, Xte = featurize(name, train, test)
    clf = LogisticRegression(C=C if name in ("char", "word", "char+word") else 1.0, max_iter=3000).fit(Xtr, [i["y"] for i in train])
    return clf.decision_function(Xte)


def run(items, sets=SETS):
    out = {}
    for f in FAMILIES:
        train = [i for i in items if i["family"] != f]; test = [i for i in items if i["family"] == f]
        y = [i["y"] for i in test]; out[f] = {}
        for name in sets:
            s = score(name, train, test)
            out[f][name] = {"auc": auc(y, s), "ci": boot_ci(y, s)}
        # in-family reference: 2-fold cross-fit with the same feature set (char+word)
        a, b = test[::2], test[1::2]
        out[f]["in_family_char+word"] = float(np.mean([auc([i["y"] for i in b], score("char+word", a, b)),
                                                          auc([i["y"] for i in a], score("char+word", b, a))]))
    out["mean"] = {n: float(np.mean([out[f][n]["auc"] for f in FAMILIES])) for n in sets}
    out["mean"]["in_family_char+word"] = float(np.mean([out[f]["in_family_char+word"] for f in FAMILIES]))
    return out


def table(res, sets=SETS):
    L = ["| family | " + " | ".join(sets) + " | in-family char+word |", "|" + "---|" * (len(sets) + 2)]
    for f in FAMILIES:
        L.append(f"| {f} | " + " | ".join(f"{res[f][n]['auc']:.3f} [{res[f][n]['ci'][0]:.2f}, {res[f][n]['ci'][1]:.2f}]" for n in sets) + f" | {res[f]['in_family_char+word']:.3f} |")
    L.append("| **mean** | " + " | ".join(f"**{res['mean'][n]:.3f}**" for n in sets) + f" | **{res['mean']['in_family_char+word']:.3f}** |")
    return "\n".join(L)


if __name__ == "__main__":
    items = load(); res = run(items)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results.txt"), "w").write(table(res) + "\n")
    print(table(res))
