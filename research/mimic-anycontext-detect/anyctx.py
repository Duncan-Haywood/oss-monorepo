"""Detector-side 'any context' test on the mimic-contexts suite (no LLM, CPU, about a minute).

Question: does an n-gram human-vs-machine detector fitted on some context families hold up on others?
Three regimes, all scored by AUROC on the target family's held-out items:
  universal   fit on all OTHER families (target never seen)
  per-family  fit on half of the target family's own items (in-family, 2-fold cross-fit)
  adapted     universal training set plus k labelled target items (k = 0, 10, 40, 160), scored on the other half
Also: held-out GENERATOR (fit on llama-chat machine text only, score human vs mistral/mpt text) and a
length-matched control (score only items inside the length band shared by human and machine text).
"""
import gzip, json, os, sys
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "..", "mimic-contexts", "data", "suite.jsonl.gz")
FAMILIES = ["abstracts", "books", "news", "recipes", "reddit", "poetry", "reviews", "wiki"]
KS = (0, 10, 40, 160)
SEEDS = 5


def load(path=SUITE):
    its = [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]
    for it in its: it["y"] = int(it["label"] == "llm")
    return its


_CACHE = {}


def prepare(items):
    vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=3, sublinear_tf=True, max_features=100000)
    vw = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=100000)
    t = [i["text"] for i in items]
    X = hstack([vc.fit_transform(t), vw.fit_transform(t)]).tocsr()
    _CACHE.clear(); _CACHE.update({i["id"] + i["label"] + i["model"]: r for r, i in enumerate(items)}); _CACHE["X"] = X
    return X


def rows(its): return [_CACHE[i["id"] + i["label"] + i["model"]] for i in its]


def fit(its, y, w=None):
    """Fit on items; returns a scorer taking items. Features come from the cached matrix."""
    X = _CACHE["X"]
    clf = LogisticRegression(C=3.0, max_iter=2000).fit(X[rows(its)], y, sample_weight=w)
    return lambda t: clf.decision_function(X[rows(t)])


def auc(y, s):
    return float(roc_auc_score(y, s)) if len(set(y)) == 2 else float("nan")


def split_half(items, seed):
    rng = np.random.RandomState(seed)
    idx = rng.permutation(len(items)); h = len(items) // 2
    return [items[i] for i in idx[:h]], [items[i] for i in idx[h:]]


def txt(its): return [i["text"] for i in its]
def ys(its): return [i["y"] for i in its]


def regimes(items, seeds=SEEDS):
    out = {}
    for f in FAMILIES:
        tgt = [i for i in items if i["family"] == f]; oth = [i for i in items if i["family"] != f]
        r = {"universal": [], "per_family": [], **{f"adapted_k{k}": [] for k in KS}}
        for s in range(seeds):
            a, b = split_half(tgt, s)
            r["per_family"] += [auc(ys(b), fit(a, ys(a))(b)), auc(ys(a), fit(b, ys(b))(a))]
            for k in KS:
                rng = np.random.RandomState(100 + s)
                sup = [a[i] for i in rng.permutation(len(a))[:k]]
                tr = oth + sup
                # target items weighted up so k=10 is not drowned by ~2000 other-family items
                w = [1.0] * len(oth) + [5.0] * len(sup)
                r[f"adapted_k{k}"].append(auc(ys(b), fit(tr, ys(tr), w)(b)))
        r["universal"] = r["adapted_k0"]
        out[f] = {k: [float(np.mean(v)), float(np.std(v))] for k, v in r.items()}
    return out


def generator_holdout(items):
    out = {}
    for f in FAMILIES:
        fam = [i for i in items if i["family"] == f]
        hum = [i for i in fam if i["y"] == 0]
        for m in ("llama-chat", "mistral-chat", "mpt-chat"):
            test_m = [i for i in fam if i["model"] == m]
            if len(test_m) < 30: continue
            # train on all families' human text of a disjoint half plus machine text from the OTHER generators only
            h_a, h_b = split_half(hum, 0)
            tr = [i for i in items if i["family"] != f and (i["y"] == 0 or i["model"] != m)] + \
                 [i for i in fam if i["y"] == 1 and i["model"] != m] + h_a
            te = h_b + test_m
            out[f"{f}/{m}"] = {"n_machine": len(test_m), "auroc": auc(ys(te), fit(tr, ys(tr))(te))}
    return out


def length_matched(items):
    """AUROC of the universal detector inside the 10th-90th percentile length band common to both classes."""
    out = {}
    for f in FAMILIES:
        tgt = [i for i in items if i["family"] == f]; oth = [i for i in items if i["family"] != f]
        sc = fit(oth, ys(oth))(tgt)
        L = np.array([len(i["text"]) for i in tgt]); y = np.array(ys(tgt)); sc = np.array(sc)
        lo = max(np.percentile(L[y == 0], 10), np.percentile(L[y == 1], 10)); hi = min(np.percentile(L[y == 0], 90), np.percentile(L[y == 1], 90))
        m = (L >= lo) & (L <= hi)
        out[f] = {"all": auc(y, sc), "band": [float(lo), float(hi)], "n_in_band": int(m.sum()), "matched": auc(y[m], sc[m]),
                  "length_alone": auc(y, L)}
    return out


def main():
    items = load(); prepare(items)
    res = {"regimes": regimes(items), "generator_holdout": generator_holdout(items), "length_matched": length_matched(items)}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = ["mimic-anycontext-detect: n-gram detector AUROC (mean over %d seeds x folds; +-sd)" % SEEDS, "",
         f"{'family':10s} {'universal':>10s} {'per-family':>11s} " + " ".join(f"{'k='+str(k):>9s}" for k in KS[1:])]
    for f, r in res["regimes"].items():
        L.append(f"{f:10s} {r['universal'][0]:10.3f} {r['per_family'][0]:11.3f} " + " ".join(f"{r[f'adapted_k{k}'][0]:9.3f}" for k in KS[1:]))
    u = np.mean([r["universal"][0] for r in res["regimes"].values()]); p = np.mean([r["per_family"][0] for r in res["regimes"].values()])
    L += ["", f"mean universal {u:.3f}  mean per-family {p:.3f}  gap (per-family minus universal) {p-u:+.3f}", "", "held-out generator AUROC (human vs unseen generator, detector never saw it):"]
    for k, v in res["generator_holdout"].items(): L.append(f"  {k:24s} n={v['n_machine']:4d}  {v['auroc']:.3f}")
    L += ["", "length-matched control (universal detector; length_alone = AUROC of raw length):"]
    for f, v in res["length_matched"].items():
        L.append(f"  {f:10s} all={v['all']:.3f} matched={v['matched']:.3f} (n={v['n_in_band']}) length_alone={v['length_alone']:.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))


if __name__ == "__main__":
    main()
