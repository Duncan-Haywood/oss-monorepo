"""Grid-search optimal switching schedules (<= 0..3 toggles, 10 min grid) vs fixed states and the gate, for the four
room-temperature steps of garment-twonodestep. Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeopt import opt
st = opt.st
warnings.filterwarnings("ignore")
out = []
def P(s=""):
    print(s); out.append(s)
nm = lambda t: "closed" if t == opt.CLOSED else "open"
for cname, o in (("ours", opt.OURS), ("ref", opt.REF)):
    P(f"== choice set {cname}: mean |tsk-33.7| C over 180 min (lower is better) ==")
    for sc, (a, b) in opt.SCENARIOS.items():
        fx = min(st.discomfort(st.simulate(a, b, o, st.fixed(t))[1]) for t in (opt.CLOSED, opt.OPEN))
        gs = [st.discomfort(st.simulate(a, b, o, st.Gate(33.2, 34.2, lag))[1]) for lag in (0, 10)]
        P(f"-- {sc}: {a:.0f} C then {b:.0f} C   best fixed {fx:.3f}   gate lag 0 {gs[0]:.3f}   gate lag 10 {gs[1]:.3f}")
        for k in range(4):
            d, first, ts = opt.best_schedule(a, b, o, max_switches=k)
            P(f"   best with <= {k} toggles {d:.3f}  start {nm(first)}, toggle at {list(ts)} min")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
