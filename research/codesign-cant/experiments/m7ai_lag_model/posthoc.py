"""Milestone 7ai post hoc (not predicted): the designs where the linear 63% time misses the flown one, why, and how the 50 ms share
and the lag depend on the side-force coefficient lat. Writes posthoc.txt."""
import os
import numpy as np
import verdicts as W

KEYS, n = W.KEYS, len(W.KEYS)
L = []
say = L.append
f63, b63 = W.flown("base", "t63", 1.0), W.lin("box", "t63", 1.0)
ft, bt = W.flown("base", "tau", 1.0), W.lin("box", "tau", 1.0)
lat = np.array([W.LIN[k]["lat"] for k in KEYS])
say("Milestone 7ai post hoc (not predicted). A = 1 m/s^2, 36 ms law unless said.")
for i in np.argsort(-np.abs(b63 - f63))[:3]:
    k = KEYS[i]
    r = np.array(W.LIN[k]["box_1"]["resp"])
    fr = np.array(W.FL[(k, "base", 1.0)]["mean_resp"], float)
    t = (np.arange(len(r)) * 5 + 1) * 0.002
    near = (r > 0.55) & (r < 0.70) & (t < 0.6)
    say(f"  {k[1]} {k[0]} seed {k[2]}: linear 63% {b63[i] * 1e3:.0f} ms, flown {f63[i] * 1e3:.0f} ms; area tau {bt[i] * 1e3:.0f} vs {ft[i] * 1e3:.0f} ms; "
        f"lat {lat[i]:.2f}; linear response spends {near.sum() * 10} ms of the first 0.6 s between 0.55 and 0.70 "
        f"(at 0.1/0.2/0.3/0.4 s: {', '.join(f'{r[j]:.2f}' for j in (9, 19, 29, 39))}; flown {', '.join(f'{fr[j]:.2f}' for j in (9, 19, 29, 39))})")
def spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])
eb, en = W.flown("base", "early", 1.0), W.flown("nolat", "early", 1.0)
say(f"50 ms share against lat: Spearman {spearman(lat, eb):.2f} (base), {spearman(lat, en):.2f} (nolat); lat range {lat.min():.2f}-{lat.max():.2f} 1/m")
say(f"50 ms share, linear (box) against flown: median |diff| {np.median(np.abs(W.lin('box', 'early', 1.0) - eb)):.3f}, max {np.max(np.abs(W.lin('box', 'early', 1.0) - eb)):.3f}")
fn63 = W.flown("nolat", "t63", 1.0)
say(f"63% time with and without the side force: base median {np.median(f63) * 1e3:.0f} ms, nolat {np.median(fn63) * 1e3:.0f} ms; "
    f"linear lat = 0 (box) median {np.median(W.lin('box_nolat', 't63', 1.0)) * 1e3:.0f} ms, within 15 ms of flown nolat for "
    f"{int(np.sum(np.abs(W.lin('box_nolat', 't63', 1.0) - fn63) <= 0.015))}/{n}")
say(f"area tau with and without: base median {np.median(ft) * 1e3:.0f} ms, nolat {np.median(W.flown('nolat', 'tau', 1.0)) * 1e3:.0f} ms")
b35 = W.lin("box", "t63", 3.5)
say(f"linear model is amplitude-free (linear): 63% at 3.5 equals 1.0 for {int(np.sum(np.abs(b35 - b63) < 1e-9))}/{n}; flown 63% at 3.5 minus 1.0: "
    f"median {np.median(W.flown('base', 't63', 3.5) - f63) * 1e3:+.0f} ms")
conds = [tuple(c) for c in W.V.R["conds"]]
T = {c: W.V.table(*c) for c in conds}
say("lagged point mass with the box-mean linear AREA tau (no flight) instead of its 63% time: n within 0.10 s / median |error| (s) per condition: "
    + "; ".join(f"A_P {c[0]:g} S {c[1]:g}: {W.V.within_abs(T[c]['sim'], W.W.pred(bt, *c), 0.1)}/{n}, {W.V.mae(T[c]['sim'], W.W.pred(bt, *c)):.3f}" for c in conds))
out = "\n".join(L) + "\n"
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "posthoc.txt"), "w").write(out)
print(out)
