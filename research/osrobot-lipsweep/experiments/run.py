"""Write results.txt: does the lip stiffness or the force-loop gain set the peak force on the lips? Stdlib only.

The model is a copy of osrobot-assist's, run with its module constants K_LIP and KP overridden per row (KD keeps the
base damping ratio, KD = 2.56 sqrt(KP M)). Mouth sway 30 mm, camera design at 0.20 m/s, 200 seeds."""
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_lipsweep import model as m

SEEDS = range(200)
BASE = dict(K_LIP=m.K_LIP, KP=m.KP, KD=m.KD, LEAD=m.LEAD)
out = []
hdr = f"{'setting':<24} {'value':>7} {'fed':>5} {'safe':>5} {'touch':>6} {'peak_mean':>9} {'peak_max':>8} {'stall_KP*LEAD*v':>15}"

def run(label, value, v=0.20, amp=0.03, **over):
    for k, x in BASE.items(): setattr(m, k, x)
    for k, x in over.items(): setattr(m, k, x)
    if "KP" in over and "KD" not in over: m.KD = 2.56 * math.sqrt(m.KP * m.M_TIP)
    r = m.summarise(m.Design("camera", v), amp, SEEDS)
    out.append(f"{label:<24} {value:7g} {r['success']:5.2f} {r['safe']:5.2f} {r['touch']:6.2f} {r['peak_mean']:9.2f} {r['peak_max']:8.2f} {m.KP*m.LEAD*v:15.2f}")

out += [f"# Sweep 1: lip stiffness K_LIP (N/m), camera design at 0.20 m/s, 30 mm sway ({len(SEEDS)} trials; base K_LIP={BASE['K_LIP']:g})", hdr]
for k in (100, 200, 400, 800, 1600, 3200, 6400): run("K_LIP", k, K_LIP=k)
out.append("")
out += ["# Sweep 2: loop stiffness KP (N/m), KD scaled to keep the base damping ratio, K_LIP 800, camera at 0.20 m/s, 30 mm sway", hdr]
for kp in (100, 200, 400, 800, 1600): run("KP", kp, KP=kp)
out.append("")
out += ["# Sweep 3: forward reference lead LEAD (s), camera at 0.20 m/s, 30 mm sway", hdr]
for ld in (0.01, 0.02, 0.05, 0.10, 0.20): run("LEAD", ld, LEAD=ld)
out.append("")
out += ["# Sweep 4: K_LIP at a slow approach 0.05 m/s, 30 mm sway", hdr]
for k in (100, 400, 1600, 6400): run("K_LIP @0.05 m/s", k, v=0.05, K_LIP=k)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
