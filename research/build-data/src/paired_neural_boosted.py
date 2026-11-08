"""Per-permit paired week-block bootstrap of neural minus boosted pinball (milestone 27, part).

Needs pandas, numpy, scipy, lightgbm, torch (CPU). Run:
  python3 src/paired_neural_boosted.py DATA_DIR --city sf --target a2i --test-year 2024 [--seeds 3]

Refits both models exactly as src/boosted.py and src/neural.py do (their functions are imported,
not copied), keeps the per-row, seed-averaged pinball loss of each on the same test rows, and
bootstraps the paired difference by resampling test weeks (the harness scheme). Negative = neural
better. Writes results/paired_<city>_<target>_<year>.json.
"""
import argparse, json, os, sys
import numpy as np, torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness, neural  # noqa: E402

TAUS = harness.TAUS


def boot_pvalue(diff, weeks, n_boot=2000, seed=0):
    """Two-sided week-block bootstrap p for mean(diff) = 0 (session 47).

    Same resampling as boosted.block_boot (same seed, so the same draws as the stored interval).
    p = 2 * min(P*(stat <= 0), P*(stat >= 0)), with +1 smoothing so p is never 0 and at least 1/(n_boot+1)
    (resolution limit: about 5e-4 at 2000 draws). Percentile-bootstrap sign p, not a studentised test.
    """
    import pandas as pd
    codes, uniq = pd.factorize(weeks)
    sums = np.bincount(codes, weights=diff, minlength=len(uniq))
    cnt = np.bincount(codes, minlength=len(uniq)).astype(float)
    idx = np.random.default_rng(seed).integers(0, len(uniq), size=(n_boot, len(uniq)))
    stat = sums[idx].sum(1) / cnt[idx].sum(1)
    lo_tail = (np.sum(stat <= 0) + 1) / (n_boot + 1)
    hi_tail = (np.sum(stat >= 0) + 1) / (n_boot + 1)
    return float(min(1.0, 2 * min(lo_tail, hi_tail)))


def paired(df, test_year, seeds):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    if not (len(tr) and len(ca) and len(te)):
        raise SystemExit(f"empty split {len(tr)}/{len(ca)}/{len(te)}")
    ytr, yca, yte = tr.y.to_numpy(float), ca.y.to_numpy(float), te.y.to_numpy(float)
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    Xtr, Xca, Xte = boosted.featurise(tr, [ca, te])
    (etr, eca, ete), sizes = neural.encode(tr, [ca, te])
    B = {t: [] for t in TAUS}; N = {t: [] for t in TAUS}
    for s in range(seeds):
        pr, _, _, _ = boosted.fit_predict(Xtr, ytr, Xca, yca, Xte, seed=s)
        for t in TAUS:
            B[t].append(boosted.pin(yte, pr[t], t))
        net, _ = neural.fit(etr, eca, ytr, yca, sizes, s)
        q, _ = neural.predict(net, *ete)
        q = np.maximum(q, 0)
        for j, t in enumerate(TAUS):
            N[t].append(boosted.pin(yte, q[:, j], t))
    out = dict(test_year=test_year, n_train=len(tr), n_test=len(te), seeds=seeds, n_weeks=len(set(wk)), cells={})
    for t in TAUS:
        lb, ln = np.mean(B[t], axis=0), np.mean(N[t], axis=0)
        d = ln - lb                                   # negative = neural better
        m, lo, hi = boosted.block_boot(d, wk)
        out["cells"][str(t)] = dict(boosted=float(lb.mean()), neural=float(ln.mean()), diff=m, lo=lo, hi=hi,
                                    p_boot=boot_pvalue(d, wk),
                                    rel=m / float(lb.mean()), significant=bool(lo > 0 or hi < 0))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=3)
    a = ap.parse_args()
    torch.set_num_threads(4)
    df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r = paired(df, a.test_year, a.seeds)
    r.update(city=a.city, target=a.target, negative_dropped=neg)
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                     f"paired_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(p, "w"), indent=1)
    print(json.dumps(r, indent=1))
