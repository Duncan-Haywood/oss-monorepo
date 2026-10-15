"""Tune an on/off band and a proportional band per lag on training rooms; score both on held-out rooms. Deterministic; writes results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeprop import prop as P
warnings.filterwarnings("ignore")
out = []
def Pr(s=""):
    print(s); out.append(s)
SETS = (("train", P.TRAIN), ("between", P.TEST_BETWEEN), ("outside", P.TEST_OUTSIDE))
Pr("Discomfort proxy = mean |tsk-33.7| C over 180 min (no switch penalty); mean over each set; lower is better.")
Pr(f"on/off grid {len(P.h.bands())} bands, proportional grid {len(P.grid())} bands; lag = first-order time constant (min)")
wins = {}
for cname, o in (("ours", P.OURS), ("ref", P.REF)):
    Pr(f"== choice set {cname} ==")
    Pr(f"{'lag':>4s} | {'on/off band':>11s} {'train/betw/outs':>18s} | {'prop band':>11s} {'train/betw/outs':>18s} | prop minus on/off (betw, outs)")
    for lag in P.LAGS:
        bo, _ = P.L.tune(P.TRAIN, o, lag, 0.0)
        bp, _ = P.tune(P.TRAIN, o, lag)
        so = [P.L.mean_cost(s, o, bo, lag, 0.0) for _, s in SETS]
        sp = [P.mean_score(s, o, bp, lag) for _, s in SETS]
        f = lambda v: "/".join(f"{x:5.3f}" for x in v)
        Pr(f"{lag:4.0f} | {bo[0]:5.1f}-{bo[1]:<5.1f} {f(so):>18s} | {bp[0]:5.1f}-{bp[1]:<5.1f} {f(sp):>18s} | {sp[1]-so[1]:+.3f} {sp[2]-so[2]:+.3f}")
        wins[(cname, lag)] = (sp[1] - so[1], sp[2] - so[2])
    Pr("   tau range reached by the tuned proportional gate over the 8 held-out scenarios (min-max):")
    for lag in P.LAGS:
        bp, _ = P.tune(P.TRAIN, o, lag)
        r = [P.tau_range(sc, o, bp, lag) for sc in P.TEST_BETWEEN + P.TEST_OUTSIDE]
        Pr(f"     lag {lag:2.0f}: {min(a for a,_ in r):.2f}-{max(b for _,b in r):.2f}")
Pr("== how much does softness cost? best proportional band with width >= W (tuned on train), held-out between/outside, minus the unrestricted proportional ==")
for cname, o in (("ours", P.OURS), ("ref", P.REF)):
    for lag in (0.0, 10.0):
        base = [P.mean_score(s, o, P.tune(P.TRAIN, o, lag)[0], lag) for _, s in SETS[1:]]
        row = []
        for W in (0.6, 1.4, 3.0):
            b, _ = P.tune(P.TRAIN, o, lag, [g for g in P.grid() if g[1] - g[0] >= W - 1e-9])
            d = [P.mean_score(s, o, b, lag) - x for (_, s), x in zip(SETS[1:], base)]
            row.append(f"W>={W}: {b[0]:.1f}-{b[1]:.1f} {d[0]:+.3f}/{d[1]:+.3f}")
        Pr(f"  {cname} lag {lag:2.0f}: " + " | ".join(row))
n = sum(1 for v in wins.values() for x in v if x < 0)
Pr(f"cells (choice set, lag, held-out set) where proportional beats on/off: {n} of {2*len(P.LAGS)*2}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
