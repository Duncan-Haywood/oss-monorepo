"""Switching gate vs fixed closed/open states, 'ours' and 'ref' choices, three rooms, 180 min.
Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeswitch import switch as sw
warnings.filterwarnings("ignore")
out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)
CH = {"ours": sw.OURS, "ref": sw.REF}

P("== A. Fixed states at 180 min: tsk C, tcr C, dry W/m2, evap W/m2 ==")
for room in sw.ROOMS:
    for nm, o in CH.items():
        for lab, tau in (("closed", sw.CLOSED), ("open", sw.OPEN)):
            r, _ = sw.run(room, o, tau=tau)
            P(f"{room:10s} {nm:4s} {lab:6s} tsk {r['tsk']:.2f} tcr {r['tcr']:.2f} dry {r['dry']:6.1f} evap {r['evap']:6.1f}")

P("\n== B. Switching gate (thresholds on tsk, lag in min): end state, fraction of minutes open, state changes ==")
for room in sw.ROOMS:
    for nm, o in CH.items():
        for lo, hi, lag in ((33.0, 34.0, 0), (33.0, 34.0, 10), (33.4, 33.6, 0), (33.4, 33.6, 10), (32.0, 35.0, 0)):
            g = sw.Gate(lo, hi, lag)
            r, tr = sw.run(room, o, gate=g)
            P(f"{room:10s} {nm:4s} band {lo}-{hi} lag {lag:2d} tsk {r['tsk']:.2f} tcr {r['tcr']:.2f} evap {r['evap']:6.1f} "
              f"open {sw.open_fraction(tr):.2f} changes {sw.switches(tr)}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
