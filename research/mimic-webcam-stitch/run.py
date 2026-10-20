"""Reference-detector AUROC of block-stitched real signals vs held-out people."""
import json
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

import stitch as T
import data as D
import signals as S

SEGS = (5, 10, 25, 50)


def auroc(groups, a, b, c, d, seed):
    clf = HistGradientBoostingClassifier(max_iter=100, random_state=seed).fit(
        np.vstack([S.stack(a, groups), S.stack(b, groups)]), np.r_[np.ones(len(a["level"])), np.zeros(len(b["level"]))])
    y = np.r_[np.ones(len(c["level"])), np.zeros(len(d["level"]))]
    return float(roc_auc_score(y, clf.predict_proba(np.vstack([S.stack(c, groups), S.stack(d, groups)]))[:, 1]))


def main(seeds=4):
    X, person, _ = D.load()
    res, grp = {}, {}
    for seed in range(seeds):
        tr, lo, te = S.split(person, seed)
        mtr, mte = np.isin(person, tr), np.isin(person, te)
        Wtr, Wte, ptr = X[mtr], X[mte], person[mtr]
        rng = np.random.default_rng(seed)
        makers = {"replay whole windows (ceiling)": lambda n: S.replay(Wtr, n, rng)}
        for mode in T.MODES:
            for seg in SEGS:
                makers[f"{mode} {seg}"] = lambda n, m=mode, s=seg: T.stitch(Wtr, ptr, n, rng, seg=s, mode=m)
        for name, mk in makers.items():
            a, b, c, d = (S.feature_groups(w) for w in (Wtr, mk(len(Wtr)), Wte, mk(len(Wte))))
            res.setdefault(name, []).append(auroc(S.GROUPS, a, b, c, d, seed))
            for g in S.GROUPS:
                grp.setdefault(name, {}).setdefault(g, []).append(auroc((g,), a, b, c, d, seed))
        print("seed", seed, {k: round(v[-1], 3) for k, v in res.items()}, flush=True)
    json.dump({"all": res, "by_group": grp, "seeds": seeds}, open("results/stitch.json", "w"))
    with open("results/stitch.txt", "w") as f:
        f.write("generator\tall groups\t" + "\t".join(S.GROUPS) + f"\t(mean of {seeds} seeds)\n")
        for k in res:
            f.write(f"{k}\t{np.mean(res[k]):.3f}\t" + "\t".join(f"{np.mean(grp[k][g]):.3f}" for g in S.GROUPS) + "\n")
    print(open("results/stitch.txt").read())


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)
