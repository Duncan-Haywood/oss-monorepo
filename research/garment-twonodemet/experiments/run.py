"""One step in metabolic rate at minute 90 of 180: fixed closed, fixed open, thermostat gate and an oracle.
Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodemet import met as st
warnings.filterwarnings("ignore")
out = []
def P(s=""):
    print(s); out.append(s)
nm = lambda t: "closed" if t == st.CLOSED else "open"
for cname, o in (("ours", st.OURS), ("ref", st.REF)):
    P(f"== choice set {cname}: mean |tsk-33.7| C over 180 min (lower is better); gate bands on tsk, lag in min ==")
    for sc, (ta, m0, m1) in st.SCENARIOS.items():
        rows = []
        for lab, g in (("fixed closed", st.fixed(st.CLOSED)), ("fixed open", st.fixed(st.OPEN)),
                       ("gate 33.2-34.2 lag 0", st.Gate(33.2, 34.2, 0)), ("gate 33.2-34.2 lag 10", st.Gate(33.2, 34.2, 10)),
                       ("gate 33.0-34.0 lag 0", st.Gate(33.0, 34.0, 0))):
            r, tr = st.simulate(ta, m0, m1, o, g)
            rows.append((lab, st.discomfort(tr), r["tsk"], st.sw.open_fraction(tr)))
        d, t0, t1 = st.oracle(ta, m0, m1, o)
        rows.append((f"oracle ({nm(t0)} then {nm(t1)})", d, None, None))
        P(f"-- {sc}: room {ta:.0f} C, {m0} met then {m1} met")
        for lab, d, tsk, of in rows:
            extra = "" if tsk is None else f"  end tsk {tsk:.2f}  open {of:.2f}"
            P(f"   {lab:28s} {d:.3f}{extra}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
