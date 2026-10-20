"""Write results.txt: if the user's misjudgement shrinks as the spoon nears the lips, does the blind arm recover? Stdlib only."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_leanshrink.model import *

SEEDS = range(200)
AMP = 0.03
LEAN = 0.10
out = []
hdr = f"{'design':<20} {'shrink':>6} {'bias_mm':>7} {'fed':>5} {'safe':>5} {'touch':>6} {'peak_mean':>9}"
def row(label, d, shrink, bias):
    rs = [run_trial(d, AMP, s, LEAN, 0.0, bias, shrink) for s in SEEDS]; n = len(rs)
    out.append(f"{label:<20} {shrink:6.2f} {bias*1000:7.0f} {sum(r['entered'] for r in rs)/n:5.2f} "
               f"{sum(1 for r in rs if r['entered'] and r['peak'] <= F_SAFE)/n:5.2f} "
               f"{sum(1 for r in rs if r['contact_s'] > 0)/n:6.2f} {sum(r['peak'] for r in rs)/n:9.2f}")
designs = [("open loop, 0.20 m/s", Design("none", 0.20)), ("camera, 0.20 m/s", Design("camera", 0.20))]
out += [f"# Lean {LEAN*1000:.0f} mm/s, {AMP*1000:.0f} mm sway, no delay ({len(SEEDS)} paired trials per row; safe = fed with peak lip force <= {F_SAFE} N). shrink 0.00 rows reproduce osrobot-leannoise.", hdr]
for name, d in designs:
    for bias in (0.0, 0.01, 0.02, 0.04, 0.08):
        for shrink in (0.0, 0.5, 1.0): row(name, d, shrink, bias)
    out.append("")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
