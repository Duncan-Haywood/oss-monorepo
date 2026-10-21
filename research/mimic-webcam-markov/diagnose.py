"""Which feature group catches the Markov chains? One detector per group, seed 0.

Writes results/groups.txt: AUROC of a boosted tree trained on that group alone.
"""
import os
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

import markov as M

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam"))
import data as D  # noqa: E402
import signals as S  # noqa: E402

GEN = ("own markov8 centroid", "own markov128 member", "pooled markov128 member")


def main():
    X, person, _ = D.load()
    real, fakes = M.build(X, person, 0, generators=GEN)
    FR = {k: S.feature_groups(real[k]) for k in ("fit", "held")}
    lines = ["generator\t" + "\t".join(S.GROUPS) + "\tall"]
    for g in GEN:
        ff, fh, _, _ = fakes[g]
        FF, FH = S.feature_groups(ff), S.feature_groups(fh)
        row = []
        for groups in [(k,) for k in S.GROUPS] + [S.GROUPS]:
            tr = np.vstack([S.stack(FR["fit"], groups), S.stack(FF, groups)])
            y = np.r_[np.ones(len(real["fit"])), np.zeros(len(ff))]
            clf = HistGradientBoostingClassifier(max_iter=100, random_state=0).fit(tr, y)
            te = np.vstack([S.stack(FR["held"], groups), S.stack(FH, groups)])
            yt = np.r_[np.ones(len(real["held"])), np.zeros(len(fh))]
            row.append(f"{roc_auc_score(yt, clf.predict_proba(te)[:, 1]):.3f}")
        lines.append(g + "\t" + "\t".join(row))
    # between-window spread of the window mean (mean over channels of the std across windows), per person then averaged
    lines += ["", "between-window std of the window mean (held half, averaged over people)"]
    def between(W, owner):
        return float(np.mean([W[owner == p].mean(1).std(0).mean() for p in np.unique(owner) if (owner == p).sum() > 2]))
    lines.append("real\t%.2f" % between(real["held"], real["held_owner"]))
    for g in GEN:
        lines.append("%s\t%.2f" % (g, between(fakes[g][1], fakes[g][3])))
    open(os.path.join(HERE, "results", "groups.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
