"""Score the replayed `mimic-loop` imitator texts with prompt-free detectors and write results.json / results.txt.

Detectors are fit on the `mimic-contexts` suite (RAID text, human vs plain-prompt LLM), cut to the
same 400 characters as the loop's texts, with every item whose id is a loop test title removed.
  length          log character count (a confound control, not a detector)
  ngram           char 1-4 and word 1-2 gram TF-IDF logistic regression, fit on the 5 training families
  ngram-unseen    the same, refit without the target family (genuinely unseen family)
  logppl, bino    zero-shot Qwen scores through a 2-parameter logistic fit (as in mimic-contexts)
Score = higher means more machine-like.
"""
import gzip, json, os, random, sys
import numpy as np
from scipy.sparse import hstack
from scipy.stats import spearmanr
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
CTX = os.path.join(HERE, "..", "mimic-contexts")
CHARS = 400
TRAIN = ["abstracts", "books", "news", "recipes", "reddit"]
DETS = ["length", "ngram", "ngram-unseen", "logppl", "bino"]


def trunc(text, n=CHARS):
    text = " ".join(text.split())
    if len(text) <= n:
        return text
    cut = text[:n]
    return cut[: cut.rfind(" ")] if " " in cut else cut


def auroc(pos, neg):
    """P(score of a machine text > score of a human text), ties half."""
    y = [1] * len(pos) + [0] * len(neg)
    return float(roc_auc_score(y, list(pos) + list(neg)))


def matched_auroc(gs, hs, glen, hlen, ratio=1.5):
    """AUROC over only the (machine, human) pairs whose character lengths are within `ratio` of each other.
    Returns (auroc, number of pairs); (None, 0) when fewer than 20 pairs qualify."""
    win = pairs = 0.0
    for g, lg in zip(gs, glen):
        for h, lh in zip(hs, hlen):
            if max(lg, lh) <= ratio * min(lg, lh):
                pairs += 1
                win += (g > h) + 0.5 * (g == h)
    return (win / pairs, int(pairs)) if pairs >= 20 else (None, int(pairs))


def boot_auroc(pos, neg, reps=300, seed=0):
    rng = random.Random(seed)
    v = []
    for _ in range(reps):
        p = [pos[rng.randrange(len(pos))] for _ in pos]
        n = [neg[rng.randrange(len(neg))] for _ in neg]
        v.append(auroc(p, n))
    return float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))


def ngram_fit(texts, y):
    vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=3, sublinear_tf=True, max_features=200000)
    vw = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=200000)
    X = hstack([vc.fit_transform(texts), vw.fit_transform(texts)]).tocsr()
    clf = LogisticRegression(C=3.0, max_iter=2000).fit(X, y)
    return lambda t: clf.decision_function(hstack([vc.transform(t), vw.transform(t)]).tocsr())


def fit_detectors(rows, zs, family):
    """rows: suite items (test ids already removed). Returns {name: f(texts, zs_list) -> scores}."""
    y = [int(r["label"] == "llm") for r in rows]
    tx = [trunc(r["text"]) for r in rows]
    lr = LogisticRegression().fit([[np.log(len(t))] for t in tx], y)
    ng = ngram_fit(tx, y)
    keep = [i for i, r in enumerate(rows) if r["family"] != family]
    ngu = ngram_fit([tx[i] for i in keep], [y[i] for i in keep])
    z = [(r, zs.get(r["id"] + r["label"])) for r in rows]
    z = [(r, v) for r, v in z if v]
    zy = [int(r["label"] == "llm") for r, _ in z]
    lp = LogisticRegression().fit([[-v["logppl"]] for _, v in z], zy)
    bn = LogisticRegression().fit([[-v["logppl"] / v["xppl"]] for _, v in z], zy)
    return {
        "length": lambda t, v: lr.decision_function([[np.log(len(x))] for x in t]),
        "ngram": lambda t, v: ng(t),
        "ngram-unseen": lambda t, v: ngu(t),
        "logppl": lambda t, v: lp.decision_function([[-x["logppl"]] for x in v]),
        "bino": lambda t, v: bn.decision_function([[-x["logppl"] / x["xppl"]] for x in v]),
    }


