"""Which feature group gives the Markov generators away, and does more states help?

Single-group detectors (one feature group at a time) against `own markov frame`,
and a sweep over K for the all-groups detector. One seed per K; seeds 0..2 for groups.
"""
import json
import os
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam-persongen"))
import markov as M  # noqa: E402
import data as D  # noqa: E402
import signals as S  # noqa: E402


def auroc(rf, rh, ff, fh, groups, seed):
    A = [S.stack(S.feature_groups(w), groups) for w in (rf, ff, rh, fh)]
    clf = HistGradientBoostingClassifier(max_iter=100, random_state=seed).fit(
        np.vstack(A[:2]), np.r_[np.ones(len(A[0])), np.zeros(len(A[1]))])
    y = np.r_[np.ones(len(A[2])), np.zeros(len(A[3]))]
    return float(roc_auc_score(y, clf.predict_proba(np.vstack(A[2:]))[:, 1]))


def main():
    X, person, _ = D.load()
    out = {"groups": {}, "k": {}}
    gens = ("own markov frame", "own markov gauss")
    for seed in range(3):
        real, fakes = M.build(X, person, seed, 32, gens)
        for g in gens:
            ff, fh = fakes[g][:2]
            for grp in S.GROUPS:
                out["groups"].setdefault(f"{g} | {grp}", []).append(auroc(real["fit"], real["held"], ff, fh, (grp,), seed))
        print("groups seed", seed, flush=True)
    for k in (4, 8, 32, 128):
        real, fakes = M.build(X, person, 0, k, gens[:1])
        ff, fh = fakes[gens[0]][:2]
        out["k"][str(k)] = auroc(real["fit"], real["held"], ff, fh, S.GROUPS, 0)
        print("K", k, out["k"][str(k)], flush=True)
    json.dump(out, open("results/diag.json", "w"))
    with open("results/diag.txt", "w") as f:
        f.write("single feature group detector\town markov frame\town markov gauss\t(mean AUROC of 3 seeds)\n")
        for grp in S.GROUPS:
            f.write(f"{grp}\t{np.mean(out['groups'][f'{gens[0]} | {grp}']):.3f}\t{np.mean(out['groups'][f'{gens[1]} | {grp}']):.3f}\n")
        f.write("\nK (states)\town markov frame, all-groups detector, seed 0\n")
        for k, v in out["k"].items():
            f.write(f"{k}\t{v:.3f}\n")
    print(open("results/diag.txt").read())


if __name__ == "__main__":
    main()
