"""For each lag and penalty, tune both gates on the narrow and on the wide training rooms; score on three held-out room groups. Deterministic; writes results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodewide import wide as W
Q = W.Q
warnings.filterwarnings("ignore")
out = []
def Pr(s=""):
    print(s); out.append(s)
Pr("Difference = held-out cost of tuned proportional gate minus tuned on/off gate (C, penalty term included); negative = proportional better.")
Pr(f"on/off grid {len(Q.h.bands())} bands, proportional grid {len(Q.P.grid())} bands; train narrow = {len(W.TRAIN_NARROW)} scenarios, wide = {len(W.TRAIN_WIDE)}")
assert W.disjoint()
tests = list(W.TEST.items())
wins = {(t, n): [0, 0] for t, _ in [("narrow", 0), ("wide", 0)] for n, _ in tests}
for cname, o in (("ours", Q.OURS), ("ref", Q.REF)):
    Pr(f"== choice set {cname} ==")
    Pr(f"{'lag':>4s} {'pen':>5s} {'train':>6s} | " + " | ".join(f"{n[:22]:>22s}" for n, _ in tests))
    for lag in Q.LAGS:
        for pen in W.PENALTIES:
            for tname, tr in (("narrow", W.TRAIN_NARROW), ("wide", W.TRAIN_WIDE)):
                bo, _ = Q.tune(Q.onoff_cost, tr, o, lag, pen, Q.h.bands())
                bp, _ = Q.tune(Q.prop_cost, tr, o, lag, pen, Q.P.grid())
                ds = []
                for n, sc in tests:
                    d = Q.mean(Q.prop_cost, sc, o, bp, lag, pen) - Q.mean(Q.onoff_cost, sc, o, bo, lag, pen)
                    ds.append(d); wins[(tname, n)][0] += d < 0; wins[(tname, n)][1] += 1
                Pr(f"{lag:4.0f} {pen:5.2f} {tname:>6s} | " + " | ".join(f"{d:+22.3f}" for d in ds) + f" | prop {bp[0]:.1f}-{bp[1]:.1f} onoff {bo[0]:.1f}-{bo[1]:.1f}")
Pr("== wins of proportional (cells, of 16 per entry: 2 choice sets x 4 lags x 2 penalties) ==")
for (t, n), (w, c) in wins.items():
    Pr(f"trained {t:>6s} | test {n:<42s} | {w} of {c}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
