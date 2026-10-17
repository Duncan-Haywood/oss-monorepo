"""mimic-genshift: does the prompt-free n-gram detector carry over to a generator or decoding it never saw?

Uses the stored mimic-contexts suite (RAID plain-prompt text: three chat models, greedy and sampling).
Items are split into two halves A/B by a hash of source_id (an LLM item shares its side with the human
item it imitates, when the ids match). Protocols, each scored on half B with the detector fit on half A:
  in-distribution: fit on human + all LLM generators (or decodings) of A, score generator g on B
  leave-out:       fit on human + the OTHER generators of A, score generator g on B
and the same split with halves swapped. Also: per-family distinct-n diversity, and a batch detector
(mean score over k same-source texts) under leave-out.
Writes results.json and results.txt. No network, no model.
"""
import gzip, hashlib, json, os, random, sys
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "..", "mimic-contexts", "data", "suite.jsonl.gz")
GENS = ["llama-chat", "mistral-chat", "mpt-chat"]
DECODINGS = ["greedy", "sampling"]


def load(path=SUITE):
    items = [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]
    for it in items:
        it["y"] = int(it["label"] == "llm")
    return items


def side(it):
    """0 or 1, stable under the item's source_id."""
    return int(hashlib.md5(str(it["source_id"]).encode()).hexdigest(), 16) % 2


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


def auc(items, scores):
    y = [it["y"] for it in items]
    return float(roc_auc_score(y, scores)), boot(y, scores)


def split_eval(items, key, values, fit_side):
    """For each value v of `key` (model or decoding): in-distribution and leave-out AUROC on the other half.
    Returns {v: {"in": (auroc, ci, scores_items), "out": ...}} pooled over the test half."""
    tr = [it for it in items if side(it) == fit_side]
    te = [it for it in items if side(it) != fit_side]
    res = {}
    f_in = fit([it["text"] for it in tr], [it["y"] for it in tr])
    for v in values:
        trk = [it for it in tr if it["y"] == 0 or it[key] != v]
        f_out = fit([it["text"] for it in trk], [it["y"] for it in trk])
        tev = [it for it in te if it["y"] == 0 or it[key] == v]
        res[v] = {"items": tev, "in": f_in([it["text"] for it in tev]), "out": f_out([it["text"] for it in tev])}
    return res


def run_axis(items, key, values):
    out = {}
    parts = [split_eval(items, key, values, s) for s in (0, 1)]
    for v in values:
        its = parts[0][v]["items"] + parts[1][v]["items"]
        r = {}
        for mode in ("in", "out"):
            sc = np.concatenate([parts[0][v][mode], parts[1][v][mode]])
            a, ci = auc(its, sc)
            r[mode] = {"auroc": a, "ci95": ci}
            r[mode + "_by_family"] = {}
            for fam in sorted({it["family"] for it in its}):
                idx = [i for i, it in enumerate(its) if it["family"] == fam]
                yy = [its[i]["y"] for i in idx]
                # a model absent from a family leaves one class: report None, not NaN
                r[mode + "_by_family"][fam] = float(roc_auc_score(yy, [sc[i] for i in idx])) if len(set(yy)) == 2 else None
        r["n_llm"] = sum(it["y"] for it in its)
        r["n_human"] = len(its) - r["n_llm"]
        out[v] = r
    return out


def ngrams(text, n):
    w = text.lower().split()
    return list(zip(*[w[i:] for i in range(n)])) if len(w) >= n else []


def distinct(texts, n):
    """Distinct-n of a pooled batch: unique word n-grams over total word n-grams."""
    g = [x for t in texts for x in ngrams(t, n)]
    return len(set(g)) / len(g) if g else float("nan")


def diversity(items, size=100, reps=20, seed=0):
    """Mean distinct-n over random batches of `size` texts per family and source (human / each model).
    Batch size is fixed so the ratio is comparable across sources."""
    rng = random.Random(seed)
    out = {}
    fams = sorted({it["family"] for it in items})
    for fam in fams:
        out[fam] = {}
        for src in ["human"] + GENS:
            pool = [it["text"] for it in items if it["family"] == fam and it["model"] == src]
            if len(pool) < size:
                continue
            vals = {n: [] for n in (1, 2, 3)}
            for _ in range(reps):
                b = rng.sample(pool, size)
                for n in vals:
                    vals[n].append(distinct(b, n))
            out[fam][src] = {f"distinct{n}": float(np.mean(v)) for n, v in vals.items()} | {"n_texts": len(pool)}
    return out


def batch_auroc(scores_by_item, ks=(1, 2, 4, 8, 16), reps=2000, seed=0):
    """AUROC for batch-mean scores: a human batch and an LLM batch of k texts (same family, drawn at random)."""
    rng = random.Random(seed)
    out = {}
    fams = sorted({f for f, _, _ in scores_by_item})
    for k in ks:
        pos, neg = [], []
        for _ in range(reps):
            fam = rng.choice(fams)
            h = [s for f, y, s in scores_by_item if f == fam and y == 0]
            l = [s for f, y, s in scores_by_item if f == fam and y == 1]
            neg.append(np.mean(rng.sample(h, k)))
            pos.append(np.mean(rng.sample(l, k)))
        out[str(k)] = float(roc_auc_score([0] * reps + [1] * reps, neg + pos))
    return out


def main():
    items = load()
    out = {"generator": run_axis(items, "model", GENS), "decoding": run_axis(items, "decoding", DECODINGS)}
    out["diversity"] = diversity(items)
    # batch detector under leave-one-generator-out (pooled over held-out generators)
    pool = []
    for s in (0, 1):
        for v, r in split_eval(items, "model", GENS, s).items():
            pool += [(it["family"], it["y"], sc) for it, sc in zip(r["items"], r["out"])]
    out["batch_leaveout"] = batch_auroc(pool)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    L = ["mimic-genshift: AUROC of the n-gram detector on a generator / decoding it was not fit on", ""]
    for axis in ("generator", "decoding"):
        L.append(f"{axis:14s} {'in-distribution':>26s} {'left out of fit':>26s}")
        for v, r in out[axis].items():
            a, b = r["in"], r["out"]
            L.append(f"{v:14s} {a['auroc']:.3f} [{a['ci95'][0]:.3f},{a['ci95'][1]:.3f}]   {b['auroc']:.3f} [{b['ci95'][0]:.3f},{b['ci95'][1]:.3f}]")
        L.append("")
        L.append("by family (left out of fit):")
        for v, r in out[axis].items():
            L.append(f"  {v:14s} " + " ".join(f"{f}={x:.2f}" if x is not None else f"{f}=n/a" for f, x in r["out_by_family"].items()))
        L.append("")
    L.append("distinct-n of a 100-text batch (mean of 20 draws), human vs model:")
    for fam, d in out["diversity"].items():
        L.append(f"  {fam:10s} " + "  ".join(f"{s}: d1={x['distinct1']:.3f} d2={x['distinct2']:.3f} d3={x['distinct3']:.3f}" for s, x in d.items()))
    L += ["", "batch-mean score AUROC, detector left out of fit, k texts per batch: " +
          "  ".join(f"k={k}: {v:.3f}" for k, v in out["batch_leaveout"].items())]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
