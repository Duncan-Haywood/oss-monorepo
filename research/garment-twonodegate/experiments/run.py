"""Gated-textile bounds (closed tau 0.15, open tau 0.8) of garment-thermal section E, rerun in the
switchable two-node model under 'ours' and 'ref' choices, at 3 h and at steady state.
Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodegate import gate
warnings.filterwarnings("ignore")
out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)
CH = {"ours": gate.OURS, "ref": gate.REF}
TIMES = (("3h", gate.THREE_H), ("steady", gate.STEADY))

P("== A. Steady state check: largest change in tsk, tcr, dry, evap between 1440 and 2880 min over all runs below ==")
worst = max(abs(gate.state(r, t, o, gate.STEADY)[k] - gate.state(r, t, o, gate.CHECK)[k])
            for r in gate.ROOMS for t in (gate.CLOSED, gate.OPEN) for o in CH.values()
            for k in ("tsk", "tcr", "dry", "evap"))
P(f"worst change: {worst:.4f}")

P("\n== B. End states: skin C, core C, dry loss W/m2, evaporative loss W/m2 ==")
for room in gate.ROOMS:
    for nm, o in CH.items():
        for tl, m in TIMES:
            for lab, tau in (("closed", gate.CLOSED), ("open", gate.OPEN)):
                r = gate.state(room, tau, o, m)
                P(f"{room:21s} {nm:4s} {tl:6s} {lab:6s} tsk {r['tsk']:.2f} tcr {r['tcr']:.2f} dry {r['dry']:6.1f} evap {r['evap']:6.1f}")

P("\n== C. Open minus closed: dTsk (C), dTcr (C), dDry (W/m2), dEvap (W/m2) ==")
for room in gate.ROOMS:
    for nm, o in CH.items():
        for tl, m in TIMES:
            e = gate.gate_effect(room, o, m)
            P(f"{room:21s} {nm:4s} {tl:6s} {e['tsk']:+.2f} {e['tcr']:+.2f} {e['dry']:+6.1f} {e['evap']:+6.1f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
