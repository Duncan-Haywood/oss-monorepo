"""For each lag and per-swing penalty, tune the best on/off band and the best proportional band on training rooms, then score both on held-out rooms. Deterministic; writes results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodepen import pen as Q
warnings.filterwarnings("ignore")
out = []
def Pr(s=""):
    print(s); out.append(s)
Pr("Cost = mean |tsk-33.7| C over 180 min + penalty * swings (one full close-open swing = 1; on/off counts each full state change as 1, proportional counts total variation of transmittance / (OPEN-CLOSED)). Held-out mean; negative difference = proportional better.")
Pr(f"on/off grid {len(Q.h.bands())} bands, proportional grid {len(Q.P.grid())} bands")
wins = tot = 0
best = {}
for cname, o in (("ours", Q.OURS), ("ref", Q.REF)):
    Pr(f"== choice set {cname} ==")
    Pr(f"{'lag':>4s} {'pen':>6s} | {'on/off band':>11s} {'betw':>6s} {'outs':>6s} | {'prop band':>11s} {'betw':>6s} {'outs':>6s} | prop-onoff (betw, outs)")
    for lag in Q.LAGS:
        for pen in Q.PENALTIES:
            bo, _ = Q.tune(Q.onoff_cost, Q.TRAIN, o, lag, pen, Q.h.bands())
            bp, _ = Q.tune(Q.prop_cost, Q.TRAIN, o, lag, pen, Q.P.grid())
            so = [Q.mean(Q.onoff_cost, s, o, bo, lag, pen) for s in (Q.TEST_BETWEEN, Q.TEST_OUTSIDE)]
            sp = [Q.mean(Q.prop_cost, s, o, bp, lag, pen) for s in (Q.TEST_BETWEEN, Q.TEST_OUTSIDE)]
            d = [sp[0] - so[0], sp[1] - so[1]]
            Pr(f"{lag:4.0f} {pen:6.3f} | {bo[0]:5.1f}-{bo[1]:<5.1f} {so[0]:6.3f} {so[1]:6.3f} | {bp[0]:5.1f}-{bp[1]:<5.1f} {sp[0]:6.3f} {sp[1]:6.3f} | {d[0]:+.3f} {d[1]:+.3f}")
            for x in d:
                tot += 1; wins += x < 0
            best[(cname, lag, pen)] = d
Pr(f"cells where proportional beats on/off: {wins} of {tot}")
big = max((abs(x), k) for k, v in best.items() for x in v)
Pr(f"largest |difference|: {big[0]:.3f} C at {big[1]}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
