"""mimic-mauve: does MAUVE, a distribution-level score, agree with an instance-level detector on RAID plain-prompt text?

For each family and each RAID chat model with at least N_MIN texts in it, draw N human and N model texts
(N = the model's count capped at N_CAP), embed them with TF-IDF + truncated SVD (fit on the pooled draw,
no labels), and compute MAUVE(human, model). Also: a human-vs-human null (two disjoint human draws of size N),
the cross-fitted n-gram logistic-regression AUROC on the same draw, and distinct-2 of each side.
No network, no language model: the embedding is NOT the GPT-2 feature MAUVE's paper uses, so the numbers are
not comparable with published MAUVE values. Writes results.json and results.txt.
"""
import gzip, json, os, sys
import numpy as np
from scipy.stats import spearmanr
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "..", "mimic-contexts", "data", "suite.jsonl.gz")
GENS = ["llama-chat", "mistral-chat", "mpt-chat"]
N_MIN, N_CAP, DRAWS, DIM = 40, 100, 5, 32


def load(path=SUITE):
    return [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]


def embed(texts, dim=DIM, seed=0):
    X = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=2, sublinear_tf=True).fit_transform(texts)
    k = min(dim, X.shape[1] - 1, X.shape[0] - 1)
    Z = TruncatedSVD(k, random_state=seed).fit_transform(X)
    return Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-12)


def mauve_score(p, q, seed=0):
    import mauve
    out = mauve.compute_mauve(p_features=p, q_features=q, num_buckets="auto", seed=seed, verbose=False, device_id=-1)
    return float(out.mauve)


def crossfit_auroc(texts, y, seed=0):
    y = np.asarray(y)
    s = np.zeros(len(y))
    for tr, te in StratifiedKFold(2, shuffle=True, random_state=seed).split(texts, y):
        v = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=2, sublinear_tf=True)
        clf = LogisticRegression(C=3.0, max_iter=2000).fit(v.fit_transform([texts[i] for i in tr]), y[tr])
        s[te] = clf.decision_function(v.transform([texts[i] for i in te]))
    return float(roc_auc_score(y, s))


def distinct2(texts):
    seen, tot = set(), 0
    for t in texts:
        w = t.split()
        g = list(zip(w, w[1:]))
        seen.update(g)
        tot += len(g)
    return len(seen) / tot if tot else 0.0


def cell(human, gen, rng, n):
    """Mean over DRAWS of MAUVE, null MAUVE, AUROC and distinct-2, all at sample size n per side."""
    rows = []
    for d in range(DRAWS):
        h = [human[i] for i in rng.permutation(len(human))]
        g = [gen[i] for i in rng.permutation(len(gen))[:n]]
        h1, h2 = h[:n], h[n:2 * n]
        Z = embed(h1 + g, seed=d)
        Zn = embed(h1 + h2, seed=d)
        rows.append(dict(
            mauve=mauve_score(Z[:n], Z[n:], seed=d),
            null=mauve_score(Zn[:n], Zn[n:], seed=d),
            auroc=crossfit_auroc(h1 + g, [0] * n + [1] * n, seed=d),
            d2_human=distinct2(h1), d2_gen=distinct2(g)))
    return {k: float(np.mean([r[k] for r in rows])) for k in rows[0]} | {
        "mauve_sd": float(np.std([r["mauve"] for r in rows])), "n": n}


def main():
    items = load()
    rng = np.random.RandomState(0)
    res = {}
    for fam in sorted({it["family"] for it in items}):
        human = [it["text"] for it in items if it["family"] == fam and it["label"] == "human"]
        for g in GENS:
            gen = [it["text"] for it in items if it["family"] == fam and it["model"] == g]
            if len(gen) < N_MIN:
                continue
            n = min(len(gen), N_CAP, len(human) // 2)
            res[f"{fam}/{g}"] = cell(human, gen, rng, n)
            print(fam, g, res[f"{fam}/{g}"], flush=True)
    keys = list(res)
    rho_a = spearmanr([res[k]["mauve"] for k in keys], [res[k]["auroc"] for k in keys])
    rho_d = spearmanr([res[k]["mauve"] for k in keys], [res[k]["d2_gen"] / res[k]["d2_human"] for k in keys])
    summary = dict(cells=len(keys), spearman_mauve_vs_auroc=[float(rho_a[0]), float(rho_a[1])],
                   spearman_mauve_vs_d2ratio=[float(rho_d[0]), float(rho_d[1])],
                   null_mauve_mean=float(np.mean([res[k]["null"] for k in keys])),
                   null_mauve_min=float(min(res[k]["null"] for k in keys)),
                   mauve_max=float(max(res[k]["mauve"] for k in keys)))
    json.dump({"cells": res, "summary": summary, "params": dict(N_MIN=N_MIN, N_CAP=N_CAP, DRAWS=DRAWS, DIM=DIM)},
              open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = ["family/model            n   MAUVE(sd)       null    AUROC   distinct2 human->model"]
    for k in keys:
        r = res[k]
        lines.append(f"{k:24s}{r['n']:3d}  {r['mauve']:.3f} ({r['mauve_sd']:.3f})  {r['null']:.3f}  {r['auroc']:.3f}   {r['d2_human']:.3f} -> {r['d2_gen']:.3f}")
    lines += ["", json.dumps(summary, indent=1)]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines[-12:]))


if __name__ == "__main__":
    main()
