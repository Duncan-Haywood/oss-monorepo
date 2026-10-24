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
# IFA Report 2/2022 (Behrens & Zimmermann, DGUV), Table 2: measured two-slope tissue stiffness c1 (soft, first contact) and c2 (stiff, deeper), N/mm.
# No lip row exists; the nearest head sites are used. 0.8 N/mm is the old assumed value.
import osrobot_assist.model as _m
_m.DT = 0.0005   # stiff walls need a finer step: at 2 ms the 90 N/mm peak is ~15% low (checked against 0.2 ms)
SOURCED = [("assumed (old default)", 800.0), ("masseter c1", 4300.0), ("temple c1", 10600.0), ("masseter c2", 16000.0), ("temple c2", 35600.0), ("forehead c1", 90100.0)]
out += [f"# Sweep 5: lip stiffness, camera design at 0.10 m/s, sway 30 mm (stiffness values: IFA Report 2/2022 Table 2; no lip row exists)", hdr]
for name, k in SOURCED:
    row(f"camera 0.10, k={k/1000:.1f} N/mm {name[:9]}", Design("camera", 0.10, k_lip=k), 0.03)
out.append("")
out += [f"# Sweep 6: same, camera design at 0.20 m/s, 1 N force cap", hdr]
for name, k in SOURCED:
    row(f"cap1 0.20, k={k/1000:.1f} N/mm {name[:9]}", Design("camera", 0.20, f_cap=1.0, k_lip=k), 0.03)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
