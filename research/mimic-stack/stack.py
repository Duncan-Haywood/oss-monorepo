"""Do the n-gram and zero-shot (Binoculars-style) detectors of mimic-contexts complement each other?

Writes results.json and results.txt. Uses the stored suite and zero-shot scores of
../mimic-contexts; no model is run. The stacker is fit on the training families only, on
out-of-family n-gram scores (leave-one-family-out), so it never sees an in-sample 1.000.
"""
import gzip, json, os, random
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
CTX = os.path.join(HERE, "..", "mimic-contexts")
os.sys.path.insert(0, CTX)
import evaluate as ev  # noqa: E402  (reuses TRAIN, HELD, ngram_fit)

TRAIN, HELD = ev.TRAIN, ev.HELD


def load():
    items = [json.loads(l) for l in gzip.open(os.path.join(CTX, "data", "suite.jsonl.gz"), "rt", encoding="utf8")]
    zs = json.load(open(os.path.join(CTX, "data", "zeroshot.json")))
    for it in items:
        z = zs.get(it["id"] + it["label"])
        it["zs"] = z
        it["y"] = int(it["label"] == "llm")
    return items


def feats(items, ng):
    """Columns: n-gram score, then two zero-shot scores signed so that higher = more machine-like
    (machine text has lower perplexity): -observer log-perplexity and -(perplexity / cross-perplexity)."""
    return np.array([[n, -it["zs"]["logppl"], -it["zs"]["logppl"] / it["zs"]["xppl"]] for n, it in zip(ng, items)])


def zscore_fit(X):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    return lambda A: (A - mu) / sd


def auc_ci(y, s, rng, B=300):
    y, s = np.asarray(y), np.asarray(s)
    v = []
    for _ in range(B):
        i = np.array([rng.randrange(len(y)) for _ in range(len(y))])
        if len(set(y[i])) == 2:
            v.append(roc_auc_score(y[i], s[i]))
    return float(roc_auc_score(y, s)), [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]


def paired_diff_ci(y, a, b, rng, B=500):
    """Paired bootstrap of AUROC(a) - AUROC(b) over the same resampled rows."""
    y, a, b = np.asarray(y), np.asarray(a), np.asarray(b)
    v = []
    for _ in range(B):
        i = np.array([rng.randrange(len(y)) for _ in range(len(y))])
        if len(set(y[i])) == 2:
            v.append(roc_auc_score(y[i], a[i]) - roc_auc_score(y[i], b[i]))
    return float(roc_auc_score(y, a) - roc_auc_score(y, b)), [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]


def run():
    rng = random.Random(0)
    items = load()
    full_train = [it for it in items if it["family"] in TRAIN]
    zs_train = [it for it in full_train if it["zs"]]
    zs_held = [it for it in items if it["family"] in HELD and it["zs"]]
    # out-of-family n-gram scores for the stacker's training rows
    oof = {}
    for f in TRAIN:
        fit = ev.ngram_fit([it["text"] for it in full_train if it["family"] != f],
                           [it["y"] for it in full_train if it["family"] != f])
        rows = [it for it in zs_train if it["family"] == f]
        for it, s in zip(rows, fit([it["text"] for it in rows])):
            oof[it["id"] + it["label"]] = s
    ng_tr = np.array([oof[it["id"] + it["label"]] for it in zs_train])
    fit_all = ev.ngram_fit([it["text"] for it in full_train], [it["y"] for it in full_train])
    ng_he = fit_all([it["text"] for it in zs_held])
    Xtr, Xhe = feats(zs_train, ng_tr), feats(zs_held, ng_he)
    ytr = np.array([it["y"] for it in zs_train])
    yhe = np.array([it["y"] for it in zs_held])
    norm = zscore_fit(Xtr)
    Ztr, Zhe = norm(Xtr), norm(Xhe)
    lr = LogisticRegression(C=1.0).fit(Ztr, ytr)
    lr2 = LogisticRegression(C=1.0).fit(Ztr[:, [0, 2]], ytr)
    scores = {
        "ngram": Xhe[:, 0], "-logppl": Xhe[:, 1], "-bino": Xhe[:, 2],
        "mean of z (ngram, bino)": Zhe[:, 0] + Zhe[:, 2],
        "stack LR (ngram, bino)": lr2.decision_function(Zhe[:, [0, 2]]),
        "stack LR (ngram, logppl, bino)": lr.decision_function(Zhe),
    }
    fam = np.array([it["family"] for it in zs_held])
    mod = np.array([it["model"] for it in zs_held])
    out = {"n_train": len(ytr), "n_held": len(yhe), "weights_ngram_logppl_bino": lr.coef_[0].tolist(),
           "weights_ngram_bino": lr2.coef_[0].tolist(),
           "corr_ngram_bino_within_class": {
               lab: float(np.corrcoef(Xhe[yhe == v, 0], Xhe[yhe == v, 2])[0, 1]) for lab, v in (("human", 0), ("llm", 1))},
           "detectors": {}}
    for name, s in scores.items():
        a, ci = auc_ci(yhe, s, rng)
        d = {"auroc": a, "ci95": ci, "by_family": {}, "by_generator": {}}
        for f in HELD:
            m = fam == f
            d["by_family"][f] = float(roc_auc_score(yhe[m], s[m]))
        for g in sorted(set(mod) - {"human"}):
            m = (mod == g) | (mod == "human")
            d["by_generator"][g] = float(roc_auc_score(yhe[m], s[m]))
        out["detectors"][name] = d
    out["paired_gain_over_ngram"] = {}
    for name in list(scores)[3:]:
        g, ci = paired_diff_ci(yhe, scores[name], scores["ngram"], rng)
        out["paired_gain_over_ngram"][name] = {"delta_auroc": g, "ci95": ci}
    return out


def table(out):
    L = ["mimic-stack: held-out-family AUROC of single detectors and stacks (zero-shot subset)", "",
         f"train rows {out['n_train']}, held rows {out['n_held']}", "",
         f"{'detector':34s}{'AUROC [95% CI]':26s}" + "".join(f"{f:>9s}" for f in HELD) + "".join(
             f"{g:>13s}" for g in next(iter(out['detectors'].values()))["by_generator"])]
    for n, d in out["detectors"].items():
        L.append(f"{n:34s}{d['auroc']:.3f} [{d['ci95'][0]:.3f},{d['ci95'][1]:.3f}]   "
                 + "".join(f"{d['by_family'][f]:9.3f}" for f in HELD) + "".join(f"{v:13.3f}" for v in d["by_generator"].values()))
    L += ["", "weights (z-scored ngram, logppl, bino): " + ", ".join(f"{w:.2f}" for w in out["weights_ngram_logppl_bino"]),
          "weights (z-scored ngram, bino): " + ", ".join(f"{w:.2f}" for w in out["weights_ngram_bino"]),
          "within-class correlation ngram vs bino on held rows: " + ", ".join(f"{k}={v:.2f}" for k, v in out["corr_ngram_bino_within_class"].items())]
    L.append("")
    for n, d in out["paired_gain_over_ngram"].items():
        L.append(f"AUROC({n}) - AUROC(ngram): {d['delta_auroc']:+.3f} [{d['ci95'][0]:+.3f},{d['ci95'][1]:+.3f}] (paired bootstrap)")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    o = run()
    json.dump(o, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    t = table(o)
    open(os.path.join(HERE, "results.txt"), "w").write(t)
    print(t)
