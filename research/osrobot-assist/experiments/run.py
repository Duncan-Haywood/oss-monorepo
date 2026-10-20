"""Write results.txt: feeding designs against head sway, approach speed, and sensor latency. Stdlib only."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_assist.model import *

SEEDS = range(200)
out = []
def row(label, d, amp):
    r = summarise(d, amp, SEEDS)
    out.append(f"{label:<28} {amp*1000:5.0f} {r['success']:7.2f} {r['safe']:6.2f} {r['touch']:6.2f} {r['peak_mean']:9.2f} {r['peak_max']:8.2f} {r['time_mean']:8.2f}")
hdr = f"{'design':<28} {'amp_mm':>5} {'fed':>7} {'safe':>6} {'touch':>6} {'peak_mean':>9} {'peak_max':>8} {'time_s':>8}"

designs = [("open loop, 0.05 m/s", Design("none", 0.05)),
           ("open loop, 0.20 m/s", Design("none", 0.20)),
           ("camera, 0.05 m/s", Design("camera", 0.05)),
           ("camera, 0.20 m/s", Design("camera", 0.20)),
           ("camera, 0.20 m/s, 1 N cap", Design("camera", 0.20, f_cap=1.0)),
           ("camera, 0.20 m/s, 0.5 N cap", Design("camera", 0.20, f_cap=0.5))]
out += [f"# Sweep 1: design against head-sway amplitude ({len(SEEDS)} trials each; safe = fed with peak lip force <= {F_SAFE} N; touch = share of trials with any lip contact)", hdr]
for amp in (0.0, 0.01, 0.02, 0.03, 0.05):
    for name, d in designs: row(name, d, amp)
    out.append("")
out += [f"# Sweep 2: approach speed, camera design, sway amplitude 30 mm", hdr]
for v in (0.02, 0.05, 0.1, 0.2, 0.3, 0.5):
    row(f"camera, {v:.2f} m/s", Design("camera", v), 0.03)
out.append("")
out += [f"# Sweep 3: sensing latency, camera design at 0.10 m/s, sway amplitude 30 mm", hdr]
for dl in (0.0, 0.05, 0.1, 0.2, 0.4):
    row(f"camera, delay {dl:.2f} s", Design("camera", 0.10, delay=dl), 0.03)
out.append("")
out += [f"# Sweep 4: sensing noise, camera design at 0.10 m/s, sway amplitude 30 mm", hdr]
for sg in (0.0, 0.003, 0.006, 0.012):
    row(f"camera, noise {sg*1000:.0f} mm", Design("camera", 0.10, sigma=sg), 0.03)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
