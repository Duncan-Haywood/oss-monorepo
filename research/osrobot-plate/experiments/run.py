"""Write results.txt: filling a 96-well plate, gantry against two-link arm, 1 against 8 channels. Stdlib only."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import osrobot_plate.model as m
from osrobot_plate.model import *

out = []
VOLS = (5, 10, 25, 50, 100, 200)
out.append("# Sweep 1: seconds per plate against volume per well (uL), serpentine order")
out.append(f"{'uL':>5} {'gantry_1ch':>11} {'gantry_8ch':>11} {'arm_1ch':>9} {'arm_8ch':>9}")
for v in VOLS:
    out.append(f"{v:5d} " + " ".join(f"{plate_time(k, ch, v):{w}.1f}" for k, ch, w in (("gantry", 1, 11), ("gantry", 8, 11), ("arm", 1, 9), ("arm", 8, 9))))
out.append("")
out.append("# Sweep 2: well order, 1 channel, 10 uL per well (seconds per plate)")
out.append(f"{'order':<12} {'gantry':>7} {'arm':>7}")
for o in ("row", "serpentine", "column"):
    out.append(f"{o:<12} {plate_time('gantry', 1, 10, o):7.1f} {plate_time('arm', 1, 10, o):7.1f}")
out.append("")
out.append("# Sweep 3: capital cost per plate/hour (USD), 10 uL per well, serpentine")
out.append(f"{'robot':<10} {'ch':>2} {'cap_USD':>8} {'plate_s':>8} {'USD_per_plate_h':>16}")
for k in ("gantry", "arm"):
    for ch in (1, 8):
        cap = COST[k] + (COST["head8"] if ch == 8 else COST["head1"])
        out.append(f"{k:<10} {ch:>2} {cap:8.0f} {plate_time(k, ch, 10):8.1f} {cost_per_plate_hour(k, ch, 10):16.1f}")
out.append("")
out.append("# Sweep 4: how the gantry speed and acceleration change its time per plate (1 channel, 10 uL; arm is 66.7 s)")
out.append(f"{'v_m/s':>6} {'a_m/s2':>7} {'gantry_s':>9} {'gantry_8ch_s':>13}")
base = dict(m.GANTRY)
for v, a in ((0.2, 1.5), (0.4, 3.0), (0.6, 4.5), (0.8, 6.0), (1.2, 9.0)):
    m.GANTRY.update(v=v, a=a)
    out.append(f"{v:6.2f} {a:7.1f} {plate_time('gantry', 1, 10):9.1f} {plate_time('gantry', 8, 10):13.1f}")
m.GANTRY.update(base)
out.append("")
out.append("# Sweep 5: arm joint speed scale (1 channel, 10 uL; gantry is 69.7 s)")
out.append(f"{'w_rad/s':>7} {'alpha':>6} {'arm_s':>7} {'arm_8ch_s':>10}")
base = dict(m.ARM)
for w, al in ((0.5, 3.0), (1.0, 6.0), (2.0, 12.0), (4.0, 24.0)):
    m.ARM.update(w=w, alpha=al)
    out.append(f"{w:7.1f} {al:6.1f} {plate_time('arm', 1, 10):7.1f} {plate_time('arm', 8, 10):10.1f}")
m.ARM.update(base)
out.append("")
out.append(f"# Sweep 6: chance the whole plate is dispensed within {WELL_TOL*1000:.1f} mm of every well centre")
out.append(f"{'robot':<10} {'ch':>2} {'hit_prob_per_dispense_min':>26} {'whole_plate':>12}")
for k in ("gantry", "arm"):
    for ch in (1, 8):
        mn = min(hit_prob(k, p) for p in targets(ch, "serpentine"))
        out.append(f"{k:<10} {ch:>2} {mn:26.6f} {plate_success(k, ch):12.4f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
