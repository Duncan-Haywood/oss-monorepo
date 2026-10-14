"""One step in room temperature at minute 90 of 180: fixed closed, fixed open, thermostat gate and an oracle.
Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodestep import step as st
warnings.filterwarnings("ignore")
out = []
def P(s=""):
    print(s); out.append(s)
nm = lambda t: "closed" if t == st.CLOSED else "open"
for cname, o in (("ours", st.OURS), ("ref", st.REF)):
    P(f"== choice set {cname}: mean |tsk-33.7| C over 180 min (lower is better); gate bands on tsk, lag in min ==")
    for sc, (a, b) in st.SCENARIOS.items():
        rows = []
        for lab, g in (("fixed closed", st.fixed(st.CLOSED)), ("fixed open", st.fixed(st.OPEN)),
                       ("gate 33.2-34.2 lag 0", st.Gate(33.2, 34.2, 0)), ("gate 33.2-34.2 lag 10", st.Gate(33.2, 34.2, 10)),
                       ("gate 33.0-34.0 lag 0", st.Gate(33.0, 34.0, 0))):
            r, tr = st.simulate(a, b, o, g)
            rows.append((lab, st.discomfort(tr), r["tsk"], st.__dict__["sw"].open_fraction(tr)))
        d, t0, t1 = st.oracle(a, b, o)
        rows.append((f"oracle ({nm(t0)} then {nm(t1)})", d, None, None))
        P(f"-- {sc}: {a:.0f} C then {b:.0f} C")
        for lab, d, tsk, of in rows:
            extra = "" if tsk is None else f"  end tsk {tsk:.2f}  open {of:.2f}"
            P(f"   {lab:28s} {d:.3f}{extra}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
