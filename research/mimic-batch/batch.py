"""mimic-batch: how many texts from one source does a weak per-text detector need before a batch verdict is reliable?

For each held family F: fit the mimic-contexts n-gram detector on the other 7 families (as mimic-threshold),
score F once. Split F's human texts into a calibration half and a test half. A batch is k texts drawn with
replacement; its statistic is the mean detector score. The threshold is the 95th percentile of calibration-half
human batch means (so 5% FPR by construction on the calibration half); FPR is then measured on test-half human
batches and TPR on batches of machine texts (a fraction `p` of each batch machine, the rest human, from the test half).
Writes results.json and results.txt. No network, no model.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-threshold"))

KS = [1, 2, 4, 8, 16, 32]
PS = [1.0, 0.5, 0.25, 0.1]
NB = 4000
TARGET = 0.05


def batch_means(pool, k, n, rng):
    """n batches of k scores drawn with replacement from pool; returns their means."""
    return np.asarray(pool)[rng.integers(0, len(pool), size=(n, k))].mean(axis=1)


def mixed_means(sh, sm, k, p, n, rng):
    """n batches with round(p*k) machine scores and the rest human; returns their means."""
    m = int(round(p * k))
    if m == 0:
        return batch_means(sh, k, n, rng)
    parts = [np.asarray(sm)[rng.integers(0, len(sm), size=(n, m))]]
    if k - m:
        parts.append(np.asarray(sh)[rng.integers(0, len(sh), size=(n, k - m))])
    return np.concatenate(parts, axis=1).mean(axis=1)


def auroc(neg, pos):
    """P(pos > neg) + 0.5 P(tie), by ranks."""
    from scipy.stats import rankdata
    r = rankdata(np.concatenate([neg, pos]))
    n0, n1 = len(neg), len(pos)
    return float((r[n0:].sum() - n1 * (n1 + 1) / 2) / (n0 * n1))


def simulate(sh, sm, ks=KS, ps=PS, nb=NB, seed=0, target=TARGET):
    """sh, sm: scores of the family's human and machine texts. Returns {k: {p: stats}}."""
    rng = np.random.default_rng(seed)
    sh, sm = np.asarray(sh), np.asarray(sm)
    idx = rng.permutation(len(sh))
    cal, test = sh[idx[: len(sh) // 2]], sh[idx[len(sh) // 2:]]
    out = {}
    for k in ks:
        thr = float(np.quantile(batch_means(cal, k, nb, rng), 1 - target))
        hum = batch_means(test, k, nb, rng)
        out[k] = {"fpr": float((hum > thr).mean())}
        for p in ps:
            mk = int(round(p * k))
            if mk == 0:
                continue
            pos = mixed_means(test, sm, k, p, nb, rng)
            out[k][p] = {"tpr": float((pos > thr).mean()), "auroc": auroc(hum, pos)}
    return out


def main():
    import threshold as T
    items = T.load()
    res = {}
    for f in T.FAMILIES:
        tr = [i for i in items if i["family"] != f]
        te = [i for i in items if i["family"] == f]
        s = np.asarray(T.fit([i["text"] for i in tr], [i["y"] for i in tr])([i["text"] for i in te]))
        y = np.array([i["y"] for i in te])
        res[f] = simulate(s[y == 0], s[y == 1])
        print(f, file=sys.stderr, flush=True)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    lines = [f"{'family':10} {'k':>3} {'FPR':>6} | TPR at 5% FPR / AUROC, by machine share of the batch: " + "  ".join(f"p={p}" for p in PS)]
    for f, r in res.items():
        for k, m in r.items():
            cells = [f"{m[p]['tpr']:.2f}/{m[p]['auroc']:.2f}" if p in m else "  -  " for p in PS]
            lines.append(f"{f:10} {k:>3} {m['fpr']:.3f} | " + "  ".join(cells))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
