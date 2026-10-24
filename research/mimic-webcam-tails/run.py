"""Reference-detector AUROC of each tail-aware generator vs held-out people, plus per-group breakdown."""
import json
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

import tails as T
import data as D
import signals as S
import ladder as L


def auroc(clf_groups, a, b, c, d, seed):
    clf = HistGradientBoostingClassifier(max_iter=100, random_state=seed).fit(
        np.vstack([S.stack(a, clf_groups), S.stack(b, clf_groups)]), np.r_[np.ones(len(a["level"])), np.zeros(len(b["level"]))])
    y = np.r_[np.ones(len(c["level"])), np.zeros(len(d["level"]))]
    return float(roc_auc_score(y, clf.predict_proba(np.vstack([S.stack(c, clf_groups), S.stack(d, clf_groups)]))[:, 1]))


def main(seeds=4):
    X, person, _ = D.load()
    res, grp = {}, {}
    for seed in range(seeds):
        tr, lo, te = S.split(person, seed)
        Wtr, Wte = X[np.isin(person, tr)], X[np.isin(person, te)]
        fit = T.TailFit(Wtr)
        rng = np.random.default_rng(seed)
        for name, mk in T.GENERATORS.items():
            if mk is None:
                g5 = L.LADDER["L5 + holds and spikes"]
                mk = lambda f, n, r, g5=g5: S.generate(g5, f.base, n, r)
            ftr, fte = mk(fit, len(Wtr), rng), mk(fit, len(Wte), rng)
            a, b, c, d = (S.feature_groups(w) for w in (Wtr, ftr, Wte, fte))
            res.setdefault(name, []).append(auroc(S.GROUPS, a, b, c, d, seed))
            for g in S.GROUPS:
                grp.setdefault(name, {}).setdefault(g, []).append(auroc((g,), a, b, c, d, seed))
        print("seed", seed, {k: round(v[-1], 3) for k, v in res.items()}, flush=True)
    json.dump({"all": res, "by_group": grp, "seeds": seeds}, open("results/tails.json", "w"))
    with open("results/tails.txt", "w") as f:
        f.write("generator\tall groups\t" + "\t".join(S.GROUPS) + f"\t(mean of {seeds} seeds)\n")
        for k in res:
            f.write(f"{k}\t{np.mean(res[k]):.3f}\t" + "\t".join(f"{np.mean(grp[k][g]):.3f}" for g in S.GROUPS) + "\n")
    print(open("results/tails.txt").read())


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)
