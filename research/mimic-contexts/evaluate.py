"""Reference detectors for the mimic-contexts suite. Writes results.json and results.txt.

Detectors (none uses a prompt):
  length   logistic regression on log character count (a confound check, not a detector)
  ngram    logistic regression on TF-IDF character 1-4 grams + word 1-2 grams
  logppl   observer log-perplexity (zero-shot; threshold fit on the training families)
  bino     log-perplexity / cross-perplexity, Binoculars-style (zero-shot)
Train families fit every threshold and weight; HELD families are never seen until scoring.
"""
import gzip, json, random
import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

TRAIN = ["abstracts", "books", "news", "recipes", "reddit"]
HELD = ["poetry", "reviews", "wiki"]
FAMILIES = TRAIN + HELD
SEED = 0


def load():
    items = [json.loads(l) for l in gzip.open("data/suite.jsonl.gz", "rt", encoding="utf8")]
    try:
        zs = json.load(open("data/zeroshot.json"))
    except FileNotFoundError:
        zs = {}
    for it in items:
        z = zs.get(it["id"] + it["label"])
        it["logppl"] = z["logppl"] if z else None
        it["bino"] = z["logppl"] / z["xppl"] if z else None
        it["y"] = int(it["label"] == "llm")      # 1 = machine
    return items


def paired_acc(scores, y, fam, rng, n=4000):
    """Fraction of (human, llm) pairs from the same family where the llm text scores higher."""
    ok = tot = 0
    for f in sorted(set(fam)):
        h = [s for s, yy, ff in zip(scores, y, fam) if ff == f and yy == 0]
        m = [s for s, yy, ff in zip(scores, y, fam) if ff == f and yy == 1]
        for _ in range(n // len(set(fam))):
            a, b = rng.choice(h), rng.choice(m)
            ok += (b > a) + 0.5 * (b == a)
            tot += 1
    return ok / tot


def boot_auc(y, s, rng, B=300):
    y, s = np.array(y), np.array(s)
    v = []
    for _ in range(B):
        i = np.array([rng.randrange(len(y)) for _ in range(len(y))])
        if len(set(y[i])) == 2:
            v.append(roc_auc_score(y[i], s[i]))
    return float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))


def ngram_fit(texts, y):
    vc = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=3, sublinear_tf=True, max_features=200000)
    vw = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=200000)
    X = hstack([vc.fit_transform(texts), vw.fit_transform(texts)]).tocsr()
    clf = LogisticRegression(C=3.0, max_iter=2000).fit(X, y)
    return lambda t: clf.decision_function(hstack([vc.transform(t), vw.transform(t)]).tocsr())


def main():
    rng = random.Random(SEED)
    items = load()
    tr = [it for it in items if it["family"] in TRAIN]
    out = {"counts": {}, "detectors": {}}
    for f in FAMILIES:
        for lab in ("human", "llm"):
            out["counts"][f"{f}/{lab}"] = sum(1 for it in items if it["family"] == f and it["label"] == lab)
    ytr = [it["y"] for it in tr]
    scorers = {}
    lg = lambda it: np.log(len(it["text"]))
    lr = LogisticRegression().fit([[lg(it)] for it in tr], ytr)
    scorers["length"] = lambda its: lr.decision_function([[lg(it)] for it in its])
    ng = ngram_fit([it["text"] for it in tr], ytr)
    scorers["ngram"] = lambda its: ng([it["text"] for it in its])
    zs_ok = [it for it in tr if it["logppl"] is not None]
    if zs_ok:
        for k in ("logppl", "bino"):
            sign = -1.0   # machine text has LOWER perplexity: negate so that higher = more machine
            l1 = LogisticRegression().fit([[sign * it[k]] for it in zs_ok], [it["y"] for it in zs_ok])
            scorers[k] = (lambda k, l1: lambda its: l1.decision_function([[sign * it[k]] for it in its]))(k, l1)
    for n in (("length", "ngram") if zs_ok else ()):
        scorers[n + " [zs subset]"] = scorers[n]      # same fit, scored only on the zero-shot subset
    ok = lambda name, it: name in ("length", "ngram") or it["logppl"] is not None
    for name, sc in scorers.items():
        res = {}
        for grp, fams in (("train_families", TRAIN), ("held_out_families", HELD), ("all", FAMILIES)):
            sub = [it for it in items if it["family"] in fams and ok(name, it)]
            s = list(sc(sub)); y = [it["y"] for it in sub]; fam = [it["family"] for it in sub]
            thr_acc = float(np.mean([(si > 0) == bool(yi) for si, yi in zip(s, y)]))
            lo, hi = boot_auc(y, s, rng)
            res[grp] = {"auroc": float(roc_auc_score(y, s)), "auroc_ci95": [lo, hi], "accuracy": thr_acc,
                        "paired_accuracy": paired_acc(s, y, fam, rng)}
        res["by_family_auroc"] = {}
        for f in FAMILIES:
            sub = [it for it in items if it["family"] == f and ok(name, it)]
            res["by_family_auroc"][f] = float(roc_auc_score([it["y"] for it in sub], sc(sub)))
        res["held_out_auroc_by_llm"] = {}
        for m in sorted({it["model"] for it in items if it["label"] == "llm"}):
            sub = [it for it in items if it["family"] in HELD and (it["label"] == "human" or it["model"] == m) and ok(name, it)]
            n = sum(it["label"] == "llm" for it in sub)
            if n >= 30:
                res["held_out_auroc_by_llm"][m] = {"n": n, "auroc": float(roc_auc_score([it["y"] for it in sub], sc(sub)))}
        out["detectors"][name] = res
    # leave-one-family-out for the n-gram detector
    loo = {}
    for f in FAMILIES:
        trn = [it for it in items if it["family"] != f]; tst = [it for it in items if it["family"] == f]
        g = ngram_fit([it["text"] for it in trn], [it["y"] for it in trn])
        loo[f] = float(roc_auc_score([it["y"] for it in tst], g([it["text"] for it in tst])))
    out["ngram_leave_one_family_out_auroc"] = loo
    json.dump(out, open("results.json", "w"), indent=1)
    lines = ["mimic-contexts reference detectors (AUROC; 1.0 = perfect, 0.5 = chance)", "",
             f"{'detector':18s} {'train fams':>22s} {'held-out fams':>22s} {'held acc':>9s} {'held paired':>12s}"]
    for n, r in out["detectors"].items():
        t, h = r["train_families"], r["held_out_families"]
        lines.append(f"{n:18s} {t['auroc']:.3f} [{t['auroc_ci95'][0]:.3f},{t['auroc_ci95'][1]:.3f}]  {h['auroc']:.3f} [{h['auroc_ci95'][0]:.3f},{h['auroc_ci95'][1]:.3f}]  {h['accuracy']:9.3f} {h['paired_accuracy']:12.3f}")
    lines += ["", "by family AUROC:"]
    for n, r in out["detectors"].items():
        lines.append(f"  {n:18s} " + "  ".join(f"{f}={v:.2f}" for f, v in r["by_family_auroc"].items()))
    lines += ["", "ngram leave-one-family-out AUROC: " + "  ".join(f"{f}={v:.2f}" for f, v in loo.items()), "",
              "held-out AUROC by plain-prompt LLM (human vs that LLM):"]
    for n, r in out["detectors"].items():
        lines.append(f"  {n:18s} " + "  ".join(f"{m}={v['auroc']:.2f}(n={v['n']})" for m, v in r["held_out_auroc_by_llm"].items()))
    open("results.txt", "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
