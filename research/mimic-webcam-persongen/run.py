"""AUROC of a detector separating each person's later real windows from generated ones."""
import json
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

import persongen as P
import data as D
import signals as S


def score(rf, rh, ff, fh, of_real, oh_real, of_fake, oh_fake, seed, aware):
    """Train on (real fit vs fake fit), test on (real held vs fake held)."""
    A = [S.stack(S.feature_groups(w)) for w in (rf, ff, rh, fh)]
    if aware:
        fg_r = S.feature_groups(rf)
        extra = [P.profile(fg_r, of_real, o) for o in (of_real, of_fake, oh_real, oh_fake)]
        A = [np.hstack([a, e]) for a, e in zip(A, extra)]
    clf = HistGradientBoostingClassifier(max_iter=100, random_state=seed).fit(
        np.vstack(A[:2]), np.r_[np.ones(len(A[0])), np.zeros(len(A[1]))])
    y = np.r_[np.ones(len(A[2])), np.zeros(len(A[3]))]
    return float(roc_auc_score(y, clf.predict_proba(np.vstack(A[2:]))[:, 1]))


def main(seeds=4):
    X, person, _ = D.load()
    res = {}
    for seed in range(seeds):
        real, fakes = P.build(X, person, seed)
        for g, (ff, fh, of, oh) in fakes.items():
            for aware in (False, True):
                key = f"{g} | {'profile-aware' if aware else 'population'} detector"
                res.setdefault(key, []).append(score(
                    real["fit"], real["held"], ff, fh, real["fit_owner"], real["held_owner"], of, oh, seed, aware))
        print("seed", seed, {k: round(v[-1], 3) for k, v in res.items()}, flush=True)
    json.dump({"auroc": res, "seeds": seeds}, open("results/persongen.json", "w"))
    with open("results/persongen.txt", "w") as f:
        f.write(f"generator\tpopulation detector\tprofile-aware detector\t(mean AUROC of {seeds} seeds; min..max of population)\n")
        for g in P.GENERATORS:
            a, b = res[f"{g} | population detector"], res[f"{g} | profile-aware detector"]
            f.write(f"{g}\t{np.mean(a):.3f}\t{np.mean(b):.3f}\t{min(a):.3f}..{max(a):.3f}\n")
    print(open("results/persongen.txt").read())


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)
