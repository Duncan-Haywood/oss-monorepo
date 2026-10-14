"""Tune the gate band on training rooms, then score it on held-out rooms. Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeheld import held as h
warnings.filterwarnings("ignore")
out = []
def P(s=""):
    print(s); out.append(s)
SETS = (("train", h.TRAIN), ("test between", h.TEST_BETWEEN), ("test outside", h.TEST_OUTSIDE))
P("Mean |tsk-33.7| C over 180 min, averaged over each set (rest->walk and walk->rest in every room); lower is better.")
P(f"train rooms 22, 24, 26 C; held-out between 23, 25 C; held-out outside 20, 28 C; {len(h.bands())} candidate bands, lag 0")
for cname, o in (("ours", h.OURS), ("ref", h.REF)):
    band, tr = h.tune(h.TRAIN, o)
    fx = {"closed": h.CLOSED, "open": h.OPEN}
    best_fixed = min(fx, key=lambda k: h.mean_score(h.TRAIN, o, tau=fx[k]))
    P(f"== choice set {cname}: tuned band {band[0]}-{band[1]} (train mean {tr:.3f}); best fixed state on train: {best_fixed} ==")
    pol = [("tuned gate", dict(band=band)), (f"default gate {h.DEFAULT_BAND[0]}-{h.DEFAULT_BAND[1]}", dict(band=h.DEFAULT_BAND)),
           ("fixed closed", dict(tau=h.CLOSED)), ("fixed open", dict(tau=h.OPEN))]
    P(f"   {'':26s}" + "".join(f"{n:>14s}" for n, _ in SETS))
    for lab, kw in pol:
        P(f"   {lab:26s}" + "".join(f"{h.mean_score(s, o, **kw):14.3f}" for _, s in SETS))
    P(f"   {'oracle (per scenario)':26s}" + "".join(f"{h.oracle_mean(s, o):14.3f}" for _, s in SETS))
    P("   per held-out scenario (tuned / default / closed / open / oracle):")
    for sc in h.TEST_BETWEEN + h.TEST_OUTSIDE:
        v = [h.score(sc, o, band=band), h.score(sc, o, band=h.DEFAULT_BAND), h.score(sc, o, tau=h.CLOSED),
             h.score(sc, o, tau=h.OPEN), h.met.oracle(*sc, o)[0]]
        P(f"     {sc[0]:.0f} C {sc[1]:.0f}->{sc[2]:.0f} met  " + " ".join(f"{x:7.3f}" for x in v))
    sw = lambda b: [h.met.sw.switches(h.met.simulate(*sc, o, h.Gate(b[0], b[1], 0.0))[1]) for sc in h.TEST_BETWEEN + h.TEST_OUTSIDE]
    P(f"   gate switch counts over 180 min on the 8 held-out scenarios: tuned {sw(band)}, default {sw(h.DEFAULT_BAND)}")
    # sensitivity: how many candidate bands are within 0.02 C of the tuned train mean
    near = [b for b in h.bands() if h.mean_score(h.TRAIN, o, band=b) <= tr + 0.02]
    P(f"   bands within 0.02 C of the best train mean: {len(near)} of {len(h.bands())}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
