"""Which feature group alone separates the best fixed generator (L5) from people? Reference-style trees, one group at a time."""
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

import data as D
import ladder as L
import signals as S

X, person, _ = D.load()
res = {g: [] for g in S.GROUPS}
for seed in range(8):
    tr, lo, te = S.split(person, seed)
    Wtr, Wte = X[np.isin(person, tr)], X[np.isin(person, te)]
    fit, rng = S.Fit(Wtr), np.random.default_rng(seed)
    ftr, fte = S.generate(L.LADDER["L5 + holds and spikes"], fit, len(Wtr), rng), S.generate(L.LADDER["L5 + holds and spikes"], fit, len(Wte), rng)
    a, b, c, d = (S.feature_groups(w) for w in (Wtr, ftr, Wte, fte))
    for g in S.GROUPS:
        clf = HistGradientBoostingClassifier(max_iter=100, random_state=seed).fit(np.vstack([a[g], b[g]]), np.r_[np.ones(len(Wtr)), np.zeros(len(ftr))])
        res[g].append(roc_auc_score(np.r_[np.ones(len(Wte)), np.zeros(len(fte))], clf.predict_proba(np.vstack([c[g], d[g]]))[:, 1]))
with open("results/groups.txt", "w") as f:
    f.write("group\tmean AUROC alone (L5 vs held-out people, 8 seeds)\n")
    for g, v in sorted(res.items(), key=lambda kv: -np.mean(kv[1])):
        f.write(f"{g}\t{np.mean(v):.3f}\n")
print(open("results/groups.txt").read())
