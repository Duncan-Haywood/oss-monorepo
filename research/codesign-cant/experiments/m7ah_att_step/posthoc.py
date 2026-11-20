"""Milestone 7ah, post hoc (not predicted): the two estimators against each other, lag by geometry and set, and the single pooled
tau each 7ag condition would pick on a 100-250 ms grid (7ag's own fit searched 0-150 ms). Writes posthoc.txt."""
import os, sys
import numpy as np
from scipy.stats import spearmanr

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import verdicts as W  # noqa: E402

V = W.V
t35, t63 = W.ident("tau", 3.5), W.ident("t63", 3.5)
kd = np.array([V.G[k]["kd"] for k in W.KEYS])
L = ["Milestone 7ah post hoc (not predicted). 36 ms law, A = 3.5 unless said.",
     "63%% time: median %.1f ms, range %.0f-%.0f; area tau median %.1f, range %.0f-%.0f; Spearman(area, 63%%) %.2f"
     % (np.median(t63) * 1e3, t63.min() * 1e3, t63.max() * 1e3, np.median(t35) * 1e3, t35.min() * 1e3, t35.max() * 1e3, spearmanr(t35, t63).statistic),
     "Spearman(area tau, kd) %.2f" % spearmanr(t35, kd).statistic]
for g in sorted(set(k[1] for k in W.KEYS)):
    m = [i for i, k in enumerate(W.KEYS) if k[1] == g]
    L.append(f"geometry {g}: area tau median {np.median(t35[m]) * 1e3:.0f} ms, 63% {np.median(t63[m]) * 1e3:.0f} ms")
for st in sorted(set(k[0] for k in W.KEYS)):
    m = [i for i, k in enumerate(W.KEYS) if k[0] == st]
    L.append(f"set {st}: area tau median {np.median(t35[m]) * 1e3:.0f} ms")
L.append("best single pooled tau per condition (grid 100-250 ms by 10 ms):")
for c in [tuple(c) for c in V.R["conds"]]:
    T = V.table(*c)
    best = min(((V.mae(T["sim"], W.pred(t, *c)), t) for t in np.round(np.arange(0.10, 0.2501, 0.01), 2)))
    L.append(f"  A_P {c[0]:g} S {c[1]:g}: {best[1] * 1000:.0f} ms (median |error| {best[0]:.4f} s)")
out = "\n".join(L) + "\n"
open(os.path.join(HERE, "posthoc.txt"), "w").write(out); print(out)