def main():
    data = json.load(open(os.path.join(HERE, "texts.json")))
    suite = [json.loads(l) for l in gzip.open(os.path.join(CTX, "data", "suite.jsonl.gz"), "rt", encoding="utf8")]
    zs = json.load(open(os.path.join(CTX, "data", "zeroshot.json")))
    test_ids = {h["id"] for hs in data["human"].values() for h in hs}
    rows = [r for r in suite if r["family"] in TRAIN and r["id"] not in test_ids]
    out = {"n_train": len(rows), "n_removed_ids": len(test_ids), "rows": []}
    scorers = {fam: fit_detectors(rows, zs, fam) for fam in data["human"]}
    for run in data["runs"]:
        fam = run["family"]
        hum = data["human"][fam]
        gen = [t for t in run["texts"] if "logppl" in t]
        res = {k: run[k] for k in ("family", "proposer", "round", "loop_paired_acc", "loop_paired_acc_plain", "loop_valid", "loop_len")}
        res["mean_len"] = float(np.mean([len(t["text"]) for t in run["texts"]]))
        for d in DETS:
            f = scorers[fam][d]
            hs = list(f([h["text"] for h in hum], hum))
            gs = list(f([t["text"] for t in gen], gen))
            lo, hi = boot_auroc(gs, hs)
            m, npairs = matched_auroc(gs, hs, [len(t["text"]) for t in gen], [len(h["text"]) for h in hum])
            res[d] = {"auroc": auroc(gs, hs), "ci": [lo, hi], "matched_auroc": m, "matched_pairs": npairs, "detect_rate": float(np.mean([s > 0 for s in gs])),
                      "human_flag_rate": float(np.mean([s > 0 for s in hs]))}
        out["rows"].append(res)
    rows_ = out["rows"]
    out["spearman"] = {}
    for d in DETS:
        for scope, sel in (("all", rows_), ("valid", [r for r in rows_ if r["loop_valid"]])):
            xs = [r["loop_paired_acc"] for r in sel]
            ys = [r[d]["auroc"] for r in sel]
            if len(sel) > 3 and len(set(xs)) > 1:
                rho, p = spearmanr(xs, ys)
                out["spearman"][f"{d}/{scope}"] = {"rho": float(rho), "p": float(p), "n": len(sel)}
    for d in DETS:
        sel = [r for r in rows_ if r[d]["matched_auroc"] is not None]
        xs = [r["loop_paired_acc"] for r in sel]
        if len(sel) > 3 and len(set(xs)) > 1:
            rho, p = spearmanr(xs, [r[d]["matched_auroc"] for r in sel])
            out["spearman"][f"{d}/length-matched"] = {"rho": float(rho), "p": float(p), "n": len(sel)}
        rho, p = spearmanr([r["mean_len"] for r in rows_], [r[d]["auroc"] for r in rows_])
        out["spearman"][f"{d}/vs-mean-length"] = {"rho": float(rho), "p": float(p), "n": len(rows_)}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = ["mimic-looptransfer: prompt-free detector AUROC (human test text vs replayed imitator text; 0.5 = cannot tell)", "",
             f"{'family':8s} {'proposer':7s} rd  loop-acc  valid  len   " + "  ".join(f"{d:>12s}" for d in DETS)]
    for r in rows_:
        lines.append(f"{r['family']:8s} {r['proposer']:7s} {r['round']:2d}  {r['loop_paired_acc']:8.2f}  {str(r['loop_valid'])[0]:>5s} {r['mean_len']:5.0f}  "
                     + "  ".join(f"{r[d]['auroc']:12.2f}" for d in DETS))
    lines += ["", "Length-matched AUROC (pairs within 1.5x in characters; blank when under 20 pairs):",
              f"{'family':8s} {'proposer':7s} rd  " + "  ".join(f"{d:>12s}" for d in DETS[1:])]
    for r in rows_:
        lines.append(f"{r['family']:8s} {r['proposer']:7s} {r['round']:2d}  " + "  ".join(
            (f"{r[d]['matched_auroc']:7.2f}({r[d]['matched_pairs']:3d})" if r[d]["matched_auroc"] is not None else f"{'':12s}") for d in DETS[1:]))
    lines += ["", "Spearman rho between the loop's paired detector accuracy (lower = imitator better) and each prompt-free AUROC:"]
    for k, v in out["spearman"].items():
        lines.append(f"  {k:22s} rho={v['rho']:+.2f} p={v['p']:.3f} n={v['n']}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
