"""Write results.txt: does a user who leans toward the spoon substitute for the camera? Stdlib only."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_lean.model import *

SEEDS = range(200)
out = []
hdr = f"{'design':<22} {'lean_mm/s':>9} {'fed':>5} {'safe':>5} {'touch':>6} {'peak_mean':>9} {'peak_max':>8} {'time_s':>7}"
def row(label, d, amp, lean):
    rs = [run_trial(d, amp, s, lean) for s in SEEDS]; n = len(rs); ok = [r for r in rs if r["entered"]]
    out.append(f"{label:<22} {lean*1000:9.0f} {len(ok)/n:5.2f} {sum(1 for r in ok if r['peak'] <= F_SAFE)/n:5.2f} "
               f"{sum(1 for r in rs if r['contact_s'] > 0)/n:6.2f} {sum(r['peak'] for r in rs)/n:9.2f} {max(r['peak'] for r in rs):8.2f} "
               f"{(sum(r['t'] for r in ok)/len(ok)) if ok else float('nan'):7.2f}")
designs = [("open loop, 0.10 m/s", Design("none", 0.10)), ("camera, 0.10 m/s", Design("camera", 0.10)),
           ("open loop, 0.20 m/s", Design("none", 0.20)), ("camera, 0.20 m/s", Design("camera", 0.20))]
for amp in (0.03, 0.05):
    out += [f"# Lean speed sweep at {amp*1000:.0f} mm sway ({len(SEEDS)} paired trials per row; safe = fed with peak lip force <= {F_SAFE} N)", hdr]
    for name, d in designs:
        for lean in (0.0, 0.01, 0.02, 0.05, 0.10): row(name, d, amp, lean)
        out.append("")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
