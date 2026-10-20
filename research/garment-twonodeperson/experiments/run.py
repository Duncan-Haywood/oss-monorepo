"""For each lag and penalty, tune both gates on the baseline person (0.5 clo, 70 kg, 1.7 m) and score them unchanged on
other clothing and body sizes; also retune each gate on the test group itself (an upper bound). Deterministic."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeperson import person as X
Q = X.Q
warnings.filterwarnings("ignore")
LAGS = (0.0, 5.0)
out = []
def Pr(s=""):
    print(s); out.append(s)
Pr("Cost = discomfort proxy + penalty * swings (C). 'gap' = held-out cost of the baseline-tuned gate minus the cost of the same gate type retuned on that group (>= 0).")
Pr("diff = proportional minus on/off; negative = proportional better. Rows are baseline-tuned unless marked retuned.")
tests = list(X.TEST.items())
wins = {n: [0, 0] for n, _ in tests}
gaps = {n: [[], []] for n, _ in tests}
for cname, o in (("ours", Q.OURS), ("ref", Q.REF)):
    Pr(f"== choice set {cname} ==")
    for lag in LAGS:
        for pen in X.PENALTIES:
            bo, co = X.tune(X.onoff_cost, X.TRAIN, o, lag, pen, Q.h.bands())
            bp, cp = X.tune(X.prop_cost, X.TRAIN, o, lag, pen, Q.P.grid())
            Pr(f"lag {lag:4.1f} pen {pen:5.2f} | train: onoff {co:.3f} {bo[0]:.1f}-{bo[1]:.1f}, prop {cp:.3f} {bp[0]:.1f}-{bp[1]:.1f}")
            for n, sc in tests:
                eo = X.mean(X.onoff_cost, sc, o, bo, lag, pen); ep = X.mean(X.prop_cost, sc, o, bp, lag, pen)
                ro, _ = X.tune(X.onoff_cost, sc, o, lag, pen, Q.h.bands()); rp, _ = X.tune(X.prop_cost, sc, o, lag, pen, Q.P.grid())
                go = eo - X.mean(X.onoff_cost, sc, o, ro, lag, pen); gp = ep - X.mean(X.prop_cost, sc, o, rp, lag, pen)
                d = ep - eo
                wins[n][0] += d < 0; wins[n][1] += 1; gaps[n][0].append(go); gaps[n][1].append(gp)
                Pr(f"   {n:<32s} onoff {eo:.3f} (gap {go:.3f}, retuned {ro[0]:.1f}-{ro[1]:.1f}) prop {ep:.3f} (gap {gp:.3f}, retuned {rp[0]:.1f}-{rp[1]:.1f}) diff {d:+.3f}")
Pr("== summary over 2 choice sets x 2 lags x 2 penalties = 8 cells per group ==")
for n, (w, c) in wins.items():
    go, gp = gaps[n]
    Pr(f"{n:<32s} proportional wins {w} of {c}; mean gap onoff {sum(go)/len(go):.3f}, prop {sum(gp)/len(gp):.3f}; max gap onoff {max(go):.3f}, prop {max(gp):.3f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
