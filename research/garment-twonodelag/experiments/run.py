"""Retune the gate band for each actuation lag and per-switch penalty; score on held-out rooms. Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodelag import lag as L
warnings.filterwarnings("ignore")
out = []
def P(s=""):
    print(s); out.append(s)
SETS = (("train", L.TRAIN), ("between", L.TEST_BETWEEN), ("outside", L.TEST_OUTSIDE))
HELD = L.TEST_BETWEEN + L.TEST_OUTSIDE
P("Cost = mean |tsk-33.7| C over 180 min + penalty (C) x number of switches; averaged over each set; lower is better.")
P(f"train rooms 22, 24, 26 C; held-out between 23, 25 C; held-out outside 20, 28 C; {len(L.h.bands())} candidate bands; lag = first-order time constant in min")
for cname, o in (("ours", L.OURS), ("ref", L.REF)):
    P(f"== choice set {cname} ==")
    P(f"{'lag':>4s} {'pen':>5s} {'tuned band':>12s} | {'tuned':>22s} | {'default band':>22s} | {'fixed closed':>22s} | held-out switches tuned/default")
    P(f"{'':>4s} {'':>5s} {'':>12s} | " + " | ".join(f"{'train/betw/outs':>22s}" for _ in range(3)))
    for lag in L.LAGS:
        for pen in L.PENALTIES:
            band, _ = L.tune(L.TRAIN, o, lag, pen)
            f = lambda **kw: "/".join(f"{L.mean_cost(s, o, kw['band'], lag, pen):5.3f}" for _, s in SETS)
            fc = "/".join(f"{L.h.mean_score(s, o, tau=L.CLOSED):5.3f}" for _, s in SETS)
            swt = [L.n_switches(L.run(sc, o, band, lag)) for sc in HELD]
            swd = [L.n_switches(L.run(sc, o, L.DEFAULT_BAND, lag)) for sc in HELD]
            P(f"{lag:4.0f} {pen:5.2f} {band[0]:5.1f}-{band[1]:<6.1f} | {f(band=band):>22s} | {f(band=L.DEFAULT_BAND):>22s} | {fc:>22s} | {sum(swt)}/{sum(swd)}")
    P("   (fixed closed has no switches, so its cost is the plain proxy at any lag and penalty)")
    worse_def, worse_fix, edge = [], [], []
    for lag in L.LAGS:
        for pen in L.PENALTIES:
            band, _ = L.tune(L.TRAIN, o, lag, pen)
            if band[1] - band[0] < 0.11: edge.append((lag, pen))
            for nm, s in SETS[1:]:
                t, d = L.mean_cost(s, o, band, lag, pen), L.mean_cost(s, o, L.DEFAULT_BAND, lag, pen)
                fx = L.h.mean_score(s, o, tau=L.CLOSED)
                if t > d + 1e-9: worse_def.append((lag, pen, nm, round(t - d, 3)))
                if t > fx + 1e-9: worse_fix.append((lag, pen, nm, round(t - fx, 3)))
    P(f"   cells (lag, penalty, held-out set) where the tuned band costs more than the default band: {worse_def}")
    P(f"   cells where the tuned band costs more than never switching (fixed closed): {worse_fix}")
    P(f"   (lag, penalty) where the tuned band is the narrowest in the grid (0.1 C wide): {edge}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
